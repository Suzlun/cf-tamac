import type {
  AgentProviderOperationRow,
  AgentStorageRepositories,
  AgentToolApprovalRow,
  AgentToolInvocationRow,
} from '../storage';
import type {
  GetToolInvocationResult,
  ProviderOperationView,
  ToolApprovalView,
  ToolInvocationView,
} from './operation-types';

/**
 * 永続 ToolInvocation 行と関連行を安全な GetInvocation 結果へ変換します。
 *
 * @param agentId Durable Object が所有する Agent ID です。
 * @param repositories approval / Provider operation の関連行を読む repository set です。
 * @param row 変換対象の ToolInvocation 永続行です。
 * @returns public RPC と runtime 内部処理で共有できる ToolInvocation view です。
 * @throws この関数は読み取り済み行の写像だけを行うため例外を投げません。
 * @example
 * ```ts
 * const result = createInvocationResult(agentId, repositories, invocationRow);
 * ```
 */
export function createInvocationResult(
  agentId: string,
  repositories: AgentStorageRepositories,
  row: AgentToolInvocationRow
): GetToolInvocationResult {
  return {
    approval: mapApprovalRow(
      agentId,
      repositories.tools.findApprovalForInvocation(row.invocationId)
    ),
    invocation: mapInvocationRow(agentId, row),
    providerOperation: mapProviderOperationRow(
      agentId,
      repositories.tools.findProviderOperationByInvocation(row.invocationId)
    ),
  };
}

/**
 * ToolInvocation 永続行を安全な view へ変換します。
 *
 * @param agentId Durable Object が所有する Agent ID です。
 * @param row 変換対象の ToolInvocation 永続行です。
 * @returns optional nullable column を undefined に正規化した ToolInvocation view です。
 * @throws この関数は純粋な写像だけを行うため例外を投げません。
 * @example
 * ```ts
 * const view = mapInvocationRow(agentId, row);
 * ```
 */
export function mapInvocationRow(agentId: string, row: AgentToolInvocationRow): ToolInvocationView {
  return {
    agentId,
    approvalId: row.approvalId ?? undefined,
    attemptCount: row.attemptCount,
    createdAtMs: row.createdAtMs,
    failureReason: row.failureReason ?? undefined,
    idempotencyKey: row.idempotencyKey,
    inputRef: row.inputRef ?? undefined,
    installationId: row.installationId ?? undefined,
    invocationId: row.invocationId,
    outputRef: row.outputRef ?? undefined,
    providerOperationId: row.providerOperationId ?? undefined,
    resultEventId: row.resultEventId ?? undefined,
    runId: row.runId,
    status: row.status,
    threadId: row.threadId,
    toolId: row.toolId,
    toolSetVersion: row.toolSetVersion,
    updatedAtMs: row.updatedAtMs,
  };
}

/**
 * ToolApproval 永続行を安全な view へ変換します。
 *
 * @param agentId Durable Object が所有する Agent ID です。
 * @param row 変換対象の approval 行です。存在しない場合は undefined を返します。
 * @returns nullable column を undefined に正規化した approval view、または undefined です。
 * @throws この関数は純粋な写像だけを行うため例外を投げません。
 * @example
 * ```ts
 * const approval = mapApprovalRow(agentId, approvalRow);
 * ```
 */
export function mapApprovalRow(
  agentId: string,
  row: AgentToolApprovalRow | undefined
): ToolApprovalView | undefined {
  if (row === undefined) return undefined;
  return {
    actorId: row.actorId,
    agentId,
    approvalId: row.approvalId,
    auditEventId: row.auditEventId ?? undefined,
    decidedAtMs: row.decidedAtMs,
    decision: row.decision,
    invocationId: row.invocationId,
    principalId: row.principalId,
    reason: row.reason ?? undefined,
  };
}

/**
 * Provider operation 永続行を安全な view へ変換します。
 *
 * @param agentId Durable Object が所有する Agent ID です。
 * @param row 変換対象の Provider operation 行です。存在しない場合は undefined を返します。
 * @returns nullable column と integer boolean を RPC-safe に正規化した Provider operation view です。
 * @throws この関数は純粋な写像だけを行うため例外を投げません。
 * @example
 * ```ts
 * const operation = mapProviderOperationRow(agentId, operationRow);
 * ```
 */
export function mapProviderOperationRow(
  agentId: string,
  row: AgentProviderOperationRow | undefined
): ProviderOperationView | undefined {
  if (row === undefined) return undefined;
  return {
    agentId,
    cancellationSupported: row.cancellationSupported === 1,
    installationId: row.installationId,
    invocationId: row.invocationId ?? undefined,
    operationId: row.operationId,
    providerOperationRef: row.providerOperationRef ?? undefined,
    requestDigest: row.requestDigest ?? undefined,
    status: row.status,
    timeoutAtMs: row.timeoutAtMs ?? undefined,
  };
}
