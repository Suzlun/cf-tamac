/**
 * Foundation log context propagated through Agent RPC and Durable Object seams.
 */
export interface AgentLogContext {
  readonly agentId: string;
  readonly rpcService?: string;
  readonly rpcMethod?: string;
  readonly requestId?: string;
}
