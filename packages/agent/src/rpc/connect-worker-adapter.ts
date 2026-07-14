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
import { inspectAgentRateLimit } from './interceptors/rate-limit';
import {
  createReplayProtectionContext,
  inspectReplayProtection,
} from './interceptors/replay-protection';
import { validateAgentRpcRequest } from './interceptors/validation';
import { createAgentRpcRouter } from './router';

import type { AgentWorkerEnv } from '../env';

/**
 * 生成済み Agent Connect RPC service 用の Worker fetch handler を作成します。
 *
 * @param env - Agent Worker binding と trust config を含む実行環境です。
 * @param options - unit test 専用 seam を明示的に許可する任意設定です。本番既定では test seam を開きません。
 * @returns Connect binary Protobuf request だけを処理する fetch handler です。
 */
export function createAgentConnectFetchHandler(
  env: AgentWorkerEnv,
  options: { readonly allowTestSeam?: boolean } = {}
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

    const operation = getConnectMethodIdentity(path);
    if (isProviderIngressOperation(operation)) {
      return handleProviderIngressRequest(request, handler);
    }
    return handleClientServiceRequest(request, env, options, handler);
  };
}

async function handleProviderIngressRequest(
  request: Request,
  handler: (request: Request) => Promise<Response>
): Promise<Response> {
  // Provider ingress は Client Service JWT aggregate と完全に分離し、Bearer header を受け取った時点で停止します。
  if (request.headers.has('Authorization')) {
    return createConnectErrorResponse(
      Code.PermissionDenied,
      'Integration ingress RPC does not accept Client Service bearer authentication.'
    );
  }
  // generated request decode 前に raw Protobuf の Agent identity を検証し、曖昧な aggregate routing を防ぎます。
  const rawBody = new Uint8Array(await request.clone().arrayBuffer());
  const protobufRejection = getMalformedProtobufRequestRejection(rawBody);
  if (protobufRejection !== undefined) {
    return createConnectErrorResponse(protobufRejection.code, protobufRejection.message);
  }
  const identityRejection = validateProviderIngressRequestIdentity({ rawBody, request });
  if (identityRejection !== undefined) {
    return createConnectErrorResponse(identityRejection.code, identityRejection.message);
  }
  // signature、trust key、nonce、idempotency、grant は Agent-owned DO state を必要とするため、generated handler 以降へ限定します。
  return handleAgentRpcHandlerError(() => handler(request));
}

async function handleClientServiceRequest(
  request: Request,
  env: AgentWorkerEnv,
  options: { readonly allowTestSeam?: boolean },
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
      if (error.code === Code.Internal && isMalformedProtobufDescription(error.rawMessage)) {
        return createConnectErrorResponse(
          Code.InvalidArgument,
          'Agent RPC received malformed Protobuf bytes.'
        );
      }
      return createConnectErrorResponse(error.code, error.rawMessage);
    }
    if (isMalformedProtobufError(error)) {
      return createConnectErrorResponse(
        Code.InvalidArgument,
        'Agent RPC received malformed Protobuf bytes.'
      );
    }
    return createConnectErrorResponseFromDomainError(normalizeUnknownAgentError(error));
  }
}

function createAuthenticationOptions(
  env: AgentWorkerEnv,
  options: { readonly allowTestSeam?: boolean }
): { readonly allowTestSeam?: boolean; readonly env: AgentWorkerEnv } {
  if (options.allowTestSeam === undefined) {
    return { env };
  }
  return { allowTestSeam: options.allowTestSeam, env };
}

function isMalformedProtobufError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  return isMalformedProtobufDescription(`${error.name}: ${error.message}`);
}

function isMalformedProtobufDescription(description: string): boolean {
  const normalizedDescription = description.toLowerCase();
  return (
    normalizedDescription.includes('protobuf') ||
    normalizedDescription.includes('parse') ||
    normalizedDescription.includes('wire') ||
    normalizedDescription.includes('buffer') ||
    normalizedDescription.includes('rangeerror') ||
    normalizedDescription.includes('truncated')
  );
}

/**
 * 単一の Agent Worker request を Connect facade 経由で処理します。
 *
 * @param request - Worker が受け取った HTTP request です。
 * @param env - Agent Worker binding と trust config を含む実行環境です。
 * @param options - unit test 専用 seam を明示的に許可する任意設定です。本番既定では test seam を開きません。
 * @returns Connect response、または fail-closed な Connect error response です。
 */
export function handleAgentConnectRequest(
  request: Request,
  env: AgentWorkerEnv,
  options: { readonly allowTestSeam?: boolean } = {}
): Promise<Response> {
  return createAgentConnectFetchHandler(env, options)(request);
}
