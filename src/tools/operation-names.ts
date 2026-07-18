/**
 * Tool 操作で使う Protobuf RPC service/method 名を一元管理します。
 *
 * @remarks
 * 各 command/query/provider/result module が同じ idempotency operation 名と
 * authorization service 名を共有し、分割後も既存の監査・冪等性 key 空間を変えないための
 * 内部定数です。
 */
export const toolOperationNames = {
  cancelInvocation: 'AgentToolService.CancelInvocation',
  createInvocation: 'AgentToolService.CreateInvocation',
  executeInvocation: 'AgentToolService.ExecuteInvocation',
  integrationIngressService: 'cftamac.agent.v1.IntegrationIngressService',
  publishToolResult: 'IntegrationIngressService.PublishToolResult',
  reconcileInvocation: 'AgentToolService.ReconcileInvocation',
  toolService: 'cftamac.agent.v1.AgentToolService',
} as const;
