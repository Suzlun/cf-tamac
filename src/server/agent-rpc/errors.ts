import 'server-only';

import { ConnectError, Code } from '@connectrpc/connect';

/**
 * Normalized Agent RPC error category for user-facing display.
 */
export type AgentRpcErrorCategory =
  | 'invalid_argument'
  | 'unauthenticated'
  | 'permission_denied'
  | 'not_found'
  | 'already_exists'
  | 'failed_precondition'
  | 'resource_exhausted'
  | 'cancelled'
  | 'deadline_exceeded'
  | 'unavailable'
  | 'internal'
  | 'unknown';

/**
 * Normalized Agent RPC error with a browser-safe message.
 *
 * The `message` field is safe for browser display; it never includes secret
 * material, raw stack traces, or internal Agent domain details. The original
 * cause is retained for server-side logging but must not be serialized to
 * browser responses.
 */
export class AgentRpcOperationError extends Error {
  readonly category: AgentRpcErrorCategory;
  readonly cause: unknown;

  constructor(category: AgentRpcErrorCategory, message: string, cause: unknown) {
    super(message);
    this.name = 'AgentRpcOperationError';
    this.category = category;
    this.cause = cause;
  }
}

const connectCodeToCategory = new Map<number, AgentRpcErrorCategory>([
  [Code.InvalidArgument, 'invalid_argument'],
  [Code.Unauthenticated, 'unauthenticated'],
  [Code.PermissionDenied, 'permission_denied'],
  [Code.NotFound, 'not_found'],
  [Code.AlreadyExists, 'already_exists'],
  [Code.FailedPrecondition, 'failed_precondition'],
  [Code.ResourceExhausted, 'resource_exhausted'],
  [Code.Canceled, 'cancelled'],
  [Code.DeadlineExceeded, 'deadline_exceeded'],
  [Code.Unavailable, 'unavailable'],
  [Code.Internal, 'internal'],
  [Code.Unknown, 'unknown'],
  [Code.Aborted, 'internal'],
  [Code.DataLoss, 'internal'],
  [Code.OutOfRange, 'invalid_argument'],
  [Code.Unimplemented, 'unavailable'],
]);

const categoryToUserMessage = new Map<AgentRpcErrorCategory, string>([
  ['invalid_argument', 'The request was invalid. Please correct the input and try again.'],
  ['unauthenticated', 'Authentication is required to perform this Agent operation.'],
  ['permission_denied', 'You do not have permission to perform this Agent operation.'],
  ['not_found', 'The requested Agent resource was not found.'],
  ['already_exists', 'The Agent resource already exists.'],
  ['failed_precondition', 'The Agent is not in a state that allows this operation.'],
  ['resource_exhausted', 'The Agent operation rate limit or budget was exceeded.'],
  ['cancelled', 'The Agent operation was cancelled.'],
  ['deadline_exceeded', 'The Agent operation timed out. Please retry.'],
  ['unavailable', 'The Agent Service is temporarily unavailable. Please retry.'],
  ['internal', 'An unexpected error occurred while contacting the Agent Service.'],
  ['unknown', 'An unknown error occurred while contacting the Agent Service.'],
]);

function resolveCategory(code: number): AgentRpcErrorCategory {
  return connectCodeToCategory.get(code) ?? 'unknown';
}

function resolveUserMessage(category: AgentRpcErrorCategory): string {
  return categoryToUserMessage.get(category) ?? categoryToUserMessage.get('unknown') ?? '';
}

/**
 * Normalize a thrown error from a server-side Agent RPC call into a browser-safe error.
 *
 * Connect errors are mapped to stable categories with user-safe messages. Non-Connect
 * errors are treated as internal failures. Secret material and raw stack traces are
 * never included in the returned `message`.
 */
export function normalizeAgentRpcError(error: unknown): AgentRpcOperationError {
  if (error instanceof ConnectError) {
    const category = resolveCategory(error.code);
    return new AgentRpcOperationError(category, resolveUserMessage(category), error);
  }
  return new AgentRpcOperationError('internal', resolveUserMessage('internal'), error);
}

/**
 * Execute a server-side Agent RPC call and normalize thrown errors.
 *
 * The returned promise rejects with `AgentRpcOperationError` when the underlying
 * call fails, allowing Server Actions to surface browser-safe error messages.
 */
export async function withAgentRpcErrorNormalization<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    throw normalizeAgentRpcError(error);
  }
}
