import { Code, ConnectError } from '@connectrpc/connect';
import { createFetchHandler } from '@connectrpc/connect/protocol';

import { createRawBodyDigest } from '../domain/security';

import {
  createConnectErrorResponse,
  createConnectErrorResponseFromDomainError,
  createUnimplementedResponse,
  normalizeUnknownAgentError,
} from './errors';
import { createAgentRpcAuditContext, runWithAgentRpcAuditContext } from './interceptors/audit';
import { authenticateAgentRequest } from './interceptors/authentication';
import {
  authorizeAgentRequest,
  getConnectMethodIdentity,
  isProviderIngressOperation,
  validateProviderIngressRequestIdentity,
} from './interceptors/authorization';
import {
  getBinaryConnectRequestRejection,
  getMalformedProtobufRequestRejection,
} from './interceptors/binary-content';
import {
  inspectProviderIngressRateLimit,
  type ProviderIngressRateLimitDenial,
  type ProviderIngressRateLimitDenialObserver,
} from './interceptors/provider-ingress-rate-limit';
import { inspectAgentRateLimit } from './interceptors/rate-limit';
import {
  createReplayProtectionContext,
  inspectReplayProtection,
} from './interceptors/replay-protection';
import { validateAgentRpcRequest } from './interceptors/validation';
import { createAgentRpcRouter } from './router';

import type { AgentWorkerEnv } from '../env';

interface ConnectOperation {
  readonly method: string;
  readonly service: string;
}

/**
 * Agent Connect Worker handler の明示的な wiring option です。
 *
 * @remarks
 * `allowTestSeam` は unit test の Client Service authentication seam だけを明示的に開きます。
 * `onProviderIngressRateLimitDenied` は pre-auth denial の safe field だけを Worker outer layer へ通知し、
 * raw IP、Agent ID、Installation ID、payload、signature、credential を受け取りません。
 *
 * @example
 * ```ts
 * handleAgentConnectRequest(request, env, { onProviderIngressRateLimitDenied: observe });
 * ```
 */
export interface AgentConnectHandlerOptions {
  readonly allowTestSeam?: boolean;
  readonly onProviderIngressRateLimitDenied?: ProviderIngressRateLimitDenialObserver;
}

/**
 * 生成済み Agent Connect RPC service 用の Worker fetch handler を作成します。
 *
 * @remarks
 * Provider path は binary profile/path classification、Authorization 拒否、trusted source/rate limit、raw wire/
 * identity、detached signature/DO routing の順に処理します。Client Service path は既存の Ed25519 JWT boundary を
 * 保ち、いずれも Protobuf RPC 以外を公開しません。
 *
 * @param env Agent Worker binding と trust config を含む実行環境です。
 * @param options test seam と safe denial observer を指定する任意設定です。本番既定では test seam を開きません。
 * @returns Connect binary Protobuf request だけを処理する fetch handler です。
 * @throws handler 構築時に generated router の初期化が失敗した場合は例外を送出します。request 処理の失敗は safe Connect response に変換します。
 * @example
 * ```ts
 * const fetchHandler = createAgentConnectFetchHandler(env, { onProviderIngressRateLimitDenied: observe });
 * const response = await fetchHandler(request);
 * ```
 */
export function createAgentConnectFetchHandler(
  env: AgentWorkerEnv,
  options: AgentConnectHandlerOptions = {}
): (request: Request) => Promise<Response> {
  const router = createAgentRpcRouter(env);
  const handlersByPath = new Map<string, (request: Request) => Promise<Response>>();
  for (const handler of router.handlers) {
    handlersByPath.set(handler.requestPath, createFetchHandler(handler, { httpVersion: '1.1' }));
  }

  return async (request) => {
    const rejection = getBinaryConnectRequestRejection(request);
    if (rejection !== undefined) {
      return createConnectErrorResponse(rejection.code, rejection.message);
    }

    const path = new URL(request.url).pathname;
    const handler = handlersByPath.get(path);
    if (handler === undefined) {
      return createUnimplementedResponse(`Unsupported Agent RPC path: ${path}`);
    }

    const operation = getRequestOperation(path);
    const providerOperation = getProviderIngressOperation(operation);
    if (providerOperation !== undefined) {
      return handleProviderIngressRequest(request, env, handler, options, providerOperation);
    }
    return handleClientServiceRequest(request, env, options, handler);
  };
}

async function handleProviderIngressRequest(
  request: Request,
  env: AgentWorkerEnv,
  handler: (request: Request) => Promise<Response>,
  options: AgentConnectHandlerOptions,
  operation: ConnectOperation
): Promise<Response> {
  // Provider ingress は Client Service JWT aggregate と完全に分離し、Bearer header を受け取った時点で停止します。
  if (request.headers.has('Authorization')) {
    return createConnectErrorResponse(
      Code.PermissionDenied,
      'Integration ingress RPC does not accept Client Service bearer authentication.'
    );
  }
  // trusted source と procedure-scoped allowance は body decode より先に評価し、pre-auth DoS を Agent state へ到達させません。
  const rateLimitInspection = await inspectProviderIngressRateLimit({ env, operation, request });
  if (rateLimitInspection.status === 'denied') {
    observeProviderIngressRateLimitDenial(
      options.onProviderIngressRateLimitDenied,
      rateLimitInspection.denial
    );
    return createConnectErrorResponse(
      rateLimitInspection.rejection.code,
      rateLimitInspection.rejection.message
    );
  }
  // generated request decode 前に raw Protobuf の Agent identity を検証し、曖昧な aggregate routing を防ぎます。
  const rawBody = new Uint8Array(await request.clone().arrayBuffer());
  const protobufRejection = getMalformedProtobufRequestRejection(rawBody);
  if (protobufRejection !== undefined) {
    return createConnectErrorResponse(protobufRejection.code, protobufRejection.message);
  }
  const identityRejection = validateProviderIngressRequestIdentity({ operation, rawBody });
  if (identityRejection !== undefined) {
    return createConnectErrorResponse(identityRejection.code, identityRejection.message);
  }
  // signature、trust key、nonce、idempotency、grant は Agent-owned DO state を必要とするため、generated handler 以降へ限定します。
  return handleAgentRpcHandlerError(() => handler(request));
}

