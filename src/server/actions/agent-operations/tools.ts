'use server';

import { revalidatePath } from 'next/cache';

import { loadAgentRpcClients } from '../../agent-rpc/agent-loader';
import {
  toBrowserSafeApproval,
  toBrowserSafeInvocationSummary,
  toBrowserSafeProviderOperation,
  toBrowserSafeToolSummary,
  type BrowserSafeInvocationDetail,
  type BrowserSafeInvocationSummary,
  type BrowserSafeToolSummary,
  type ListInvocationsOptions,
  type ListToolsOptions,
} from '../agent-operation-view-models';
import {
  buildScopedPageRequest,
  toBrowserSafePageInfo,
  type BrowserSafePagedResult,
} from '../browser-safe-helpers';

/**
 * AgentToolService.ListTools を cursor pagination 付きで呼び出す。
 *
 * @param agentId - Tool catalog を読み出す Agent aggregate の ID。
 * @param options - unavailable Tool の有無、Installation scope、cursor 入力。
 * @returns Browser-safe Tool summary と page metadata。
 * @remarks Provider target body や schema body は返さず、参照 metadata だけを返す。
 */
export async function listTools(
  agentId: string,
  options: ListToolsOptions = {}
): Promise<BrowserSafePagedResult<BrowserSafeToolSummary>> {
  const { clients } = await loadAgentRpcClients(agentId);
  const response = await clients.withErrorNormalization(() =>
    clients.tools.listTools({
      agentId,
      page: buildScopedPageRequest(agentId, 'tools', options.page),
      includeUnavailable: options.includeUnavailable ?? false,
      installationId: options.installationId,
    })
  );

  return {
    items: response.tools.map(toBrowserSafeToolSummary),
    page: toBrowserSafePageInfo(response.page),
  };
}

/**
 * AgentToolService.ListInvocations を filter と cursor pagination 付きで呼び出す。
 *
 * @param agentId - Invocation を読み出す Agent aggregate の ID。
 * @param options - Thread/Run/Installation/status filter と cursor 入力。
 * @returns Browser-safe invocation summary と page metadata。
 * @remarks input/output body は返さず、payload reference metadata だけを返す。
 */
export async function listInvocations(
  agentId: string,
  options: ListInvocationsOptions = {}
): Promise<BrowserSafePagedResult<BrowserSafeInvocationSummary>> {
  const { clients } = await loadAgentRpcClients(agentId);
  const response = await clients.withErrorNormalization(() =>
    clients.tools.listInvocations({
      agentId,
      threadId: options.threadId,
      page: buildScopedPageRequest(agentId, 'tool-invocations', options.page),
      runId: options.runId,
      status: options.status,
      installationId: options.installationId,
    })
  );

  return {
    items: response.invocations.map((invocation) => toBrowserSafeInvocationSummary(invocation)),
    page: toBrowserSafePageInfo(response.page),
  };
}

/**
 * AgentToolService.GetInvocation を呼び、承認 drawer 用 detail を返す。
 *
 * @param agentId - Invocation を所有する Agent aggregate の ID。
 * @param invocationId - detail を取得する invocation ID。
 * @returns Browser-safe invocation detail。
 * @remarks approval と provider operation は audit/ref metadata に丸め、raw payload は返さない。
 */
export async function getInvocation(
  agentId: string,
  invocationId: string
): Promise<BrowserSafeInvocationDetail> {
  const { clients } = await loadAgentRpcClients(agentId);
  const response = await clients.withErrorNormalization(() =>
    clients.tools.getInvocation({ agentId, invocationId, includePayloadRefs: true })
  );

  return {
    ...toBrowserSafeInvocationSummary(response.invocation, invocationId),
    approval: toBrowserSafeApproval(response.approval),
    providerOperation: toBrowserSafeProviderOperation(response.providerOperation),
  };
}

/**
 * AgentToolService.ApproveInvocation を explicit confirmation 後に呼び出す。
 *
 * @param agentId - Invocation を所有する Agent aggregate の ID。
 * @param invocationId - approve 対象 invocation ID。
 * @param idempotencyKey - approve command の冪等性 key。
 * @param reason - operator が入力した理由。空文字は省略する。
 * @returns Browser-safe invocation summary。
 * @remarks Tool approval context は Runs 画面の文脈 detail に移動したため、成功後は Runs と overview を再検証する。
 */
export async function approveInvocation(
  agentId: string,
  invocationId: string,
  idempotencyKey: string,
  reason: string
): Promise<BrowserSafeInvocationSummary> {
  const { clients } = await loadAgentRpcClients(agentId);
  const response = await clients.withErrorNormalization(() =>
    clients.tools.approveInvocation({
      agentId,
      idempotencyKey,
      invocationId,
      reason: reason === '' ? undefined : reason,
    })
  );

  // Tool approval context は Runs 画面の文脈 detail に移動したため、/tools ではなく /runs を revalidate する。
  revalidatePath(`/agents/${agentId}/runs`);
  revalidatePath(`/agents/${agentId}`);
  return toBrowserSafeInvocationSummary(response.invocation, invocationId, 'approved');
}

/**
 * AgentToolService.RejectInvocation を explicit confirmation 後に呼び出す。
 *
 * @param agentId - Invocation を所有する Agent aggregate の ID。
 * @param invocationId - reject 対象 invocation ID。
 * @param idempotencyKey - reject command の冪等性 key。
 * @param reason - operator が入力した理由。空文字は省略する。
 * @returns Browser-safe invocation summary。
 * @remarks Tool approval context は Runs 画面の文脈 detail に移動したため、成功後は Runs と overview を再検証する。
 */
export async function rejectInvocation(
  agentId: string,
  invocationId: string,
  idempotencyKey: string,
  reason: string
): Promise<BrowserSafeInvocationSummary> {
  const { clients } = await loadAgentRpcClients(agentId);
  const response = await clients.withErrorNormalization(() =>
    clients.tools.rejectInvocation({
      agentId,
      idempotencyKey,
      invocationId,
      reason: reason === '' ? undefined : reason,
    })
  );

  // Tool approval context は Runs 画面の文脈 detail に移動したため、/tools ではなく /runs を revalidate する。
  revalidatePath(`/agents/${agentId}/runs`);
  revalidatePath(`/agents/${agentId}`);
  return toBrowserSafeInvocationSummary(response.invocation, invocationId, 'rejected');
}
