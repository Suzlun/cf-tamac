import { appendAgentEventToThreadInRepositories } from '../events/mailbox';

import {
  decideScheduleFire,
  normalizeScheduleOverlapPolicy,
  normalizeScheduleStatus,
} from './overlap';
import { scheduleTriggeredEventType } from './schedule-status';
import { mapScheduleRow } from './views';

import type { AgentScheduleRow, AgentStorageRepositories } from '../storage';
import type { FireAgentScheduleCommand, FireAgentScheduleResult } from './types';

/**
 * Agents SDK runtime callback を `schedule.triggered` Event append transaction に変換します。
 *
 * @param input Agent ID、Schedule callback command、Agent-owned repository set です。
 * @returns Event append の有無、fire status、更新済み Schedule view、作成された Run ID を返します。
 * @throws AgentDomainError Event append transaction が Thread/Section/Event を保存できない場合に発生します。
 * @example
 * ```ts
 * const result = fireScheduleInStore({ agentId, command, repositories });
 * ```
 */
export function fireScheduleInStore(input: {
  readonly agentId: string;
  readonly command: FireAgentScheduleCommand;
  readonly repositories: AgentStorageRepositories;
}): FireAgentScheduleResult {
  const schedule = input.repositories.schedules.findByScheduleId(input.command.scheduleId);
  if (schedule === undefined) return createMissingScheduleFireResult(input.command);
  const tick = createScheduleFireCandidate(schedule, input.command.fireAtMs);
  const existingFire = input.repositories.schedules.findFire(schedule.scheduleId, tick.tickId);
  const lastRun =
    schedule.lastRunId === null
      ? undefined
      : input.repositories.pendingRuns.findRunById(schedule.lastRunId);
  const decision = decideScheduleFire({
    existingTickRecorded:
      existingFire !== undefined && existingFire.status !== 'queued_next_overlap',
    lastRunStatus: lastRun?.status,
    overlapPolicy: normalizeScheduleOverlapPolicy(schedule.overlapPolicy),
    queuedFireCount: schedule.queuedFireCount,
    scheduleStatus: normalizeScheduleStatus(schedule.status),
  });
  if (decision.status !== 'append_event') {
    return recordSuppressedFire(input, schedule, tick, decision.fireStatus, decision.status);
  }
  return appendScheduleTriggeredEvent(input, schedule, tick);
}

function appendScheduleTriggeredEvent(
  input: {
    readonly agentId: string;
    readonly command: FireAgentScheduleCommand;
    readonly repositories: AgentStorageRepositories;
  },
  schedule: AgentScheduleRow,
  tick: { readonly fireAtMs: number; readonly nextFireAtMs?: number; readonly tickId: string }
): FireAgentScheduleResult {
  const persisted = input.repositories.transaction((repositories) => {
    const eventId = crypto.randomUUID();
    const event = appendAgentEventToThreadInRepositories({
      causationId: readScheduleCausationEventId(schedule.scheduleSpec) ?? schedule.scheduleId,
      createdAtMs: input.command.fireAtMs,
      eventId,
      eventType: scheduleTriggeredEventType,
      idempotencyKey: `schedule:${schedule.scheduleId}:${tick.tickId}`,
      occurredAtMs: input.command.fireAtMs,
      repositories,
      source: 'agent.schedule',
      target: {
        mode: 'thread_id',
        normalizedThreadKey: schedule.normalizedThreadKey ?? '',
        threadId: schedule.threadId,
        threadKey: schedule.threadKey ?? schedule.threadId,
      },
    });
    repositories.schedules.recordFire({
      completedAtMs: input.command.fireAtMs,
      eventId,
      fireAtMs: tick.fireAtMs,
      idempotencyKey: `schedule:${schedule.scheduleId}:${tick.tickId}`,
      observedAtMs: input.command.fireAtMs,
      runId: event.run.runId,
      scheduleId: schedule.scheduleId,
      status: 'event_appended',
      tickId: tick.tickId,
    });
    const updated = repositories.schedules.updateAfterFire({
      activeFireStartedAtMs: input.command.fireAtMs,
      eventId,
      lastFireAtMs: tick.fireAtMs,
      lastFireStatus: 'event_appended',
      lastFireTickId: tick.tickId,
      nextFireAtMs: tick.nextFireAtMs ?? null,
      queuedFireCount: Math.max(0, schedule.queuedFireCount - 1),
      runId: event.run.runId,
      scheduleId: schedule.scheduleId,
      status: schedule.scheduleKind === 'one_shot' ? 'completed' : 'active',
      updatedAtMs: input.command.fireAtMs,
    });
    return { runId: event.run.runId, schedule: updated };
  });
  return {
    eventAppended: true,
    fireStatus: 'event_appended',
    replayed: false,
    runId: persisted.runId,
    schedule: mapScheduleRow(input.agentId, persisted.schedule),
    tickId: tick.tickId,
  };
}

