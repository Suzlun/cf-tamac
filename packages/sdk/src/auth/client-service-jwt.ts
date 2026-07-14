import type { TamacAgentRpcMethodContext, TamacSdkInvocationContext } from '../invocation-context';
import type { ClientServiceSigningContext, ResolvedAgentRpcCredential } from './types';
import type { Interceptor } from '@connectrpc/connect';

const CLIENT_SERVICE_JWT_TTL_SECONDS = 300;

/**
 * EdDSA Client Service JWT を構築する server-side 入力です。
 *
 * @remarks
 * Consumer は signing key storage を SDK へ公開せず、復号済み key を含む signing context だけを渡します。
 * `methodContext` は Connect request URL から SDK が導出し、token と metadata を同一 RPC に相関させます。
 *
 * @example
 * ```ts
 * const input: ClientServiceJwtInput = { signingContext, invocation, methodContext };
 * const token = await createClientServiceJwt(input);
 * ```
 */
export interface ClientServiceJwtInput {
  /** consumer-owned secure storage が解決した署名 identity と private key です。 */
  readonly signingContext: ClientServiceSigningContext;
  /** Agent ID、scope、acting user、request correlation を持つ server-side invocation です。 */
  readonly invocation: TamacSdkInvocationContext;
  /** JWT extension claim と metadata に結び付ける generated RPC identity です。 */
  readonly methodContext: TamacAgentRpcMethodContext;
}

/**
 * Client Service JWT とともに Connect unary request へ付与する安全な metadata です。
 *
 * @remarks
 * `Authorization` 以外の値は Agent Service が認可の根拠にせず、request audit、replay、consumer-side
 * observability の相関だけに使います。private key、raw JWT 以外の credential secret、D1 reference は
 * 返しません。
 *
 * @example
 * ```ts
 * const metadata = await buildClientServiceRequestMetadata(input);
 * request.header.set('Authorization', metadata.Authorization);
 * ```
 */
export type ClientServiceRequestMetadata = Readonly<Record<string, string>>;

/**
 * 短命 EdDSA Client Service compact JWT を生成します。
 *
 * @param input - consumer-owned signing context と current invocation/method identity です。
 * @returns Agent Service trust config が検証できる compact JWT です。
 * @throws Agent ID、scope、acting user、request context、signing identity が不完全な場合、または署名利用の
 * 監査 callback が失敗した場合に fail closed で投げます。
 * @remarks
 * Payload は issuer、subject、kid、audience、時刻、Agent scope、acting user、request correlation、method
 * identity だけに限定します。private key と raw storage reference を payload へ入れることはありません。
 *
 * @example
 * ```ts
 * const jwt = await createClientServiceJwt({ signingContext, invocation, methodContext });
 * ```
 */
export async function createClientServiceJwt(input: ClientServiceJwtInput): Promise<string> {
  // 署名前に全 identity を検証し、不完全な context をネットワークへ送らないようにします。
  assertClientServiceJwtInput(input);
  // JWT の時間 window は Agent Service の最大 TTL と一致する短命値に固定します。
  const nowUnixSeconds = Math.floor(Date.now() / 1000);
  // header は Ed25519/EdDSA と署名鍵 ID を明示し、Agent trust config の key lookup に使います。
  const header: ClientServiceJwtHeader = {
    alg: 'EdDSA',
    kid: input.signingContext.credential.keyId,
    typ: 'JWT',
  };
  // payload は Agent が必要とする claims と secret-free correlation data だけから構成します。
  const payload: ClientServiceJwtPayload = {
    acting_user_id: input.invocation.actingUser.actingUserId,
    agent_id: input.invocation.agentId,
    aud: input.signingContext.audience,
    correlation_id: input.invocation.correlationId,
    exp: nowUnixSeconds + CLIENT_SERVICE_JWT_TTL_SECONDS,
    fingerprint: input.signingContext.credential.publicFingerprint,
    idempotency_key: input.invocation.idempotency?.idempotencyKey,
    iss: input.signingContext.credential.issuer,
    jti: globalThis.crypto.randomUUID(),
    nbf: nowUnixSeconds,
    request_id: input.invocation.requestId,
    rpc_method: input.methodContext.methodName,
    rpc_service: input.methodContext.serviceName,
    scopes: input.invocation.scopes,
    sub: input.signingContext.credential.keyId,
  };
  // compact JWS の署名 input を Ed25519 private key で署名し、raw key material は返しません。
  const jwt = await signEdDsaJwt(header, payload, input.signingContext.privateKey);
  // consumer-owned storage の利用監査が成功しなければ token を送信せず fail closed にします。
  await input.signingContext.onJwtSigned?.();
  return jwt;
}

