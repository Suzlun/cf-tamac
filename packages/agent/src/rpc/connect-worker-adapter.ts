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
import { authorizeAgentRequest } from './interceptors/authorization';
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
 * Create a Worker fetch handler for generated Agent Connect RPC services.
 */
export function createAgentConnectFetchHandler(
  env: AgentWorkerEnv
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

    const rawBody = new Uint8Array(await request.clone().arrayBuffer());
    const protobufRejection = getMalformedProtobufRequestRejection(rawBody);
    if (protobufRejection !== undefined) {
      return createConnectErrorResponse(protobufRejection.code, protobufRejection.message);
    }

    const authentication = authenticateAgentRequest(request);
    if (authentication.rejection !== undefined) {
      return createConnectErrorResponse(
        authentication.rejection.code,
        authentication.rejection.message
      );
    }

    const authorizationRejection = authorizeAgentRequest(request, authentication.principal);
    if (authorizationRejection !== undefined) {
      return createConnectErrorResponse(
        authorizationRejection.code,
        authorizationRejection.message
      );
    }

    const replayRejection = inspectReplayProtection(request);
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

    const path = new URL(request.url).pathname;
    const handler = handlersByPath.get(path);
    if (handler === undefined) {
      return createUnimplementedResponse(`Unsupported Agent RPC path: ${path}`);
    }
    const auditContext = createAgentRpcAuditContext(
      request,
      authentication.principal,
      createReplayProtectionContext(request),
      await createRawBodyDigest(rawBody)
    );
    return runWithAgentRpcAuditContext(auditContext, () => handler(request)).catch(
      (error: unknown) => {
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
    );
  };
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
 * Handle a single Agent Worker request through the Connect facade.
 */
export function handleAgentConnectRequest(
  request: Request,
  env: AgentWorkerEnv
): Promise<Response> {
  return createAgentConnectFetchHandler(env)(request);
}
