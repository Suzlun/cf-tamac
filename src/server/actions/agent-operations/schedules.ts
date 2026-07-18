'use server';

import { revalidatePath } from 'next/cache';

import { loadAgentRpcClients } from '../../agent-rpc/agent-loader';
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
): Promise<BrowserSafePagedResult<BrowserSafeScheduleSummary>> {
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

  return {
    items: response.schedules.map((schedule) => toBrowserSafeScheduleSummary(schedule)),
    page: toBrowserSafePageInfo(response.page),
  };
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
): Promise<BrowserSafeScheduleSummary> {
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
  return toBrowserSafeScheduleSummary(response.schedule, undefined, 'active');
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
): Promise<BrowserSafeScheduleSummary> {
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
  return toBrowserSafeScheduleSummary(response.schedule, scheduleId, 'cancelled');
}
