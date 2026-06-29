import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import {
  createAgentRpcAuthInterceptor,
  createClientServiceJwt,
  type AgentRpcCredentialMetadata,
  type ResolvedAgentRpcCredential,
} from '../server/agent-rpc/authentication';
import { createE2eFakeAgentRpcClients } from '../server/agent-rpc/e2e-fake-clients';
import {
  AgentRpcOperationError,
  normalizeAgentRpcError,
  withAgentRpcErrorNormalization,
} from '../server/agent-rpc/errors';
import {
  toBrowserSafeCredentialReference,
  toBrowserSafeCredentialReferences,
  toBrowserSafeSigningKey,
  toBrowserSafeSigningKeys,
} from '../server/credentials/browser-safe';
import { resolveProviderCredentialSecret } from '../server/credentials/secret-resolution';
import {
  generateEd25519SigningKeyMaterial,
  mapClientStatusToTrustStatus,
  resolveEd25519PrivateKey,
  computePublicJwkFingerprint,
} from '../server/credentials/signing-keys';

import type { CredentialReferenceRecord } from '../server/db/access-credentials';

const TEST_ENCRYPTION_KEY_BASE64 = Buffer.alloc(32, 7).toString('base64');

function makeCredentialRecord(
  overrides: Partial<CredentialReferenceRecord> = {}
): CredentialReferenceRecord {
  return {
    agentId: 'agent-alpha',
    credentialRef: 'wrangler-secret:agent-alpha-credential',
    keyId: 'key-001',
    publicFingerprint: 'sha256:abcdef',
    maskedHint: '****-****-****-001',
    status: 'active',
    createdAtMs: 1000,
    updatedAtMs: 2000,
    ...overrides,
  };
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}

async function buildEd25519Credential(
  overrides: Partial<ResolvedAgentRpcCredential> = {}
): Promise<ResolvedAgentRpcCredential> {
  const material = await generateEd25519SigningKeyMaterial(TEST_ENCRYPTION_KEY_BASE64);
  const privateKey = await resolveEd25519PrivateKey(
    TEST_ENCRYPTION_KEY_BASE64,
    material.privateJwkCiphertext
  );
  const base: ResolvedAgentRpcCredential = {
    agentId: 'agent-alpha',
    issuer: material.issuer,
    keyId: material.keyId,
    publicFingerprint: material.publicFingerprint,
    publicJwk: material.publicJwk,
    privateKey,
    actingUser: { operatorId: 'operator-001', scopes: ['agent:read', 'agent:write'] },
  };
  return { ...base, ...overrides };
}

