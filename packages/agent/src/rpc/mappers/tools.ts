import type {
  ApproveInvocationResponseSchema,
  GetInvocationResponseSchema,
  ListInvocationsResponseSchema,
  ListToolsResponseSchema,
  RejectInvocationResponseSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import type { AgentAuditView, AgentPageView } from '../../domain';
import type {
  GetToolInvocationResult,
  ListAgentToolsResult,
  ListToolInvocationsResult,
  ProviderOperationView,
  ToolApprovalView,
  ToolInvocationMutationResult,
  ToolInvocationView,
} from '../../tools';
import type { AgentToolDefinitionView } from '../../tools/catalog';
import type { MessageInitShape } from '@bufbuild/protobuf';

/**
 * AgentToolService.ListTools の domain 結果を generated RPC 応答へ変換します。
 *
 * @param result Agent-owned Tool catalog から組み立てた Tool 一覧とページ情報です。
 * @returns Connect RPC が Protobuf binary として直列化できる ListToolsResponse 初期化値です。
 * @throws この関数は純粋な写像だけを行い、検証済み domain 値を受け取る前提のため例外を投げません。
 * @example
 * ```ts
 * const response = mapListToolsResponse(await agent.listTools(query));
 * ```
 */
export function mapListToolsResponse(
  result: ListAgentToolsResult
): MessageInitShape<typeof ListToolsResponseSchema> {
  return {
    page: mapPage(result.page),
    tools: result.tools.map((tool) => mapTool(tool, result.toolSetVersion)),
  };
}

/**
 * AgentToolService.GetInvocation の domain 結果を generated RPC 応答へ変換します。
 *
 * @param result ToolInvocation、approval、Provider operation を含む Agent-local view です。
 * @returns generated GetInvocationResponse の初期化値です。
 * @throws この関数は storage へアクセスせず、未検証入力を処理しないため例外を投げません。
 * @example
 * ```ts
 * const response = mapGetInvocationResponse(agent.getToolInvocation(query));
 * ```
 */
export function mapGetInvocationResponse(
  result: GetToolInvocationResult
): MessageInitShape<typeof GetInvocationResponseSchema> {
  return {
    approval: mapApproval(result.approval),
    invocation: mapInvocation(result.invocation),
    providerOperation: mapProviderOperation(result.providerOperation),
  };
}

/**
 * AgentToolService.ListInvocations の domain 結果を generated RPC 応答へ変換します。
 *
 * @param result Agent scope 内で page/cursor 条件を満たした ToolInvocation 一覧です。
 * @returns generated ListInvocationsResponse の初期化値です。
 * @throws この関数は純粋な写像だけを行うため例外を投げません。
 * @example
 * ```ts
 * const response = mapListInvocationsResponse(agent.listToolInvocations(query));
 * ```
 */
export function mapListInvocationsResponse(
  result: ListToolInvocationsResult
): MessageInitShape<typeof ListInvocationsResponseSchema> {
  return {
    invocations: result.invocations.map(mapInvocation),
    page: mapPage(result.page),
  };
}

/**
 * AgentToolService.ApproveInvocation の mutation 結果を generated RPC 応答へ変換します。
 *
 * @param result 承認済み ToolInvocation、approval record、監査 record を含む mutation 結果です。
 * @returns generated ApproveInvocationResponse の初期化値です。
 * @throws この関数は domain 層で確定済みの結果を写像するだけなので例外を投げません。
 * @example
 * ```ts
 * const response = mapApproveInvocationResponse(agent.approveToolInvocation(command));
 * ```
 */
export function mapApproveInvocationResponse(
  result: ToolInvocationMutationResult
): MessageInitShape<typeof ApproveInvocationResponseSchema> {
  return mapInvocationMutationResponse(result);
}

/**
 * AgentToolService.RejectInvocation の mutation 結果を generated RPC 応答へ変換します。
 *
 * @param result 却下済み ToolInvocation、approval record、監査 record を含む mutation 結果です。
 * @returns generated RejectInvocationResponse の初期化値です。
 * @throws この関数は副作用を持たず、domain 層で確定済みの値だけを受け取るため例外を投げません。
 * @example
 * ```ts
 * const response = mapRejectInvocationResponse(agent.rejectToolInvocation(command));
 * ```
 */
export function mapRejectInvocationResponse(
  result: ToolInvocationMutationResult
): MessageInitShape<typeof RejectInvocationResponseSchema> {
  return mapInvocationMutationResponse(result);
}

function mapInvocationMutationResponse(result: ToolInvocationMutationResult) {
  return {
    approval: mapApproval(result.approval),
    audit: mapAudit(result.audit),
    invocation: mapInvocation(result.invocation),
  };
}

function mapTool(tool: AgentToolDefinitionView, toolSetVersion: number) {
  return {
    agentId: tool.agentId,
    approvalRequired: tool.approvalRequired,
    description: tool.description,
    displayName: tool.displayName,
    inputSchemaRef: mapRef(tool.inputSchemaRef),
    installationId: tool.installationId,
    outputSchemaRef: mapRef(tool.outputSchemaRef),
    providerTargetRef: tool.providerTargetRef,
    status: tool.status,
    toolId: tool.toolId,
    toolSetVersion: String(tool.toolSetVersion === 0 ? toolSetVersion : tool.toolSetVersion),
    version: tool.version,
  };
}

function mapInvocation(invocation: ToolInvocationView) {
  return {
    agentId: invocation.agentId,
    approvalId: invocation.approvalId,
    attemptCount: invocation.attemptCount,
    createdAtUnixMs: BigInt(invocation.createdAtMs),
    idempotencyKey: invocation.idempotencyKey,
    inputRef: mapRef(invocation.inputRef),
    installationId: invocation.installationId,
    invocationId: invocation.invocationId,
    outputRef: mapRef(invocation.outputRef),
    providerOperationId: invocation.providerOperationId,
    resultEventId: invocation.resultEventId,
    runId: invocation.runId,
    status: invocation.status,
    threadId: invocation.threadId,
    toolId: invocation.toolId,
    updatedAtUnixMs: BigInt(invocation.updatedAtMs),
  };
}

function mapApproval(approval: ToolApprovalView | undefined) {
  if (approval === undefined) return undefined;
  return {
    agentId: approval.agentId,
    approvalId: approval.approvalId,
    auditEventId: approval.auditEventId,
    decidedAtUnixMs: BigInt(approval.decidedAtMs),
    decision: approval.decision,
    invocationId: approval.invocationId,
    principalId: approval.principalId,
    reason: approval.reason,
  };
}

function mapProviderOperation(operation: ProviderOperationView | undefined) {
  if (operation === undefined) return undefined;
  return {
    agentId: operation.agentId,
    installationId: operation.installationId,
    invocationId: operation.invocationId,
    operationId: operation.operationId,
    providerOperationRef: operation.providerOperationRef,
    requestDigest: mapRawDigest(operation.requestDigest),
    status: operation.status,
    timeoutAtUnixMs:
      operation.timeoutAtMs === undefined ? undefined : BigInt(operation.timeoutAtMs),
  };
}

function mapAudit(audit: AgentAuditView | undefined) {
  if (audit === undefined) return undefined;
  return {
    agentId: audit.agentId,
    auditEventId: audit.auditEventId,
    correlationId: audit.correlationId,
    occurredAtUnixMs: BigInt(audit.occurredAtMs),
    operation: audit.operation,
    principalId: audit.principalId,
    result: audit.result,
    safeDetailRef: audit.safeDetailRef,
    systemThreadId: audit.systemThreadId,
  };
}

function mapPage(page: AgentPageView) {
  return {
    cursorScope: page.cursorScope,
    nextPageToken: page.nextPageToken,
    resultCount: page.resultCount,
  };
}

function mapRef(ref: string | undefined) {
  if (ref === undefined) return undefined;
  return {
    byteSize: 0n,
    contentType: 'application/octet-stream',
    ref,
    sha256: '',
    storageClass: 'reference',
  };
}

function mapRawDigest(digestHex: string | undefined) {
  if (digestHex === undefined) return undefined;
  return {
    algorithm: 'sha-256',
    byteLength: 0n,
    digestHex,
  };
}
