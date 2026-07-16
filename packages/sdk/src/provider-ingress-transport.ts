import { createConnectTransport } from '@connectrpc/connect-web';

import { normalizeTamacSdkError } from './errors';
import { parseConnectMethodContext } from './invocation-context';

import type { ProviderIngressInvocationContext } from './provider-ingress-types';
import type { Interceptor, Transport } from '@connectrpc/connect';

/**
 * Provider ingress 用の binary Connect transport を作る設定です。
 *
 * @remarks
 * 署名と Protobuf security metadata は `TamacProviderIngressClient` が request body へ設定します。この transport は
 * Provider が追加できる HTTP metadata を request ID と correlation ID に限定し、Client Service JWT metadata や
 * 任意 header injection を持ち込みません。
 */
export interface TamacProviderIngressTransportConfig {
  /** signed Connect request を送る absolute HTTPS Agent Worker origin です。 */
  readonly agentRpcOrigin: string;
  /** request ID と correlation ID を共有する Provider execution context です。 */
  readonly invocation: ProviderIngressInvocationContext;
  /** test または Provider server runtime が供給する fetch implementation です。 */
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * Integration Provider 専用の Connect unary binary Protobuf transport を作成します。
 *
 * @param config - HTTPS Agent origin、Provider request/correlation context、任意 fetch implementation です。
 * @returns `IntegrationIngressService` の three-method surface だけが利用する binary Connect transport です。
 * @throws canonical HTTPS origin または Provider request/correlation identity が不完全な場合、request を送信せずに投げます。
 * @remarks
 * HTTP metadata は Connect が設定する `Content-Type: application/proto` と、SDK が設定する `x-request-id`、
 * `x-agent-correlation-id` に限定します。Authorization、Client Service JWT、任意の Provider header は設定しません。
 */
export function createTamacProviderIngressTransport(
  config: TamacProviderIngressTransportConfig
): Transport {
  // TLS を必須にして、Provider signature metadata を平文または相対 origin へ送らないようにします。
  assertProviderIngressOrigin(config.agentRpcOrigin);
  // request/correlation identity を送信前に検証し、監査不能な Provider ingress を拒否します。
  assertProviderRequestContext(config.invocation);
  // binary Connect profile、error normalization、allowlist 済み HTTP metadata interceptor だけを Provider transport に束ねます。
  return createConnectTransport({
    baseUrl: config.agentRpcOrigin,
    fetch: config.fetch,
    interceptors: [
      createProviderIngressErrorNormalizationInterceptor(config.invocation),
      createProviderIngressMetadataInterceptor(config.invocation),
    ],
    useBinaryFormat: true,
    useHttpGet: false,
  });
}

function createProviderIngressErrorNormalizationInterceptor(
  invocation: ProviderIngressInvocationContext
): Interceptor {
  return (next) => async (request) => {
    // Connect が実際に送る URL から Provider procedure を導出し、caller input を error service/method に使いません。
    const methodContext = parseConnectMethodContext(request.url);
    try {
      // binary transport の response をそのまま返し、HTTP 429 を含む Connect failure だけを catch します。
      return await next(request);
    } catch (error) {
      // Provider identity を保った安全な context で、429/resource_exhausted を TamacSdkOperationError に正規化します。
      throw normalizeTamacSdkError(error, {
        agentId: invocation.agentId,
        correlationId: invocation.correlationId,
        idempotencyKey: invocation.idempotencyKey,
        methodContext,
        requestId: invocation.requestId,
      });
    }
  };
}

function createProviderIngressMetadataInterceptor(
  invocation: ProviderIngressInvocationContext
): Interceptor {
  return (next) => async (request) => {
    // allowlist の request ID を一つだけ設定し、Provider の任意 HTTP metadata 注入経路を作りません。
    request.header.set('x-request-id', invocation.requestId);
    // allowlist の correlation ID を一つだけ設定し、secret-free operation tracing を維持します。
    request.header.set('x-agent-correlation-id', invocation.correlationId);
    // Connect が binary Protobuf framing を完成させた request だけを downstream transport へ渡します。
    return next(request);
  };
}

function assertProviderIngressOrigin(origin: string): void {
  // URL parser を通し、相対 URL や malformed origin への signed request を拒否します。
  let parsedOrigin: URL;
  try {
    parsedOrigin = new URL(origin);
  } catch {
    throw new TypeError('Provider ingress Agent RPC origin must be an absolute URL.');
  }
  // Provider installation identity と signature metadata の送信経路を HTTPS に固定します。
  if (parsedOrigin.protocol !== 'https:') {
    throw new TypeError('Provider ingress Agent RPC origin must use HTTPS.');
  }
  // userinfo を含む URL は origin 一致だけでは検出できないため、署名済み request の credential leak を明示的に防ぎます。
  if (parsedOrigin.username !== '' || parsedOrigin.password !== '') {
    throw new TypeError('Provider ingress Agent RPC origin must not include credentials.');
  }
  // origin 以外の path/query/fragment は Connect base URL の path join を曖昧にするため拒否します。
  if (parsedOrigin.pathname !== '/' || parsedOrigin.search !== '' || parsedOrigin.hash !== '') {
    throw new TypeError(
      'Provider ingress Agent RPC origin must not include a path, query, or fragment.'
    );
  }
  // literal と URL.origin の完全一致により trailing slash、default port、case/IDN の非 canonical 表現を拒否します。
  if (origin !== parsedOrigin.origin) {
    throw new TypeError('Provider ingress Agent RPC origin must be a canonical HTTPS origin.');
  }
}

function assertProviderRequestContext(invocation: ProviderIngressInvocationContext): void {
  // Provider HTTP metadata の追跡性を保つため、空または whitespace-only identifier を送信前に拒否します。
  if (invocation.requestId.trim() === '' || invocation.correlationId.trim() === '') {
    throw new TypeError('Provider ingress request and correlation IDs must not be empty.');
  }
}
