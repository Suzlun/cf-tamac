import type { AuthenticatedAgentPrincipal } from './authentication';
import type { ReplayProtectionContext } from './replay-protection';
import type { AgentRawBodyDigest } from '../../domain/security';

/**
 * Audit context available to Agent RPC foundation handlers.
 */
export interface AgentRpcAuditContext {
  readonly method: string;
  readonly requestId: string;
  readonly path: string;
  readonly principal: AuthenticatedAgentPrincipal;
  readonly rawBodyDigest: AgentRawBodyDigest;
  readonly replay: ReplayProtectionContext;
  readonly service: string;
  readonly startedAtUnixMs: number;
}

let currentAgentRpcAuditContext: AgentRpcAuditContext | undefined;

/**
 * Create the audit context for an Agent RPC request.
 */
export function createAgentRpcAuditContext(
  request: Request,
  principal: AuthenticatedAgentPrincipal,
  replay: ReplayProtectionContext,
  rawBodyDigest: AgentRawBodyDigest
): AgentRpcAuditContext {
  const path = new URL(request.url).pathname;
  const methodIdentity = parseConnectMethodIdentity(path);
  return {
    method: methodIdentity.method,
    path,
    requestId: getRequestId(request),
    principal,
    rawBodyDigest,
    replay,
    service: methodIdentity.service,
    startedAtUnixMs: Date.now(),
  };
}

/**
 * Execute an operation with an audit context seam.
 */
export function runWithAgentRpcAuditContext<T>(
  context: AgentRpcAuditContext,
  operation: () => Promise<T>
): Promise<T> {
  const previousContext = currentAgentRpcAuditContext;
  currentAgentRpcAuditContext = context;
  return operation().finally(() => {
    currentAgentRpcAuditContext = previousContext;
  });
}

/**
 * Return the current Agent RPC audit context for generated service handlers.
 */
export function getCurrentAgentRpcAuditContext(): AgentRpcAuditContext | undefined {
  return currentAgentRpcAuditContext;
}

function getRequestId(request: Request): string {
  const requestId = request.headers.get('x-request-id');
  if (requestId !== null && requestId.trim() !== '') {
    return requestId.trim();
  }
  return crypto.randomUUID();
}

function parseConnectMethodIdentity(path: string): {
  readonly method: string;
  readonly service: string;
} {
  const segments = path.split('/').filter((segment) => segment !== '');
  return {
    method: segments.at(1) ?? 'unknown',
    service: segments.at(0) ?? 'unknown',
  };
}
