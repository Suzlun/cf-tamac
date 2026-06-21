import type { AuthenticatedAgentPrincipal } from './authentication';
import type { ReplayProtectionContext } from './replay-protection';

/**
 * Audit context available to Agent RPC foundation handlers.
 */
export interface AgentRpcAuditContext {
  readonly requestId: string;
  readonly path: string;
  readonly principal: AuthenticatedAgentPrincipal;
  readonly replay: ReplayProtectionContext;
  readonly startedAtUnixMs: number;
}

/**
 * Create the audit context for an Agent RPC request.
 */
export function createAgentRpcAuditContext(
  request: Request,
  principal: AuthenticatedAgentPrincipal,
  replay: ReplayProtectionContext
): AgentRpcAuditContext {
  return {
    requestId: getRequestId(request),
    path: new URL(request.url).pathname,
    principal,
    replay,
    startedAtUnixMs: Date.now(),
  };
}

/**
 * Execute an operation with an audit context seam.
 */
export function runWithAgentRpcAuditContext<T>(
  _context: AgentRpcAuditContext,
  operation: () => Promise<T>
): Promise<T> {
  return operation();
}

function getRequestId(request: Request): string {
  const requestId = request.headers.get('x-request-id');
  if (requestId !== null && requestId.trim() !== '') {
    return requestId.trim();
  }
  return crypto.randomUUID();
}