/**
 * Client Service JWT と request/audit metadata を構築します。
 *
 * @param input - current signing context、invocation、generated method identity です。
 * @returns `Authorization`、request ID、correlation、service/method、任意 idempotency key を持つ metadata。
 * @throws JWT 署名または context validation が失敗した場合に投げ、metadata を部分的に返しません。
 * @remarks
 * Agent Service は authorization を JWT と Protobuf body から検証します。ここで返す service/method header は
 * caller supplied observability metadata であり、Agent 側は受信 Connect path を独立して検証します。
 *
 * @example
 * ```ts
 * const metadata = await buildClientServiceRequestMetadata({ signingContext, invocation, methodContext });
 * ```
 */
export async function buildClientServiceRequestMetadata(
  input: ClientServiceJwtInput
): Promise<ClientServiceRequestMetadata> {
  // JWT 生成を先に完了し、callback failure 時に不完全な authentication header を返さないようにします。
  const jwt = await createClientServiceJwt(input);
  // replay/audit/observability 用の固定 metadata を secret-free values だけで組み立てます。
  const metadata: Record<string, string> = {
    Authorization: `Bearer ${jwt}`,
    'x-agent-correlation-id': input.invocation.correlationId,
    'x-agent-rpc-method': input.methodContext.methodName,
    'x-agent-rpc-service': input.methodContext.serviceName,
    'x-request-id': input.invocation.requestId,
  };
  // command だけに idempotency header を追加し、query に偽の replay identity を作らないようにします。
  if (input.invocation.idempotency !== undefined) {
    metadata['x-agent-idempotency-key'] = input.invocation.idempotency.idempotencyKey;
  }
  return metadata;
}

/**
 * Connect unary request へ Client Service authentication metadata を注入する interceptor を作成します。
 *
 * @param signingContext - consumer-owned storage が解決した Ed25519 signing context です。
 * @param invocation - aggregate のすべての generated service client が共有する execution context です。
 * @returns binary Connect request の URL から method identity を導出して metadata を設定する interceptor。
 * @throws JWT 作成または metadata 注入に失敗した場合、request を送信せずに投げます。
 * @remarks
 * この function は framework-neutral SDK の transport seam です。Client D1、Next.js `server-only`、acting user
 * 導出は呼び出し元 consumer の責務のまま保ちます。
 *
 * @example
 * ```ts
 * const interceptor = createClientServiceRequestContextInterceptor(signingContext, invocation);
 * ```
 */
export function createClientServiceRequestContextInterceptor(
  signingContext: ClientServiceSigningContext,
  invocation: TamacSdkInvocationContext
): Interceptor {
  return (next) => async (request) => {
    // Connect request URL から service/method を抽出し、caller が任意文字列を指定する経路を作りません。
    const methodContext = parseConnectMethodContext(request.url);
    // JWT と request metadata を同じ context から構築し、service 間で相関情報がずれないようにします。
    const metadata = await buildClientServiceRequestMetadata({
      invocation,
      methodContext,
      signingContext,
    });
    // Connect が保持する Headers へ metadata を設定してから、次の interceptor/transport へ request を渡します。
    for (const [name, value] of Object.entries(metadata)) {
      request.header.set(name, value);
    }
    return next(request);
  };
}

/**
 * Connect request URL から generated Protobuf service/method identity を読み取ります。
 *
 * @param url - Connect transport が組み立てた unary RPC request URL です。
 * @returns fully-qualified service name と generated method name です。
 * @throws Connect path が service/method の 2 segment を持たない場合に投げます。
 * @remarks
 * 異常な URL を `unknown` として署名せず、fail closed にすることで method identity が欠落した JWT を
 * Agent Service へ送ることを防ぎます。
 */
export function parseConnectMethodContext(url: string): TamacAgentRpcMethodContext {
  // Connect unary path の空 segment を除外して service と method を明確に分離します。
  const segments = new URL(url).pathname.split('/').filter((segment) => segment !== '');
  const [serviceName, methodName, ...extraSegments] = segments;
  // generated unary method path 以外を拒否し、曖昧な metadata を作らないようにします。
  if (
    serviceName === undefined ||
    methodName === undefined ||
    extraSegments.length > 0 ||
    serviceName === '' ||
    methodName === ''
  ) {
    throw new TypeError('Connect request URL must identify exactly one service and method.');
  }
  return { methodName, serviceName };
}

