import { Code } from '@connectrpc/connect';
import { codeToHttpStatus, codeToString } from '@connectrpc/connect/protocol-connect';

import { createAgentDomainError, isAgentDomainError } from '../domain/errors';

import type { AgentDomainError, AgentDomainErrorKind } from '../domain/errors';

/**
 * Connect code mapping for stable Agent domain error categories.
 */
export const agentDomainErrorConnectCodeByKind: Readonly<Record<AgentDomainErrorKind, Code>> = {
  authentication: Code.Unauthenticated,
  authorization: Code.PermissionDenied,
  concurrency: Code.Aborted,
  conflict: Code.AlreadyExists,
  internal: Code.Internal,
  not_found: Code.NotFound,
  precondition: Code.FailedPrecondition,
  provider_failure: Code.Unavailable,
  rate_limit: Code.ResourceExhausted,
  timeout: Code.DeadlineExceeded,
  validation: Code.InvalidArgument,
};

/**
 * Map an Agent domain error category to the public Connect code taxonomy.
 */
export function mapAgentDomainErrorKindToConnectCode(kind: AgentDomainErrorKind): Code {
  switch (kind) {
    case 'authentication':
      return Code.Unauthenticated;
    case 'authorization':
      return Code.PermissionDenied;
    case 'concurrency':
      return Code.Aborted;
    case 'conflict':
      return Code.AlreadyExists;
    case 'not_found':
      return Code.NotFound;
    case 'precondition':
      return Code.FailedPrecondition;
    case 'provider_failure':
      return Code.Unavailable;
    case 'rate_limit':
      return Code.ResourceExhausted;
    case 'timeout':
      return Code.DeadlineExceeded;
    case 'validation':
      return Code.InvalidArgument;
    case 'internal':
      return Code.Internal;
  }
}

/**
 * Map a safe Agent domain error to the public Connect code taxonomy.
 */
export function mapAgentDomainErrorToConnectCode(error: AgentDomainError): Code {
  return mapAgentDomainErrorKindToConnectCode(error.kind);
}

/**
 * Normalize unknown errors into the Agent domain error taxonomy.
 */
export function normalizeUnknownAgentError(error: unknown): AgentDomainError {
  if (isAgentDomainError(error)) {
    return error;
  }
  return createAgentDomainError({
    kind: 'internal',
    message: 'Agent RPC handler failed.',
    retryable: false,
  });
}

/**
 * Create a Connect-compatible unary error response.
 */
export function createConnectErrorResponse(code: Code, message: string): Response {
  return new Response(
    JSON.stringify({
      code: codeToString(code),
      message,
    }),
    {
      status: codeToHttpStatus(code),
      headers: {
        'Content-Type': 'application/json; charset=UTF-8',
      },
    }
  );
}

/**
 * Create a fail-closed Connect unimplemented response.
 */
export function createUnimplementedResponse(message: string): Response {
  return createConnectErrorResponse(Code.Unimplemented, message);
}

/**
 * Create a fail-closed Connect invalid-argument response.
 */
export function createInvalidArgumentResponse(message: string): Response {
  return createConnectErrorResponse(Code.InvalidArgument, message);
}

/**
 * Create a Connect-compatible response from a safe Agent domain error.
 */
export function createConnectErrorResponseFromDomainError(error: AgentDomainError): Response {
  return createConnectErrorResponse(mapAgentDomainErrorToConnectCode(error), error.message);
}
