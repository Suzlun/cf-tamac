import 'server-only';

import type { Interceptor } from '@connectrpc/connect';

/**
 * Agent RPC に付与する acting user context。
 *
 * @remarks Browser から受け取った値ではなく、Client の server-only 認証境界で検証済みの
 * operator identity と scope だけを保持する。
 */
export interface ActingUserContext {
  readonly operatorId: string;
  readonly scopes: readonly string[];
}

/**
 * Server-only Agent RPC credential reference metadata。
 *
 * @remarks credentialRef/keyId は参照識別子であり、JWT 署名用 material は別途
 * `ResolvedAgentRpcCredential` の `secretMaterial` として server-only に解決する。
 */
export interface AgentRpcCredentialMetadata {
  readonly agentId: string;
  readonly credentialRef: string;
  readonly keyId: string;
  readonly actingUser?: ActingUserContext;
}

/**
 * Server-only Agent RPC credential with resolved signing material。
 *
 * @remarks `secretMaterial` は短時間 Client Service JWT の HMAC signing key として使い、
 * Browser response、log、Client D1 record へは渡さない。
 */
export interface ResolvedAgentRpcCredential extends AgentRpcCredentialMetadata {
  readonly secretMaterial: string;
}

interface ClientServiceJwtPayload {
  readonly iss: string;
  readonly sub: string;
  readonly jti: string;
  readonly aud: string;
  readonly exp: number;
  readonly nbf: number;
  readonly agent_id: string;
  readonly scopes: readonly string[];
  readonly acting_user_id: string;
}

const CLIENT_SERVICE_ISSUER = 'cf-tamac-client';
const CLIENT_SERVICE_AUDIENCE = 'agent service';
const CLIENT_SERVICE_JWT_TTL_SECONDS = 300;

/**
 * Server-side Agent RPC calls に付与する参照 header を作成する。
 *
 * @param metadata - Agent ID、credential reference、key ID、acting user context。
 * @returns Agent RPC transport に追加する Headers。secret material は含めない。
 */
export function createAgentRpcAuthHeaders(metadata: AgentRpcCredentialMetadata): Headers {
  const headers = new Headers();
  headers.set('x-agent-id', metadata.agentId);
  headers.set('x-client-credential-ref', metadata.credentialRef);
  headers.set('x-client-key-id', metadata.keyId);
  if (metadata.actingUser !== undefined && metadata.actingUser.operatorId !== '') {
    headers.set('x-client-acting-operator-id', metadata.actingUser.operatorId);
    if (metadata.actingUser.scopes.length > 0) {
      headers.set('x-client-acting-scopes', metadata.actingUser.scopes.join(' '));
    }
  }
  return headers;
}

/**
 * 短時間 Client Service JWT を生成する。
 *
 * @param credential - server-only に解決済みの Agent RPC credential。
 * @returns Agent Service が検証できる署名済み compact JWT。
 * @throws signing material または acting user context が欠落している場合は TypeError。
 */
export async function createClientServiceJwt(
  credential: ResolvedAgentRpcCredential
): Promise<string> {
  const actingUser = requireActingUser(credential);
  const now = Math.floor(Date.now() / 1000);
  const payload: ClientServiceJwtPayload = {
    iss: CLIENT_SERVICE_ISSUER,
    sub: credential.keyId,
    jti: createJwtId(),
    aud: CLIENT_SERVICE_AUDIENCE,
    exp: now + CLIENT_SERVICE_JWT_TTL_SECONDS,
    nbf: now,
    agent_id: credential.agentId,
    scopes: actingUser.scopes,
    acting_user_id: actingUser.operatorId,
  };
  return signJwt(payload, credential.keyId, credential.secretMaterial);
}

/**
 * Connect interceptor として Client Service JWT と安全な参照 header を付与する。
 *
 * @param credential - server-only に解決済みの Agent RPC credential。
 * @returns Connect unary request に認証 metadata を追加する interceptor。
 */
export function createAgentRpcAuthInterceptor(credential: ResolvedAgentRpcCredential): Interceptor {
  return (next) => async (request) => {
    const headers = createAgentRpcAuthHeaders(credential);
    headers.set('Authorization', `Bearer ${await createClientServiceJwt(credential)}`);
    for (const [key, value] of headers) {
      request.header.set(key, value);
    }
    return next(request);
  };
}

function requireActingUser(credential: ResolvedAgentRpcCredential): ActingUserContext {
  if (credential.secretMaterial === '') {
    throw new TypeError('Agent RPC signing material is not configured.');
  }
  if (credential.actingUser === undefined || credential.actingUser.operatorId === '') {
    throw new TypeError('Acting user context is not configured.');
  }
  if (credential.actingUser.scopes.length === 0) {
    throw new TypeError('Acting user scopes are not configured.');
  }
  return credential.actingUser;
}

async function signJwt(
  payload: ClientServiceJwtPayload,
  keyId: string,
  secretMaterial: string
): Promise<string> {
  const header = { alg: 'HS256', typ: 'JWT', kid: keyId } as const;
  const signingInput = `${encodeBase64UrlJson(header)}.${encodeBase64UrlJson(payload)}`;
  const signature = await signHmacSha256(signingInput, secretMaterial);
  return `${signingInput}.${encodeBase64UrlBytes(new Uint8Array(signature))}`;
}

async function signHmacSha256(signingInput: string, secretMaterial: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    encoder.encode(secretMaterial),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return globalThis.crypto.subtle.sign('HMAC', key, encoder.encode(signingInput));
}

function encodeBase64UrlJson(value: unknown): string {
  return encodeBase64UrlBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function encodeBase64UrlBytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function createJwtId(): string {
  return globalThis.crypto.randomUUID();
}
