'use server';

import { revalidatePath } from 'next/cache';

import { loadAgentRpcClients } from '../../agent-rpc/agent-loader';
import {
  createBrowserSafeAgentRpcActionFailure,
  createBrowserSafeAgentRpcActionSuccess,
  executeBrowserSafeAgentRpcQuery,
  type BrowserSafeAgentRpcActionResult,
} from '../../agent-rpc/safe-results';
import {
  toBrowserSafeScheduleSummary,
  type BrowserSafeScheduleSummary,
  type ListSchedulesOptions,
} from '../agent-operation-view-models';
import {
  buildScopedPageRequest,
  toBrowserSafePageInfo,
  type BrowserSafePagedResult,
} from '../browser-safe-helpers';

/**
 * Schedule 一覧 query が Browser へ返す allowlisted display DTO です。
 *
 * @remarks
 * Schedule row と cursor は明示的な Browser-safe mapper 出力だけで構成します。
 * Agent-owned schedule response、callback secret、SDK diagnostic は含めません。
 */
export type BrowserSafeScheduleListDisplayData = BrowserSafePagedResult<BrowserSafeScheduleSummary>;

/**
 * AgentScheduleService.ListSchedules を cursor pagination 付きで呼び出す。
 *
 * @param agentId - Schedule を読み出す Agent aggregate の ID。
 * @param options - 任意の Thread/Installation/status filter と cursor 入力。
 * @returns Browser-safe schedule summary と page metadata。
 * @remarks Schedule state は Agent-owned なので、Client D1 に snapshot を保存しない。
 */
export async function listSchedules(
  agentId: string,
  options: ListSchedulesOptions = {}
): Promise<BrowserSafeAgentRpcActionResult<BrowserSafeScheduleListDisplayData>> {
  return executeBrowserSafeAgentRpcQuery(
    async () => {
      // Schedule filter と Agent-scoped cursor を server-only SDK request に固定します。
      const { clients } = await loadAgentRpcClients(agentId);
      const response = await clients.withErrorNormalization(() =>
        clients.schedules.listSchedules({
          agentId,
          page: buildScopedPageRequest(agentId, 'schedules', options.page),
          threadId: options.threadId,
          installationId: options.installationId,
          status: options.status,
        })
      );
      return { correlationId: clients.invocation.correlationId, response };
    },
    (response) => ({
      // generated schedule row を返さず、safe summary と page metadata だけを Browser に投影します。
      items: response.schedules.map((schedule) => toBrowserSafeScheduleSummary(schedule)),
      page: toBrowserSafePageInfo(response.page),
    }),
    'スケジュール一覧を取得しました',
    'スケジュールの安全な一覧情報を表示しています。',
    'スケジュール一覧を確認してください',
    'スケジュール一覧を確認できませんでした。時間をおいてもう一度表示してください。'
  );
}

/**
 * AgentScheduleService.CreateSchedule を acting user context 付き server-side RPC として呼び出す。
 *
 * @param agentId - Schedule を作成する Agent aggregate の ID。
 * @param idempotencyKey - create command の冪等性 key。
 * @param threadId - Schedule が Run を起動する Thread ID。
 * @param scheduleSpec - Agent が検証する schedule specification。
 * @param overlapPolicy - 任意の overlap policy。空文字は省略する。
 * @returns Browser-safe schedule summary。
 * @remarks 成功後は schedules route を再検証し、Browser へはsafe metadataだけを返す。
 */
export async function createSchedule(
  agentId: string,
  idempotencyKey: string,
  threadId: string,
  scheduleSpec: string,
  overlapPolicy: string
): Promise<BrowserSafeAgentRpcActionResult<BrowserSafeScheduleSummary>> {
  try {
    const { clients } = await loadAgentRpcClients(agentId);
    const response = await clients.withErrorNormalization(() =>
      clients.schedules.createSchedule({
        agentId,
        idempotencyKey,
        threadId,
        scheduleSpec,
        overlapPolicy: overlapPolicy === '' ? undefined : overlapPolicy,
      })
    );

    revalidatePath(`/agents/${agentId}/schedules`);
    return createBrowserSafeAgentRpcActionSuccess(
      toBrowserSafeScheduleSummary(response.schedule, undefined, 'active'),
      'スケジュールを作成しました',
      'スケジュールを有効にしました。',
      clients.invocation.correlationId
    );
  } catch (error) {
    return createBrowserSafeAgentRpcActionFailure(
      error,
      globalThis.crypto.randomUUID(),
      'スケジュールを確認してください',
      'スケジュールの状態は直前の確定値を保持しています。時間をおいてもう一度実行してください。'
    );
  }
}

/**
 * AgentScheduleService.CancelSchedule を idempotency key 付きで呼び出す。
 *
 * @param agentId - Schedule を所有する Agent aggregate の ID。
 * @param scheduleId - cancel 対象 schedule ID。
 * @param idempotencyKey - cancel command の冪等性 key。
 * @param reason - operator が入力した理由。空文字は省略する。
 * @returns Browser-safe schedule summary。
 * @remarks 成功後は schedules route を再検証し、Agent-owned schedule status はClient D1へ保存しない。
 */
export async function cancelSchedule(
  agentId: string,
  scheduleId: string,
  idempotencyKey: string,
  reason: string
): Promise<BrowserSafeAgentRpcActionResult<BrowserSafeScheduleSummary>> {
  try {
    const { clients } = await loadAgentRpcClients(agentId);
    const response = await clients.withErrorNormalization(() =>
      clients.schedules.cancelSchedule({
        agentId,
        idempotencyKey,
        scheduleId,
        reason: reason === '' ? undefined : reason,
      })
    );

    revalidatePath(`/agents/${agentId}/schedules`);
    return createBrowserSafeAgentRpcActionSuccess(
      toBrowserSafeScheduleSummary(response.schedule, scheduleId, 'cancelled'),
      'スケジュールをキャンセルしました',
      'スケジュールの実行を停止しました。',
      clients.invocation.correlationId
    );
  } catch (error) {
    return createBrowserSafeAgentRpcActionFailure(
      error,
      globalThis.crypto.randomUUID(),
      'スケジュールを確認してください',
      'スケジュールの状態は直前の確定値を保持しています。時間をおいてもう一度実行してください。'
    );
  }
}
