import type { Code } from '@connectrpc/connect';

/**
 * Rejection returned by Agent RPC guard seams before domain handling.
 */
export interface AgentRpcGuardRejection {
  readonly code: Code;
  readonly message: string;
}

/**
 * Optional Agent RPC guard rejection.
 */
export type AgentRpcGuardResult = AgentRpcGuardRejection | undefined;