async function handleClientServiceRequest(
  request: Request,
  env: AgentWorkerEnv,
  options: AgentConnectHandlerOptions,
  handler: (request: Request) => Promise<Response>
): Promise<Response> {
  // Client Service path だけが AGENT_CONTROL_PLANE_TRUST と Ed25519 bearer JWT を利用します。
  const authentication = await authenticateAgentRequest(
    request,
    createAuthenticationOptions(env, options)
  );
  if (authentication.rejection !== undefined) {
    return createConnectErrorResponse(
      authentication.rejection.code,
      authentication.rejection.message
    );
  }
  const rawBody = new Uint8Array(await request.clone().arrayBuffer());
  const protobufRejection = getMalformedProtobufRequestRejection(rawBody);
  if (protobufRejection !== undefined) {
    return createConnectErrorResponse(protobufRejection.code, protobufRejection.message);
  }
  const authorizationRejection = authorizeAgentRequest({
    principal: authentication.principal,
    rawBody,
    request,
  });
  if (authorizationRejection !== undefined) {
    return createConnectErrorResponse(authorizationRejection.code, authorizationRejection.message);
  }
  const replayRejection = await inspectReplayProtection({
    env,
    principal: authentication.principal,
    request,
  });
  if (replayRejection !== undefined) {
    return createConnectErrorResponse(replayRejection.code, replayRejection.message);
  }
  const rateLimitRejection = inspectAgentRateLimit(request);
  if (rateLimitRejection !== undefined) {
    return createConnectErrorResponse(rateLimitRejection.code, rateLimitRejection.message);
  }
  const validationRejection = validateAgentRpcRequest(request);
  if (validationRejection !== undefined) {
    return createConnectErrorResponse(validationRejection.code, validationRejection.message);
  }
  const auditContext = await createAgentRpcAuditContext(
    request,
    authentication.principal,
    createReplayProtectionContext(request, authentication.principal),
    await createRawBodyDigest(rawBody),
    env.AGENT_AUDIT_HASH_PEPPER
  );
  return handleAgentRpcHandlerError(() =>
    runWithAgentRpcAuditContext(auditContext, () => handler(request))
  );
}

async function handleAgentRpcHandlerError(operation: () => Promise<Response>): Promise<Response> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ConnectError) {
      // Connect が typed generated decode error として分類した code は保ち、business/internal message を文字列で再分類しません。
      return createConnectErrorResponse(error.code, error.rawMessage);
    }
    // raw wire rejection は handler 前の getMalformedProtobufRequestRejection だけで扱い、未知 error は domain taxonomy へ閉じます。
    return createConnectErrorResponseFromDomainError(normalizeUnknownAgentError(error));
  }
}

function createAuthenticationOptions(
  env: AgentWorkerEnv,
  options: AgentConnectHandlerOptions
): { readonly allowTestSeam?: boolean; readonly env: AgentWorkerEnv } {
  if (options.allowTestSeam === undefined) {
    return { env };
  }
  return { allowTestSeam: options.allowTestSeam, env };
}

function getRequestOperation(path: string): ConnectOperation {
  // path 解析はこの helper に集約し、Provider Event/Tool/Delivery が同じ generated identity 経路を通ります。
  return getConnectMethodIdentity(path);
}

function getProviderIngressOperation(operation: ConnectOperation): ConnectOperation | undefined {
  // generated Provider inventory 外の path は Client Service path として後続 policy に渡し、Provider pre-auth guard を広げません。
  return isProviderIngressOperation(operation) ? operation : undefined;
}

function observeProviderIngressRateLimitDenial(
  observer: ProviderIngressRateLimitDenialObserver | undefined,
  denial: ProviderIngressRateLimitDenial
): void {
  if (observer === undefined) return;
  try {
    // observability failure が rate-limit response を変えないよう、outer callback は best-effort に限定します。
    observer(denial);
  } catch {
    // observer の diagnostic は response/log へ出さず、pre-auth error schema と source secrecy を保ちます。
  }
}

/**
 * 単一の Agent Worker request を Connect facade 経由で処理します。
 *
 * @remarks
 * Provider ingress は pre-auth rate-limit denial を body decode、signature、Durable Object routing より先に
 * fixed `resource_exhausted` response へ変換します。Client Service JWT aggregate と Provider detached-signature
 * aggregate を同じ authentication surface として扱いません。
 *
 * @param request Worker が受け取った HTTP request です。
 * @param env Agent Worker binding と trust config を含む実行環境です。
 * @param options unit test seam と safe rate-limit observer を指定する任意設定です。本番既定では test seam を開きません。
 * @returns Connect response、または fail-closed な Connect error response です。
 * @throws router 初期化のプログラム上の失敗以外は response へ正規化するため、通常の request 拒否では送出しません。
 * @example
 * ```ts
 * const response = await handleAgentConnectRequest(request, env);
 * ```
 */
export function handleAgentConnectRequest(
  request: Request,
  env: AgentWorkerEnv,
  options: AgentConnectHandlerOptions = {}
): Promise<Response> {
  return createAgentConnectFetchHandler(env, options)(request);
}
