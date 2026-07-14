import { createConnectTransport } from '@connectrpc/connect-web';

import {
  buildClientServiceRequestMetadata,
  parseConnectMethodContext,
} from './auth/client-service-jwt';
import { normalizeTamacSdkError } from './errors';

import type { ClientServiceSigningContext } from './auth/types';
import type { TamacAgentRpcMethodContext, TamacSdkInvocationContext } from './invocation-context';
import type { Interceptor, Transport } from '@connectrpc/connect';

const ALLOWED_INJECTED_METADATA_NAMES = new Set(['baggage', 'traceparent', 'tracestate']);

/**
 * Consumer が追加の secret-free request metadata を注入するための input です。
 *
 * @remarks
 * SDK が構築した Authorization、request ID、idempotency、correlation、service/method metadata は immutable
 * な `authenticationMetadata` として渡されます。injector は W3C tracing の `traceparent`、`tracestate`、
 * `baggage` だけを返せ、認証・監査・Connect protocol metadata を上書きできません。
 *
 * @example
 * ```ts
 * const input: TamacRequestContextInjectionInput = { authenticationMetadata, invocation, methodContext };
 * ```
 */
export interface TamacRequestContextInjectionInput {
  /** SDK が EdDSA JWT から構築した保護済み request metadata です。 */
  readonly authenticationMetadata: Readonly<Record<string, string>>;
  /** aggregate 内の全 service client が共有する server-side invocation context です。 */
  readonly invocation: TamacSdkInvocationContext;
  /** current Connect request URL から抽出した generated service/method identity です。 */
  readonly methodContext: TamacAgentRpcMethodContext;
}

/**
 * server-side consumer が request 単位で追加 metadata を返す injection seam です。
 *
 * @remarks
 * 戻り値には `traceparent`、`tracestate`、`baggage` の W3C observability header だけを含めます。
 * `Authorization`、request ID、idempotency、correlation、RPC service/method、`Content-Type`、`Accept`、
 * `Connect-Protocol-Version`、`Host` を含む Connect protocol/security metadata は SDK が拒否します。
 *
 * @example
 * ```ts
 * const inject: TamacRequestContextInjector = async () => ({ traceparent: '00-...-...-01' });
 * ```
 */
export type TamacRequestContextInjector = (
  input: TamacRequestContextInjectionInput
) => Promise<Readonly<Record<string, string>> | undefined>;

/**
 * Connect unary binary Protobuf transport を作る server-side factory 設定です。
 *
 * @remarks
 * SDK は framework-neutral であり、origin、acting user、credential storage、private key 解決を行いません。
 * Consumer の server-side execution boundary が検証済み context と signing key を供給します。
 *
 * @example
 * ```ts
 * const transport = createTamacAgentTransport({ agentRpcOrigin, signingContext, invocation });
 * ```
 */
export interface TamacAgentTransportConfig {
  /** Agent Worker の Connect RPC origin です。 */
  readonly agentRpcOrigin: string;
  /** consumer-owned secure storage が解決した Client Service signing context です。 */
  readonly signingContext: ClientServiceSigningContext;
  /** 全 service client が共有する Agent/scope/acting-user/request context です。 */
  readonly invocation: TamacSdkInvocationContext;
  /** テストまたは server runtime が供給する fetch implementation です。 */
  readonly fetch?: typeof globalThis.fetch;
  /** 認証/Connect protocol metadata を上書きせず W3C tracing header だけを追加する server-side seam です。 */
  readonly requestContextInjector?: TamacRequestContextInjector;
}

/**
 * Agent Service 向け Connect unary binary Protobuf transport を作成します。
 *
 * @param config - Agent origin、Client Service signing context、shared invocation、任意 fetch/injection seam。
 * @returns generated Protobuf service client が共有する Connect transport。
 * @throws HTTPS Agent origin や invocation identity が不完全な場合、JWT metadata 生成または custom injector が
 * 失敗した場合に request を送信せず投げます。
 * @remarks
 * transport は `POST` と binary Protobuf を固定し、Connect JSON/GET profile を有効化しません。error interceptor は
 * raw Connect failures を `TamacSdkOperationError` に変換して、service/method/request context を維持します。
 *
 * @example
 * ```ts
 * const transport = createTamacAgentTransport({ agentRpcOrigin, signingContext, invocation });
 * ```
 */
