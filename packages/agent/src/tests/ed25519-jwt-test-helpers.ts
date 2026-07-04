import { encodeBase64UrlBytes, encodeBase64UrlJson } from '../domain/security/base64url';
import {
  parseControlPlaneTrustConfig,
  resolveControlPlaneTrustKey,
} from '../domain/security/trust-config';

import type {
  ClientServiceJwtReplayReservationInput,
  ClientServiceJwtReplayReservationResult,
} from '../domain/security/replay';
import type { AgentControlPlanePrincipalType } from '../domain/security/types';

const textEncoder = new TextEncoder();

/**
 * Agent Ed25519 JWT tests で共有する trust fixture です。
 */
export interface Ed25519TrustFixture {
  readonly fingerprint: string;
  readonly issuer: string;
  readonly kid: string;
  readonly privateKey: CryptoKey;
  readonly publicJwk: JsonWebKey;
  readonly trustConfigJson: string;
}

/**
 * Ed25519 trust fixture 生成時に上書きできる policy 入力です。
 */
export interface CreateEd25519TrustFixtureInput {
  readonly allowedAgentIds?: readonly string[];
  readonly allowedScopes?: readonly string[];
  readonly audience?: string;
  readonly issuer?: string;
  readonly kid?: string;
  readonly principalType?: AgentControlPlanePrincipalType;
  readonly status?: 'active' | 'retiring' | 'revoked';
}

/**
 * Test 用 Ed25519 key pair と public-only trust config JSON を生成します。
 */
export async function createEd25519TrustFixture(
  input: CreateEd25519TrustFixtureInput = {}
): Promise<Ed25519TrustFixture> {
  const issuer = input.issuer ?? 'cf-tamac-client';
  const kid = input.kid ?? 'client-key-1';
  const keyPair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair;
  const publicJwk = (await crypto.subtle.exportKey('jwk', keyPair.publicKey)) as JsonWebKey;
  if (typeof publicJwk.x !== 'string') {
    throw new TypeError('Ed25519 public JWK x is required for tests.');
  }
  const trustConfigJson = JSON.stringify({
    audiences: [input.audience ?? 'test-audience'],
    issuers: [
      {
        issuer,
        keys: [
          {
            allowedAgentIds: input.allowedAgentIds ?? ['agent-alpha'],
            allowedScopes: input.allowedScopes ?? [
              'agent:read',
              'agent:write',
              'agent:tool:approve',
              'agent:integration:admin',
              'agent:admin',
            ],
            crv: 'Ed25519',
            kid,
            kty: 'OKP',
            principalType: input.principalType ?? 'CLIENT_SERVICE',
            status: input.status ?? 'active',
            x: publicJwk.x,
          },
        ],
      },
    ],
    version: 1,
  });
  const config = await parseControlPlaneTrustConfig(trustConfigJson, 1_700_000_000_000);
  const resolved = resolveControlPlaneTrustKey(config, issuer, kid);
  if (resolved.status !== 'found') {
    throw new TypeError('trust fixture key resolution failed.');
  }
  return {
    fingerprint: resolved.key.fingerprint,
    issuer,
    kid,
    privateKey: keyPair.privateKey,
    publicJwk,
    trustConfigJson,
  };
}

/**
 * Test 用 Client Service compact JWT を Ed25519 private key で署名します。
 */
export async function signEd25519ClientJwt(input: {
  readonly alg?: string;
  readonly kid?: string;
  readonly payload: Readonly<Record<string, unknown>>;
  readonly privateKey: CryptoKey;
  readonly signaturePrivateKey?: CryptoKey;
}): Promise<string> {
  const encodedHeader = encodeBase64UrlJson({
    alg: input.alg ?? 'EdDSA',
    kid: input.kid,
    typ: 'JWT',
  });
  const encodedPayload = encodeBase64UrlJson(input.payload);
  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = await crypto.subtle.sign(
    { name: 'Ed25519' },
    input.signaturePrivateKey ?? input.privateKey,
    textEncoder.encode(signingInput)
  );
  return `${signingInput}.${encodeBase64UrlBytes(new Uint8Array(signature))}`;
}

/**
 * Client Service JWT tests で使う標準 payload を作成します。
 */
export function createClientServiceJwtPayload(input: {
  readonly actingUserId?: string;
  readonly agentId?: string;
  readonly audience?: string | readonly string[];
  readonly expiresInSeconds?: number;
  readonly fingerprint?: string;
  readonly issuer?: string;
  readonly jwtId?: string;
  readonly notBeforeOffsetSeconds?: number;
  readonly nowUnixSeconds?: number;
  readonly scopes?: readonly string[];
  readonly subject?: string;
}): Readonly<Record<string, unknown>> {
  const now = input.nowUnixSeconds ?? Math.floor(Date.now() / 1000);
  return {
    acting_user_id: input.actingUserId ?? 'user-1',
    agent_id: input.agentId ?? 'agent-alpha',
    aud: input.audience ?? 'test-audience',
    exp: now + (input.expiresInSeconds ?? 120),
    iss: input.issuer ?? 'cf-tamac-client',
    jti: input.jwtId ?? crypto.randomUUID(),
    key_fingerprint: input.fingerprint,
    nbf: now + (input.notBeforeOffsetSeconds ?? -10),
    scopes: input.scopes ?? ['agent:read'],
    sub: input.subject ?? 'client-service-principal',
  };
}

/**
 * Test fake Durable Object が使う in-memory `jti` replay reservation を作成します。
 */
export function createMemoryJwtReplayReservation(): (
  input: ClientServiceJwtReplayReservationInput
) => ClientServiceJwtReplayReservationResult {
  const seen = new Map<string, number>();
  return (input) => {
    const key = `${input.agentId}:${input.principalReplayId}:${input.jwtId}`;
    const firstSeen = seen.get(key);
    if (firstSeen !== undefined && firstSeen < input.expiresAtUnixMs) {
      return { firstSeenUnixMs: firstSeen, status: 'replay' };
    }
    seen.set(key, input.nowUnixMs);
    return { status: 'reserved' };
  };
}