describe('Server-side Agent RPC client factory', () => {
  it('[CLIENT-REGISTRY-S003] generated Connect factory stays server-only and binary', () => {
    const source = readFileSync(
      fileURLToPath(new URL('../server/agent-rpc/create-client.ts', import.meta.url).href),
      'utf8'
    );

    expect(source).toContain("import 'server-only';");
    expect(source).toContain("import { createClient, type Client } from '@connectrpc/connect';");
    expect(source).toContain("import { createConnectTransport } from '@connectrpc/connect-web';");
    expect(source).toContain('@cf-tamac/client-agent-rpc/cftamac/agent/v1_pb');
    expect(source).toContain('useBinaryFormat: true');
    expect(source).toContain('useHttpGet: false');
    expect(source).toContain('createClient(AgentLifecycleService, transport)');
    expect(source).toContain('createClient(AgentModelPolicyService, transport)');
    expect(source).toContain('createClient(AgentStateService, transport)');
  });

  it('[AGENT-MANAGEMENT-UI-S018] E2E fake safe metadata digest matches inline bytes', async () => {
    const clients = createE2eFakeAgentRpcClients('agent-alpha');
    const getModelPolicy = clients.modelPolicies.getModelPolicy as unknown as (
      request: Record<string, unknown>
    ) => Promise<Record<string, unknown>>;

    const response = await getModelPolicy({
      agentId: 'agent-alpha',
      policyRef: 'workers-ai-default',
    });
    const policy = readRecord(response.policy);
    const safeMetadataRef = readRecord(policy?.safeMetadataRef);
    const inlineBytes = safeMetadataRef?.inlineBytes;

    expect(inlineBytes).toBeInstanceOf(Uint8Array);
    expect(safeMetadataRef?.sha256).toBe(
      createHash('sha256')
        .update(inlineBytes instanceof Uint8Array ? inlineBytes : new Uint8Array())
        .digest('hex')
    );
  });

  it('[CLIENT-REGISTRY-S003] auth interceptor emits EdDSA Bearer JWT without reference headers', async () => {
    const credential = await buildEd25519Credential();
    const captured = await captureInterceptorHeaders(credential);

    expect(captured.authorization).toMatch(/^Bearer (?:[\w-]+\.){2}[\w-]+$/);
    expect(captured.headerKeys).not.toContain('x-client-credential-ref');
    expect(captured.headerKeys).not.toContain('x-client-key-id');
    expect(captured.headerKeys).not.toContain('x-agent-id');
    const token = captured.authorization.slice('Bearer '.length);
    const segments = token.split('.');
    expect(segments).toHaveLength(3);
    const payloadSegment = segments[1];
    if (typeof payloadSegment !== 'string') {
      throw new TypeError('payload segment missing');
    }
    const decoded = JSON.parse(Buffer.from(payloadSegment, 'base64url').toString('utf8')) as Record<
      string,
      unknown
    >;
    expect(decoded.iss).toBe(credential.issuer);
    expect(decoded.sub).toBe(credential.keyId);
    expect(decoded.agent_id).toBe(credential.agentId);
    expect(decoded.acting_user_id).toBe('operator-001');
    expect(decoded.fingerprint).toBe(credential.publicFingerprint);
  });

  it('[CLIENT-REGISTRY-S003] Client Service JWT signs EdDSA without exposing secret material', async () => {
    const credential = await buildEd25519Credential();
    const jwt = await createClientServiceJwt(credential);
    const segments = jwt.split('.');
    expect(segments).toHaveLength(3);
    const headerSegment = segments[0];
    if (typeof headerSegment !== 'string') {
      throw new TypeError('header segment missing');
    }
    const headerJson = JSON.parse(
      Buffer.from(headerSegment, 'base64url').toString('utf8')
    ) as Record<string, unknown>;
    expect(headerJson.alg).toBe('EdDSA');
    expect(headerJson.kid).toBe(credential.keyId);
    expect(jwt).not.toContain('privateJwk');
    expect(jwt).not.toContain('private_jwk');
    expect(jwt).not.toContain('encrypted');
  });

  it('[CLIENT-REGISTRY-S011] Client Service JWT awaits signing key usage touch after successful signing', async () => {
    const onJwtSigned: NonNullable<ResolvedAgentRpcCredential['onJwtSigned']> = vi.fn(() => {
      // test callback は Client D1 touch 相当の非同期処理を模倣する。
      return Promise.resolve();
    });
    const credential = await buildEd25519Credential({ onJwtSigned });

    const jwt = await createClientServiceJwt(credential);

    expect(jwt).toMatch(/^(?:[\w-]+\.){2}[\w-]+$/);
    expect(onJwtSigned).toHaveBeenCalledTimes(1);
  });

  it('[CLIENT-REGISTRY-S011] Client Service JWT fails closed when signing key usage touch fails', async () => {
    const onJwtSigned: NonNullable<ResolvedAgentRpcCredential['onJwtSigned']> = vi.fn(() => {
      // last-used metadata が更新できない状態を再現し、署名済み JWT を送信しないことを確認する。
      return Promise.reject(new Error('signing key usage touch failed'));
    });
    const credential = await buildEd25519Credential({ onJwtSigned });

    await expect(createClientServiceJwt(credential)).rejects.toThrow(
      'signing key usage touch failed'
    );
    expect(onJwtSigned).toHaveBeenCalledTimes(1);
  });

  it('[CLIENT-REGISTRY-S011] Agent RPC signing source is Ed25519 store only (no credentialRef/AGENT_CREDENTIAL_*/HS256)', async () => {
    const authenticationSource = readFileSync(
      fileURLToPath(new URL('../server/agent-rpc/authentication.ts', import.meta.url).href),
      'utf8'
    );
    const loaderSource = readFileSync(
      fileURLToPath(new URL('../server/agent-rpc/agent-loader.ts', import.meta.url).href),
      'utf8'
    );
    const modelPoliciesSource = readFileSync(
      fileURLToPath(new URL('../server/actions/model-policies.ts', import.meta.url).href),
      'utf8'
    );

    // HS256 signing と credentialRef/secretMaterial は署名経路から撤去済みであること。
    expect(authenticationSource).not.toMatch(/\bHS256\b/);
    expect(authenticationSource).not.toMatch(/secretMaterial/);
    expect(authenticationSource).not.toMatch(/credentialRef/);
    expect(authenticationSource).toContain('EdDSA');
    expect(authenticationSource).toContain('await credential.onJwtSigned?.()');
    expect(loaderSource).toContain('createSigningKeyRepository');
    expect(loaderSource).toContain('resolveEd25519PrivateKey');
    expect(loaderSource).toContain('onJwtSigned: () => signingKeys.touchSigningKeyLastUsed(');
    expect(modelPoliciesSource).toContain(
      'onJwtSigned: () => signingKeys.touchSigningKeyLastUsed('
    );
    expect(loaderSource).not.toMatch(/resolveCredentialSecret|resolveProviderCredentialSecret/);

    // Provider credential resolver は PROVIDER_CREDENTIAL_ prefix だけを受け付ける。
    const env = {
      CLIENT_DB: {},
      AGENT_RPC_DEFAULT_ORIGIN: 'http://localhost:8787',
      CLIENT_CREDENTIAL_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY_BASE64,
      PROVIDER_CREDENTIAL_ALPHA: 'provider-secret-value',
      AGENT_CREDENTIAL_LEGACY: 'legacy-value',
    } as unknown as Parameters<typeof resolveProviderCredentialSecret>[0];

    await expect(
      resolveProviderCredentialSecret(env, 'agent-alpha', 'AGENT_CREDENTIAL_LEGACY')
    ).rejects.toThrow();
    await expect(
      resolveProviderCredentialSecret(env, 'agent-alpha', 'CLIENT_DB')
    ).rejects.toThrow();
    const resolved = await resolveProviderCredentialSecret(
      env,
      'agent-alpha',
      'PROVIDER_CREDENTIAL_ALPHA'
    );
    expect(resolved.secretMaterial).toBe('provider-secret-value');
  });

  it('[CLIENT-REGISTRY-S008] fingerprint matches between generated public JWK and managed Agent metadata', async () => {
    const material = await generateEd25519SigningKeyMaterial(TEST_ENCRYPTION_KEY_BASE64);
    const recomputed = await computePublicJwkFingerprint(material.publicJwk);
    expect(recomputed).toBe(material.publicFingerprint);
    // managed Agent metadata は同じ fingerprint 文字列を保持し、loader が照合する。
    const fakeMetadata: AgentRpcCredentialMetadata = {
      agentId: 'agent-alpha',
      issuer: material.issuer,
      keyId: material.keyId,
      publicFingerprint: material.publicFingerprint,
      publicJwk: material.publicJwk,
    };
    expect(fakeMetadata.publicFingerprint).toBe(recomputed);
  });

  it('[CLIENT-REGISTRY-S007] disabled/deleted key status maps to revoked and signs must be rejected', () => {
    expect(mapClientStatusToTrustStatus('active')).toBe('active');
    expect(mapClientStatusToTrustStatus('disabled')).toBe('revoked');
    expect(mapClientStatusToTrustStatus('deleted')).toBe('revoked');
  });

  it('[CLIENT-REGISTRY-S003] RPC error normalization maps errors to browser-safe messages', () => {
    const error = new Error('permission denied: insufficient scope');
    const normalized = normalizeAgentRpcError(error);
    expect(normalized).toBeInstanceOf(AgentRpcOperationError);
    expect(normalized.category).toBe('internal');
    expect(normalized.message).not.toContain('permission denied');
    expect(normalized.message).not.toContain('insufficient scope');
  });

  it('[CLIENT-REGISTRY-S003] withAgentRpcErrorNormalization wraps thrown errors', async () => {
    await expect(
      withAgentRpcErrorNormalization(() => Promise.reject(new Error('connect failure')))
    ).rejects.toBeInstanceOf(AgentRpcOperationError);

    const result = await withAgentRpcErrorNormalization(() => Promise.resolve('ok'));
    expect(result).toBe('ok');
  });
});