function readScheduleCausationEventId(scheduleSpec: string): string | undefined {
  // Run decision が作成した JSON spec から source Event だけを取り出し、解析不能な spec は安全に schedule ID へ fallback させる。
  try {
    const parsed = JSON.parse(scheduleSpec) as { readonly causationEventId?: unknown };
    return typeof parsed.causationEventId === 'string' && parsed.causationEventId !== ''
      ? parsed.causationEventId
      : undefined;
  } catch {
    return undefined;
  }
}

function recordSuppressedFire(
  input: {
    readonly agentId: string;
    readonly command: FireAgentScheduleCommand;
    readonly repositories: AgentStorageRepositories;
  },
  schedule: AgentScheduleRow,
  tick: { readonly fireAtMs: number; readonly tickId: string },
  fireStatus: string,
  decisionStatus: string
): FireAgentScheduleResult {
  const replayed = decisionStatus === 'duplicate';
  if (!replayed) {
    input.repositories.schedules.recordFire({
      fireAtMs: tick.fireAtMs,
      idempotencyKey: `schedule:${schedule.scheduleId}:${tick.tickId}:${fireStatus}`,
      observedAtMs: input.command.fireAtMs,
      reason: fireStatus,
      scheduleId: schedule.scheduleId,
      status: fireStatus,
      tickId: tick.tickId,
    });
    if (decisionStatus !== 'queue_next_duplicate') {
      input.repositories.schedules.updateAfterFire({
        activeFireStartedAtMs: schedule.activeFireStartedAtMs,
        lastFireAtMs: tick.fireAtMs,
        lastFireStatus: fireStatus,
        lastFireTickId: tick.tickId,
        queuedFireCount:
          decisionStatus === 'queue_next' ? schedule.queuedFireCount + 1 : schedule.queuedFireCount,
        scheduleId: schedule.scheduleId,
        updatedAtMs: input.command.fireAtMs,
      });
    }
  }
  return {
    eventAppended: false,
    fireStatus,
    replayed,
    schedule: mapScheduleRow(input.agentId, schedule),
    tickId: tick.tickId,
  };
}

function createScheduleFireCandidate(
  schedule: AgentScheduleRow,
  fireAtMs: number
): { readonly fireAtMs: number; readonly nextFireAtMs?: number; readonly tickId: string } {
  const runtimeTick = createScheduleTick(schedule, fireAtMs);
  if (
    schedule.queuedFireCount <= 0 ||
    schedule.lastFireAtMs === null ||
    schedule.lastFireTickId === null
  ) {
    return runtimeTick;
  }
  return {
    fireAtMs: schedule.lastFireAtMs,
    nextFireAtMs: runtimeTick.nextFireAtMs,
    tickId: schedule.lastFireTickId,
  };
}

function createScheduleTick(
  schedule: AgentScheduleRow,
  fireAtMs: number
): { readonly fireAtMs: number; readonly nextFireAtMs?: number; readonly tickId: string } {
  if (schedule.intervalSeconds !== null && schedule.intervalSeconds > 0) {
    const intervalMs = schedule.intervalSeconds * 1000;
    const normalizedFireAtMs = Math.floor(fireAtMs / intervalMs) * intervalMs;
    return {
      fireAtMs: normalizedFireAtMs,
      nextFireAtMs: normalizedFireAtMs + intervalMs,
      tickId: `${schedule.scheduleId}:${String(normalizedFireAtMs)}`,
    };
  }
  const oneShotFireAtMs = schedule.nextFireAtMs ?? fireAtMs;
  return { fireAtMs: oneShotFireAtMs, tickId: `${schedule.scheduleId}:${String(oneShotFireAtMs)}` };
}

function createMissingScheduleFireResult(
  command: FireAgentScheduleCommand
): FireAgentScheduleResult {
  return {
    eventAppended: false,
    fireStatus: 'schedule_missing',
    replayed: false,
    tickId: `${command.scheduleId}:${String(command.fireAtMs)}`,
  };
}