export function createTamacAgentTransport(config: TamacAgentTransportConfig): Transport {
  // origin を送信前に検証し、相対 URL や空 URL への credential 送信を防ぎます。
  assertAgentRpcOrigin(config.agentRpcOrigin);
  // binary Connect transport に authentication/context injection と error normalization を束ねます。
  return createConnectTransport({
    baseUrl: config.agentRpcOrigin,
    fetch: config.fetch,
    interceptors: [
      createErrorNormalizationInterceptor(config.invocation),
      createRequestContextInjectionInterceptor(config),
    ],
    useBinaryFormat: true,
    useHttpGet: false,
  });
}

function createRequestContextInjectionInterceptor(config: TamacAgentTransportConfig): Interceptor {
  return (next) => async (request) => {
    // Connect が実際に送る URL から service/method を導出し、consumer input を認可 identity に使いません。
    const methodContext = parseConnectMethodContext(request.url);
    // JWT、request ID、correlation、idempotency を同一 invocation context から原子的に生成します。
    const authenticationMetadata = await buildClientServiceRequestMetadata({
      invocation: config.invocation,
      methodContext,
      signingContext: config.signingContext,
    });
    // まず SDK が保護する metadata を設定し、custom seam による認証 header 上書きを防ぐ順序にします。
    setMetadata(request.header, authenticationMetadata);
    // consumer の任意 seam には secret-free input だけを渡し、追加 metadata を取得します。
    const injectedMetadata = await config.requestContextInjector?.({
      authenticationMetadata,
      invocation: config.invocation,
      methodContext,
    });
    // allowlist 外の protocol/security metadata を拒否した上で、許可された W3C observability header だけを追加します。
    if (injectedMetadata !== undefined) {
      setInjectedMetadata(request.header, injectedMetadata);
    }
    // metadata が完成した request を downstream transport へ渡し、network side effect を開始します。
    return next(request);
  };
}

function createErrorNormalizationInterceptor(invocation: TamacSdkInvocationContext): Interceptor {
  return (next) => async (request) => {
    // error context も Connect URL から作り、失敗時に service/method を安全に特定します。
    const methodContext = parseConnectMethodContext(request.url);
    try {
      // downstream authentication/transport の typed response をそのまま consumer へ返します。
      return await next(request);
    } catch (error) {
      // raw Connect message を露出せず、stable category と correlation metadata を持つ error に変換します。
      throw normalizeTamacSdkError(error, { invocation, methodContext });
    }
  };
}

function setMetadata(headers: Headers, metadata: Readonly<Record<string, string>>): void {
  // SDK 自身が作った security metadata をすべて request Headers へ確定値として設定します。
  for (const [name, value] of Object.entries(metadata)) {
    headers.set(name, value);
  }
}

function setInjectedMetadata(headers: Headers, metadata: Readonly<Record<string, string>>): void {
  // custom seam が返す header を順に allowlist 検査し、Connect wire profile や認証を差し替えられないようにします。
  for (const [name, value] of Object.entries(metadata)) {
    const normalizedName = name.toLowerCase();
    if (!ALLOWED_INJECTED_METADATA_NAMES.has(normalizedName)) {
      throw new TypeError(`Request context injector may only add W3C tracing metadata: ${name}.`);
    }
    // empty header name/value は HTTP metadata として曖昧なため、network side effect 前に拒否します。
    if (normalizedName.trim() === '' || value.trim() === '') {
      throw new TypeError('Request context injector metadata names and values must not be empty.');
    }
    headers.set(name, value);
  }
}

function assertAgentRpcOrigin(origin: string): void {
  // absolute HTTPS URL のみを受け付け、Bearer JWT を平文または予期しない origin へ送る設定ミスを防ぎます。
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new TypeError('Agent RPC origin must be an absolute URL.');
  }
  // Client Service bearer JWT の転送経路を TLS に固定し、HTTP/file/data/custom protocol を拒否します。
  if (parsedOrigin.protocol !== 'https:') {
    throw new TypeError('Agent RPC origin must use HTTPS.');
  }
}
