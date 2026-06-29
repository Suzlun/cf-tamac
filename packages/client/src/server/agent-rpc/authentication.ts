import 'server-only';

import type { Ed25519PublicJwk } from '../credentials/signing-keys';
import type { Interceptor } from '@connectrpc/connect';

/**
 * Agent RPC に付与する acting user context。
 *
 * @remarks Browser から受け取った値ではなく、Client の server-only 認証境界で検証済みの
 * operator identity と scope だけを保持する。JWT payload の `acting_user_id` / `scopes` になる。
 */
export interface ActingUserContext {
  readonly operatorId: string;
  readonly scopes: readonly string[];
}

/**
 * Server-only Agent RPC 署名鍵 metadata と復号済み Ed25519 秘密鍵。
 *
 * @remarks
 * Ed25519 signing key store だけを Agent RPC bearer JWT の署名 source にする。
 * `privateKey` は Web Crypto の CryptoKey であり、browser・log・Server Action 戻り値・Client D1 へ
 * 絶対に直列化しない。共有 secret / Worker Secret 参照経路は撤去済みであり、
 * この interface は公開鍵・fingerprint・ issuer / kid のみを扱う。
 */
export interface AgentRpcCredentialMetadata {
  readonly agentId: string;
  readonly issuer: string;
  readonly keyId: string;
  readonly publicFingerprint: string;
  readonly publicJwk: Ed25519PublicJwk;
  readonly actingUser?: ActingUserContext;
}

/**
 * Server-only に復号した Ed25519 秘密鍵を含む Agent RPC credential。
 *
 * @remarks
 * `privateKey` を JWT 署名だけに使い、署名後に server-only scope から落とす。
 * この型は `packages/client/src/server/agent-rpc/**` と server-only credentials helper の間でのみ扱う。
 */
export interface ResolvedAgentRpcCredential extends AgentRpcCredentialMetadata {
  readonly privateKey: CryptoKey;
  /**
   * JWT 署名が成功した直後に signing key の利用時刻を server-only store へ反映する callback。
   *
   * @remarks
   * 関数値は browser payload へ直列化できない server-only seam として扱い、Client D1 の
   * `lastUsedAtMs` 更新以外の秘密情報を返さない。失敗時は JWT を返さず Agent RPC 呼び出しを止める。
   */
  readonly onJwtSigned?: () => Promise<void>;
}

interface ClientServiceJwtHeader {
  readonly alg: 'EdDSA';
  readonly typ: 'JWT';
  readonly kid: string;
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
  readonly fingerprint: string;
}

const CLIENT_SERVICE_AUDIENCE = 'agent service';
const CLIENT_SERVICE_JWT_TTL_SECONDS = 300;

/**
 * 短時間 Client Service EdDSA compact JWT を生成する。
 *
 * @param credential - server-only に復号した Ed25519 秘密鍵と署名 metadata。
 * @returns Agent Service が `AGENT_CONTROL_PLANE_TRUST` で検証できる署名済み compact JWT。
 * @throws acting user context が未設定の場合、Ed25519 署名に失敗した場合、または利用時刻更新に
 * 失敗した場合は fail closed で error。
 * @remarks
 * JWT payload は `iss`、`sub`(=keyId)、`aud`、`agent_id`、`scopes`、`acting_user_id`、
 * `jti`、`nbf`、`exp`、`fingerprint` に限定し、秘密鍵 material を含めない。
 * `acting_user_id` と `scopes` は server-only 設定からだけ導出し、browser 入力は使わない。
 */
export async function createClientServiceJwt(
  credential: ResolvedAgentRpcCredential
): Promise<string> {
  const actingUser = requireActingUser(credential);
  const now = Math.floor(Date.now() / 1000);
  const header: ClientServiceJwtHeader = {
    alg: 'EdDSA',
    typ: 'JWT',
    kid: credential.keyId,
  };
  const payload: ClientServiceJwtPayload = {
    iss: credential.issuer,
    sub: credential.keyId,
    jti: createJwtId(),
    aud: CLIENT_SERVICE_AUDIENCE,
    exp: now + CLIENT_SERVICE_JWT_TTL_SECONDS,
    nbf: now,
    agent_id: credential.agentId,
    scopes: actingUser.scopes,
    acting_user_id: actingUser.operatorId,
    fingerprint: credential.publicFingerprint,
  };
  const jwt = await signEdDsaJwt(header, payload, credential.privateKey);
  // JWT 署名が成功した後、送信前に last-used metadata を更新する。
  // 更新に失敗した場合は署名済み JWT を返さず、未追跡の Agent RPC 利用を防ぐ。
  await credential.onJwtSigned?.();
  return jwt;
}

/**
 * Connect interceptor として Client Service EdDSA JWT bearer metadata を付与する。
 *
 * @param credential - server-only に復号した Ed25519 秘密鍵と署名 metadata。
 * @returns Connect unary request に `Authorization: Bearer <jwt>` を付与する interceptor。
 * @remarks
 * 他の `x-client-*` / `x-agent-id` 参照 header は一切使わず、JWT payload だけが認証情報を運ぶ。
 * これにより browser へ漏れうる server response に credential lookup material が残らない。
 */
export function createAgentRpcAuthInterceptor(credential: ResolvedAgentRpcCredential): Interceptor {
  return (next) => async (request) => {
    const jwt = await createClientServiceJwt(credential);
    request.header.set('Authorization', `Bearer ${jwt}`);
    return next(request);
  };
}

function requireActingUser(credential: ResolvedAgentRpcCredential): ActingUserContext {
  if (credential.actingUser === undefined || credential.actingUser.operatorId === '') {
    throw new TypeError('Acting user context is not configured.');
  }
  if (credential.actingUser.scopes.length === 0) {
    throw new TypeError('Acting user scopes are not configured.');
  }
  return credential.actingUser;
}

async function signEdDsaJwt(
  header: ClientServiceJwtHeader,
  payload: ClientServiceJwtPayload,
  privateKey: CryptoKey
): Promise<string> {
  const signingInput = `${encodeBase64UrlJson(header)}.${encodeBase64UrlJson(payload)}`;
  const signature = await globalThis.crypto.subtle.sign(
    'Ed25519',
    privateKey,
    copyToArrayBuffer(new TextEncoder().encode(signingInput))
  );
  const signaturePart = encodeBase64Url(new Uint8Array(signature));
  return `${signingInput}.${signaturePart}`;
}

function encodeBase64UrlJson(value: unknown): string {
  return encodeBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function encodeBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

/**
 * Uint8Array を確実な `ArrayBuffer` へコピーする。
 *
 * @remarks Ed25519 署名 API が `ArrayBuffer` backed BufferSource を要求するため、
 * SharedArrayBuffer の可能性を排除する。戻り値は server-only scope だけで扱う。
 */
function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function createJwtId(): string {
  return globalThis.crypto.randomUUID();
}
