import { readAgentSchedulerWakeState } from './agent-foundation-state';
import { createThreadKeyIdentity } from './threads';

import type {
  AgentFoundationEventAcceptance,
  AgentFoundationEventInput,
  AgentLocalQueueWakePayload,
  AgentSchedulerWakeRecord,
} from './AIAgent.types';
import type { AgentStorageRepositories } from './storage';
import type { ThreadKeyIdentity } from './threads';

/**
 * foundation seam の Event 受理処理を AIAgent class から分離して実行します。
 *
 * @param input Agent ID、Event 入力、Agent-owned repository set、scheduler wake callback です。
 * @returns Thread 解決、Event append、pending Run 作成、scheduler wake 結果を含む受理結果です。
 * @throws idempotency key または event type が空の場合に TypeError を投げます。
 * @example
 * ```ts
 * const accepted = acceptFoundationEventInStore({ agentId, input, repositories, requestSchedulerWake });
 * ```
 */
export function acceptFoundationEventInStore(input: {
  readonly agentId: string;
  readonly input: AgentFoundationEventInput;
  readonly repositories: AgentStorageRepositories;
  readonly requestSchedulerWake: (payload: AgentLocalQueueWakePayload) => AgentSchedulerWakeRecord;
}): AgentFoundationEventAcceptance {
  assertFoundationEventInput(input.input);
  const now = Date.now();
  const identity = createThreadKeyIdentity(input.agentId, input.input.threadKey);
  const replayed = input.repositories.events.findByIdempotencyKey(input.input.idempotencyKey);
  if (replayed !== undefined) return createReplayedEventAcceptance(input, identity, replayed);
  const threadId = resolveOrCreateThread(input.repositories, identity, now);
  const sectionId = resolveOrCreateSection(input.repositories, threadId, now);
  const eventId = crypto.randomUUID();
  const runId = crypto.randomUUID();
  appendEvent(input.repositories, input.input, identity, threadId, sectionId, eventId, runId, now);
  createPendingRun(input.repositories, threadId, eventId, runId, now);
  const wake = input.requestSchedulerWake({ reason: 'event_accepted', requestedAtMs: now });
  return {
    eventId,
    eventType: input.input.eventType,
    identity,
    idempotencyKey: input.input.idempotencyKey,
    payloadRef: input.input.payloadRef,
    runId,
    sectionId,
    storageStatus: 'accepted',
    threadId,
    wake,
  };
}

function assertFoundationEventInput(input: AgentFoundationEventInput): void {
  if (input.idempotencyKey === '') throw new TypeError('idempotency_key must not be empty.');
  if (input.eventType === '') throw new TypeError('event_type must not be empty.');
}

function createReplayedEventAcceptance(
  input: {
    readonly input: AgentFoundationEventInput;
    readonly repositories: AgentStorageRepositories;
  },
  identity: ThreadKeyIdentity,
  existing: {
    readonly eventId: string;
    readonly eventType: string;
    readonly payloadRef: string | null;
    readonly sectionId: string;
    readonly threadId: string;
  }
): AgentFoundationEventAcceptance {
  const run = input.repositories.pendingRuns.findRunForEvent(existing.eventId);
  return {
    eventId: existing.eventId,
    eventType: existing.eventType,
    identity,
    idempotencyKey: input.input.idempotencyKey,
    payloadRef: existing.payloadRef ?? undefined,
    runId: run?.runId ?? '',
    sectionId: existing.sectionId,
    storageStatus: 'replayed',
    threadId: existing.threadId,
    wake: readAgentSchedulerWakeState(input.repositories),
  };
}

function resolveOrCreateThread(
  repositories: AgentStorageRepositories,
  identity: ThreadKeyIdentity,
  now: number
): string {
  const existing = repositories.threads.findByNormalizedThreadKey(identity.normalizedThreadKey);
  if (existing !== undefined) return existing.threadId;
  const threadId = crypto.randomUUID();
  repositories.threads.insertThread({
    normalizedThreadKey: identity.normalizedThreadKey,
    nowMs: now,
    threadId,
    threadKey: identity.threadKey,
  });
  return threadId;
}

function resolveOrCreateSection(
  repositories: AgentStorageRepositories,
  threadId: string,
  now: number
): string {
  const existing = repositories.sections.findOpenSection(threadId);
  if (existing !== undefined) return existing.sectionId;
  const sectionId = crypto.randomUUID();
  repositories.sections.insertSection({
    createdAtMs: now,
    sectionId,
    sequence: 1,
    startThreadSequence: 1,
    status: 'active',
    threadId,
  });
  repositories.threads.updateCurrentSection({ currentSectionId: sectionId, nowMs: now, threadId });
  return sectionId;
}

function appendEvent(
  repositories: AgentStorageRepositories,
  input: AgentFoundationEventInput,
  identity: ThreadKeyIdentity,
  threadId: string,
  sectionId: string,
  eventId: string,
  runId: string,
  now: number
): void {
  repositories.events.appendEvent({
    createdAtMs: now,
    eventId,
    eventType: input.eventType,
    idempotencyKey: input.idempotencyKey,
    normalizedThreadKey: identity.normalizedThreadKey,
    occurredAtMs: now,
    payloadRef: input.payloadRef,
    runId,
    sectionId,
    sequences: repositories.events.getNextSequences(threadId),
    source: 'foundation',
    threadId,
    threadKey: identity.threadKey,
  });
  repositories.sections.incrementEventCount(threadId, sectionId);
}

function createPendingRun(
  repositories: AgentStorageRepositories,
  threadId: string,
  eventId: string,
  runId: string,
  now: number
): void {
  repositories.pendingRuns.insertPendingRun({
    nowMs: now,
    priority: 0,
    runId,
    threadId,
    triggerEventId: eventId,
  });
}
