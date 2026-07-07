/**
 * Agent RPC と Durable Object seam をまたいで引き継ぐ安全な log context です。
 *
 * @remarks
 * Agent ID、RPC service/method、request ID だけを保持します。credential、JWT、payload body、
 * provider secret などの機密値は観測 context に入れず、ログ経由の漏えいを防ぎます。
 */
export interface AgentLogContext {
  readonly agentId: string;
  readonly rpcService?: string;
  readonly rpcMethod?: string;
  readonly requestId?: string;
}