interface ClientServiceJwtHeader {
  readonly alg: 'EdDSA';
  readonly kid: string;
  readonly typ: 'JWT';
}

interface ClientServiceJwtPayload {
  readonly acting_user_id: string;
  readonly agent_id: string;
  readonly aud: string;
  readonly correlation_id: string;
  readonly exp: number;
  readonly fingerprint: string;
  readonly idempotency_key?: string;
  readonly iss: string;
  readonly jti: string;
  readonly nbf: number;
  readonly request_id: string;
  readonly rpc_method: string;
  readonly rpc_service: string;
  readonly scopes: readonly string[];
  readonly sub: string;
}

function assertClientServiceJwtInput(input: ClientServiceJwtInput): void {
  // JWT と request body が別 Agent を scope しないように、credential と invocation の Agent ID を照合します。
  assertEqualAgentId(input.signingContext.credential, input.invocation.agentId);
  // 空の identity/scope/correlation は audit/replay protection を弱めるため、送信前に拒否します。
  assertNonEmpty(input.signingContext.audience, 'Client Service audience');
  assertNonEmpty(input.signingContext.credential.issuer, 'Client Service issuer');
  assertNonEmpty(input.signingContext.credential.keyId, 'Client Service key ID');
  assertNonEmpty(
    input.signingContext.credential.publicFingerprint,
    'Client Service public fingerprint'
  );
  assertNonEmpty(input.invocation.agentId, 'Agent ID');
  assertNonEmpty(input.invocation.actingUser.actingUserId, 'Acting user ID');
  assertNonEmpty(input.invocation.requestId, 'Request ID');
  assertNonEmpty(input.invocation.correlationId, 'Correlation ID');
  assertNonEmpty(input.methodContext.serviceName, 'RPC service name');
  assertNonEmpty(input.methodContext.methodName, 'RPC method name');
  if (input.invocation.scopes.length === 0) {
    throw new TypeError('Client Service scopes must not be empty.');
  }
  for (const scope of input.invocation.scopes) {
    assertNonEmpty(scope, 'Client Service scope');
  }
  if (input.invocation.idempotency !== undefined) {
    assertNonEmpty(input.invocation.idempotency.idempotencyKey, 'Idempotency key');
  }
}

function assertEqualAgentId(
  credential: ResolvedAgentRpcCredential,
  invocationAgentId: string
): void {
  // signing identity が別 aggregate を指す状態を拒否し、cross-Agent credential confusion を防ぎます。
  if (credential.agentId !== invocationAgentId) {
    throw new TypeError('Client Service credential and invocation Agent IDs must match.');
  }
}

function assertNonEmpty(value: string, name: string): void {
  // whitespace だけの value も空として扱い、metadata/audit の識別不能状態を防ぎます。
  if (value.trim() === '') {
    throw new TypeError(`${name} must not be empty.`);
  }
}

async function signEdDsaJwt(
  header: ClientServiceJwtHeader,
  payload: ClientServiceJwtPayload,
  privateKey: CryptoKey
): Promise<string> {
  // compact JWS の header/payload を base64url 化し、署名対象を決定的に作ります。
  const signingInput = `${encodeBase64UrlJson(header)}.${encodeBase64UrlJson(payload)}`;
  // Web Crypto Ed25519 API へ独立した ArrayBuffer を渡し、shared backing buffer を署名対象にしません。
  const signature = await globalThis.crypto.subtle.sign(
    'Ed25519',
    privateKey,
    copyToArrayBuffer(new TextEncoder().encode(signingInput))
  );
  // compact JWS の第三 segment を作り、raw signature bytes を外部へ露出しません。
  return `${signingInput}.${encodeBase64Url(new Uint8Array(signature))}`;
}

function encodeBase64UrlJson(value: object): string {
  // JSON serialization は JWT header/payload を UTF-8 bytes に限定して base64url 化します。
  return encodeBase64Url(new TextEncoder().encode(JSON.stringify(value)));
}

function encodeBase64Url(bytes: Uint8Array): string {
  // Web Standard btoa へ渡す binary string を作り、Node-specific Buffer を SDK runtime へ持ち込みません。
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  // URL-safe alphabet と padding removal により compact JWT segment を作ります。
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  // Web Crypto が要求する独立 ArrayBuffer を確保して input bytes をコピーします。
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}
