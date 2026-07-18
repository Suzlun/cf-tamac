'use server';

import { revalidatePath } from 'next/cache';

import { loadAgentRpcClients } from '../../agent-rpc/agent-loader';
import { buildScopedPageRequest, type BrowserSafePagedResult } from '../browser-safe-helpers';

import {
  toBrowserSafePageInfo,
  toBrowserSafeRunInput,
  toBrowserSafeRunSnapshot,
  toBrowserSafeRunSummary,
  type BrowserSafeRunDetail,
  type BrowserSafeRunSummary,
  type ListRunsOptions,
} from './view-models';

/**
 * AgentRunService.ListRuns を Agent/Thread-scoped cursor と filter 付きで呼び出す。
 *
 * @param agentId - Run を読み出す Agent aggregate の ID。
 * @param options - 任意の Thread/status filter と cursor 入力。
 * @returns Browser-safe Run summary と page metadata。
 * @remarks Run body や snapshot body は返さず、参照 metadata のみを返す。
 */
export async function listRuns(
  agentId: string,
  options: ListRunsOptions = {}
): Promise<BrowserSafePagedResult<BrowserSafeRunSummary>> {
  const { clients } = await loadAgentRpcClients(agentId);
  const response = await clients.withErrorNormalization(() =>
    clients.runs.listRuns({
      agentId,
      threadId: options.threadId,
      page: buildScopedPageRequest(agentId, 'runs', options.page),
      status: options.status,
    })
  );

  return {
    items: response.runs.map((run) => toBrowserSafeRunSummary(run)),
    page: toBrowserSafePageInfo(response.page),
  };
}

/**
 * AgentRunService.GetRun を呼び、immutable snapshot detail を安全化して返す。
 *
 * @param agentId - Run を所有する Agent aggregate の ID。
 * @param runId - detail を取得する Run ID。
 * @returns Browser-safe Run detail。
 * @remarks input/snapshot は metadata だけを返し、payload 本文や secret material は返さない。
 */
export async function getRun(agentId: string, runId: string): Promise<BrowserSafeRunDetail> {
  const { clients } = await loadAgentRpcClients(agentId);
  const response = await clients.withErrorNormalization(() =>
    clients.runs.getRun({ agentId, runId })
  );

  return {
    ...toBrowserSafeRunSummary(response.run, runId),
    input: toBrowserSafeRunInput(response.input),
    snapshot: toBrowserSafeRunSnapshot(response.snapshot),
  };
}

/**
 * AgentRunService.CancelRun を呼び、terminal/no-op replay を含む安全な結果を返す。
 *
 * @param agentId - Run を所有する Agent aggregate の ID。
 * @param runId - cancel 対象の Run ID。
 * @param idempotencyKey - cancel command の冪等性 key。
 * @param reason - operator が入力した cancel 理由。空文字は省略する。
 * @returns Browser-safe Run summary。
 * @remarks 成功後は Run 一覧 route を再検証し、Client D1 には Run 状態を保存しない。
 */
export async function cancelRun(
  agentId: string,
  runId: string,
  idempotencyKey: string,
  reason: string
): Promise<BrowserSafeRunSummary> {
  const { clients } = await loadAgentRpcClients(agentId);
  const response = await clients.withErrorNormalization(() =>
    clients.runs.cancelRun({
      agentId,
      idempotencyKey,
      runId,
      reason: reason === '' ? undefined : reason,
    })
  );

  revalidatePath(`/agents/${agentId}/runs`);
  return toBrowserSafeRunSummary(response.run, runId, 'cancelled');
}