describe('Browser-safe credential and signing key serialization', () => {
  it('[CLIENT-REGISTRY-S002] browser-safe credential reference excludes secret lookup material', () => {
    const record = makeCredentialRecord();
    const safe = toBrowserSafeCredentialReference(record);
    const safeKeys = Object.keys(safe);

    expect(safeKeys).toContain('agentId');
    expect(safeKeys).toContain('keyId');
    expect(safeKeys).toContain('maskedHint');
    expect(safeKeys).toContain('status');
    expect(safeKeys).not.toContain('credentialRef');
    expect(safeKeys).not.toContain('publicFingerprint');
    expect(safeKeys).not.toContain('secretMaterial');
    expect(safeKeys).not.toContain('secret');
  });

  it('toBrowserSafeCredentialReferences maps lists', () => {
    const records = [
      makeCredentialRecord({ keyId: 'key-001' }),
      makeCredentialRecord({ keyId: 'key-002' }),
    ];
    const safe = toBrowserSafeCredentialReferences(records);
    expect(safe).toHaveLength(2);
    expect(safe[0]?.keyId).toBe('key-001');
    expect(safe[1]?.keyId).toBe('key-002');
  });

  it('[CLIENT-REGISTRY-S006] browser-safe signing key excludes private JWK material', () => {
    const signingKey = {
      issuer: 'cf-tamac-client',
      keyId: 'key-001',
      publicJwk: '{"kty":"OKP","crv":"Ed25519","x":"abc"}',
      publicFingerprint: 'sha256_b64u:abc',
      privateJwkCiphertext: '{"v":1,"iv":"i","ct":"c"}',
      status: 'active' as const,
      isDefault: true,
      createdAtMs: 1000,
      updatedAtMs: 2000,
      lastUsedAtMs: 3000,
    };
    const safe = toBrowserSafeSigningKey(signingKey);
    const safeKeys = Object.keys(safe);

    expect(safeKeys).toContain('issuer');
    expect(safeKeys).toContain('keyId');
    expect(safeKeys).toContain('publicJwk');
    expect(safeKeys).toContain('publicFingerprint');
    expect(safeKeys).not.toContain('privateJwkCiphertext');
    expect(safeKeys).not.toContain('privateJwk');
    expect(safeKeys).not.toContain('d');
    expect(safeKeys).not.toContain('secretMaterial');

    const list = toBrowserSafeSigningKeys([signingKey]);
    expect(list).toHaveLength(1);
    const firstKey = list[0];
    if (firstKey === undefined) {
      throw new Error('browser-safe signing key missing');
    }
    expect(Object.keys(firstKey)).not.toContain('privateJwkCiphertext');
  });
});

/**
 * Interceptor が request header へ設定した値を記録する test helper。
 *
 * @remarks Authorization / header key 一覧を返し、参照 header が含まれないことを検査する。
 */
async function captureInterceptorHeaders(credential: ResolvedAgentRpcCredential): Promise<{
  readonly authorization: string;
  readonly headerKeys: readonly string[];
}> {
  let authorization = '';
  const headerKeys: string[] = [];
  const interceptor = createAgentRpcAuthInterceptor(credential);
  await interceptor((request) => {
    authorization = request.header.get('Authorization') ?? '';
    for (const key of request.header.keys()) {
      headerKeys.push(key);
    }
    return Promise.resolve({ status: 200 } as never);
  })({
    header: new Headers(),
    httpVersion: '2',
    method: 'POST',
    protocol: 'https',
    signal: undefined,
    url: 'https://agent.example.com/rpc',
    body: new Uint8Array(),
  } as never);
  return { authorization, headerKeys };
}
