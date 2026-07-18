import {
  cancelScheduleInStore,
  cleanupInstallationSchedulesInStore,
  createAndRegisterAgentSchedule,
  fireScheduleInStore,
  getScheduleFromStore,
  listSchedulesFromStore,
} from '../schedules';

import type { AgentLocalQueueWakePayload } from '../AIAgent.types';
import type {
  AgentScheduleCallbackPayload,
  CancelAgentScheduleCommand,
  CancelAgentScheduleResult,
  CleanupInstallationSchedulesCommand,
  CleanupInstallationSchedulesResult,
  CreateAgentScheduleCommand,
  CreateAgentScheduleResult,
  FireAgentScheduleResult,
  GetAgentScheduleQuery,
  GetAgentScheduleResult,
  ListAgentSchedulesQuery,
  ListAgentSchedulesResult,
} from '../schedules';
import type { AgentStorageRepositories } from '../storage';
import type { AgentDurableObjectRuntimeScheduleRegistration } from './runtime-schedule';

/**
 * `AIAgent` の Schedule facade handler が共有する Durable Object 実行 context です。
 *
 * @remarks
 * Agent-owned Schedule storage と Agents SDK runtime schedule API の副作用境界を一つに束ねます。
 * handler は `AIAgent` class を増やさず、登録/cancel/wake の Phase 3a side-effect seam を callback として受け取り、
 * domain layer へ SDK object を流さないようにします。
 *
 * @property agentId Durable Object 名から得た Agent aggregate ID です。
 * @property repositories Agent-owned SQLite repository 集約です。
 * @property registerRuntimeSchedule storage 作成後の runtime schedule 登録 seam です。
 * @property cancelRuntimeSchedule storage 取消後の runtime schedule cancel seam です。
 * @property requestSchedulerWake schedule-triggered Event append 後に scheduler wake を要求する callback です。
 * @property readNowMs callback 発火時刻と wake 要求時刻を読む現在時刻 provider です。
 * @example
 * ```ts
 * await agentScheduleHandlers.createAgentSchedule(context, command);
 * ```
 */
export interface AIAgentScheduleHandlerContext {
  readonly agentId: string;
  readonly repositories: AgentStorageRepositories;
  readonly registerRuntimeSchedule: (
    result: CreateAgentScheduleResult
  ) => Promise<AgentDurableObjectRuntimeScheduleRegistration>;
  readonly cancelRuntimeSchedule: (runtimeScheduleId: string) => Promise<void>;
  readonly requestSchedulerWake: (payload: AgentLocalQueueWakePayload) => void;
  readonly readNowMs: () => number;
}

/**
 * `AIAgent` の public Schedule methods から呼び出す facade handler 群です。
 *
 * @remarks
 * Schedule 作成/取得/一覧/取消、Integration uninstall 時の cleanup、Agents SDK callback の Event 化を
 * Durable Object adapter 層へ集約します。公開 Durable Object method 名と引数は `AIAgent` 側に残し、
 * runtime schedule 登録/cancel と scheduler wake の副作用は context callback へ閉じます。
 *
 * @example
 * ```ts
 * const schedules = agentScheduleHandlers.listAgentSchedules(context, query);
 * ```
 */
export const agentScheduleHandlers = {
  cancelAgentSchedule,
  cleanupSchedulesForInstallation,
  createAgentSchedule,
  getAgentSchedule,
  handleAgentScheduleCallback,
  listAgentSchedules,
} as const;

async function createAgentSchedule(
  context: AIAgentScheduleHandlerContext,
  command: CreateAgentScheduleCommand
): Promise<CreateAgentScheduleResult> {
  // Schedule 作成の idempotency、runtime plan 生成、runtime bind 完了記録は既存 operation に委譲します。
  return createAndRegisterAgentSchedule({
    agentId: context.agentId,
    cancelRuntimeSchedule: context.cancelRuntimeSchedule,
    command,
    registerRuntimeSchedule: context.registerRuntimeSchedule,
    repositories: context.repositories,
  });
}

function getAgentSchedule(
  context: AIAgentScheduleHandlerContext,
  query: GetAgentScheduleQuery
): GetAgentScheduleResult {
  // 読み取りは Agent scope を明示して Schedule store に閉じ、cross-Agent lookup を提供しません。
  return getScheduleFromStore({
    agentId: context.agentId,
    query,
    repositories: context.repositories,
  });
}

function listAgentSchedules(
  context: AIAgentScheduleHandlerContext,
  query: ListAgentSchedulesQuery
): ListAgentSchedulesResult {
  // status/install/thread filter と pagination は Schedule operation の既存 validation に任せます。
  return listSchedulesFromStore({
    agentId: context.agentId,
    query,
    repositories: context.repositories,
  });
}

async function cancelAgentSchedule(
  context: AIAgentScheduleHandlerContext,
  command: CancelAgentScheduleCommand
): Promise<CancelAgentScheduleResult> {
  // 先に Agent-owned storage を cancel 状態へ進め、返却された runtime ID だけ Agents SDK cancel seam へ渡します。
  const result = cancelScheduleInStore({
    agentId: context.agentId,
    command,
    repositories: context.repositories,
  });
  if (result.runtimeScheduleId !== undefined)
    await context.cancelRuntimeSchedule(result.runtimeScheduleId);
  return result;
}

async function cleanupSchedulesForInstallation(
  context: AIAgentScheduleHandlerContext,
  command: CleanupInstallationSchedulesCommand
): Promise<CleanupInstallationSchedulesResult> {
  // uninstall/disable 対象 Installation の Schedule を storage で一括 cleanup し、各 runtime 登録を順番に停止します。
  const result = cleanupInstallationSchedulesInStore({
    agentId: context.agentId,
    command,
    repositories: context.repositories,
  });
  for (const runtimeScheduleId of result.runtimeScheduleIds) {
    // Agents SDK cancel は Durable Object 境界の副作用なので context callback からだけ実行します。
    await context.cancelRuntimeSchedule(runtimeScheduleId);
  }
  return result;
}

function handleAgentScheduleCallback(
  context: AIAgentScheduleHandlerContext,
  payload: AgentScheduleCallbackPayload
): FireAgentScheduleResult {
  // Agents SDK callback payload を Schedule firing command へ変換し、Event append 判定は既存 operation へ任せます。
  const result = fireScheduleInStore({
    agentId: context.agentId,
    command: { fireAtMs: context.readNowMs(), scheduleId: payload.scheduleId },
    repositories: context.repositories,
  });
  if (result.eventAppended) {
    // Event が新規 append された場合だけ scheduler wake を要求し、重複 fire では wake を増やしません。
    context.requestSchedulerWake({ reason: 'event_accepted', requestedAtMs: context.readNowMs() });
  }
  return result;
}
