'use server';

import { revalidatePath } from 'next/cache';

import { loadAgentRpcClients } from '../../agent-rpc/agent-loader';
import {
  createBrowserSafeAgentRpcActionFailure,
  createBrowserSafeAgentRpcActionSuccess,
  executeBrowserSafeAgentRpcQuery,
  type BrowserSafeAgentRpcActionResult,
} from '../../agent-rpc/safe-results';
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
 * Run 一覧 query が Browser へ返す allowlisted display DTO です。
 *
 * @remarks
 * rows は `toBrowserSafeRunSummary`、cursor は `toBrowserSafePageInfo` により固定します。
 * generated Run response、snapshot body、raw diagnostic はこの DTO に含めません。
 */
export type BrowserSafeRunListDisplayData = BrowserSafePagedResult<BrowserSafeRunSummary>;

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
): Promise<BrowserSafeAgentRpcActionResult<BrowserSafeRunListDisplayData>> {
  return executeBrowserSafeAgentRpcQuery(
    async () => {
      // Agent/Thread/cursor scope を server-only SDK request に固定して Run 一覧を取得します。
      const { clients } = await loadAgentRpcClients(agentId);
      const response = await clients.withErrorNormalization(() =>
        clients.runs.listRuns({
          agentId,
          threadId: options.threadId,
          page: buildScopedPageRequest(agentId, 'runs', options.page),
          status: options.status,
        })
      );
      return { correlationId: clients.invocation.correlationId, response };
    },
    (response) => ({
      // raw Run/snapshot payload を返さず、summary mapper と page mapper の出力だけを保持します。
      items: response.runs.map((run) => toBrowserSafeRunSummary(run)),
      page: toBrowserSafePageInfo(response.page),
    }),
    'Run一覧を取得しました',
    'Runの安全な一覧情報を表示しています。',
    'Run一覧を確認してください',
    'Run一覧を確認できませんでした。時間をおいてもう一度表示してください。'
  );
}

/**
 * AgentRunService.GetRun を呼び、immutable snapshot detail を安全化して返す。
 *
 * @param agentId - Run を所有する Agent aggregate の ID。
 * @param runId - detail を取得する Run ID。
 * @returns Browser-safe Run detail。
 * @remarks input/snapshot は metadata だけを返し、payload 本文や secret material は返さない。
 */
export async function getRun(
  agentId: string,
  runId: string
): Promise<BrowserSafeAgentRpcActionResult<BrowserSafeRunDetail>> {
  return executeBrowserSafeAgentRpcQuery(
    async () => {
      // selected Run の generated response は server-only に取得し、Browser へ SDK client を渡しません。
      const { clients } = await loadAgentRpcClients(agentId);
      const response = await clients.withErrorNormalization(() =>
        clients.runs.getRun({ agentId, runId })
      );
      return { correlationId: clients.invocation.correlationId, response };
    },
    (response) => ({
      // Run input/snapshot は本文を含めず、既存の allowlisted metadata mapper 出力だけを返します。
      ...toBrowserSafeRunSummary(response.run, runId),
      input: toBrowserSafeRunInput(response.input),
      snapshot: toBrowserSafeRunSnapshot(response.snapshot),
    }),
    'Run詳細を取得しました',
    'Runの安全な詳細情報を表示しています。',
    'Run詳細を確認してください',
    'Run詳細を確認できませんでした。時間をおいてもう一度表示してください。'
  );
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
): Promise<BrowserSafeAgentRpcActionResult<BrowserSafeRunSummary>> {
  try {
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
    return createBrowserSafeAgentRpcActionSuccess(
      toBrowserSafeRunSummary(response.run, runId, 'cancelled'),
      '実行をキャンセルしました',
      '実行の停止を要求しました。',
      clients.invocation.correlationId
    );
  } catch (error) {
    return createBrowserSafeAgentRpcActionFailure(
      error,
      globalThis.crypto.randomUUID(),
      '実行を確認してください',
      '実行の状態は直前の確定値を保持しています。時間をおいてもう一度実行してください。'
    );
  }
}
