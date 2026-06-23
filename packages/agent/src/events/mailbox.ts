import { createAgentDomainError } from '../domain/errors';

import type {
  AgentEventRow,
  AgentRunRow,
  AgentSectionRow,
  AgentStorageRepositories,
  AgentThreadRow,
} from '../storage';

/**
 * Event を追加する Thread の解決方法です。
 *
 * `thread_key` 指定では必要に応じて Thread を作成し、`thread_id` 指定では
 * 既存 Thread の所有関係だけを確認します。
 */
export type AgentEventThreadTarget =
  | {
      readonly mode: 'thread_key';
      readonly normalizedThreadKey: string;
      readonly threadKey: string;
    }
  | {
      readonly mode: 'thread_id';
      readonly normalizedThreadKey: string;
      readonly threadId: string;
      readonly threadKey: string;
    };

/**
 * AgentEvent と pending Run を同一 transaction 内で作る入力です。
 */
export interface AppendAgentEventToThreadInput {
  readonly afterEventAppended?: (context: {
    readonly eventId: string;
    readonly repositories: AgentStorageRepositories;
    readonly thread: AgentThreadRow;
  }) => void;
  readonly causationId?: string;
  readonly correlationId?: string;
  readonly createdAtMs: number;
  readonly deliveryContextId?: string;
  readonly eventId: string;
  readonly eventType: string;
  readonly idempotencyKey: string;
  readonly occurredAtMs: number;
  readonly payloadByteSize?: number;
  readonly payloadContentType?: string;
  readonly payloadInlineBase64?: string;
  readonly payloadRef?: string;
  readonly payloadSha256?: string;
  readonly payloadStorageClass?: string;
  readonly repositories: AgentStorageRepositories;
  readonly requestDigest?: string;
  readonly runId?: string;
  readonly source: string;
  readonly target: AgentEventThreadTarget;
}

/**
 * Event append transaction が永続化した行です。
 */
export interface AppendAgentEventToThreadResult {
  readonly event: AgentEventRow;
  readonly run: AgentRunRow;
  readonly section: AgentSectionRow;
  readonly thread: AgentThreadRow;
}

/**
 * AgentEvent を authoritative mailbox と Event Log に追加し pending Run を coalesce します。
 *
 * @param input Event 内容、Thread 解決方法、repository set を含む入力です。
 * @returns 永続化済み Event、Thread、Section、pending Run の行を返します。
 * @throws AgentDomainError Thread や Section の保存に失敗した場合に発生します。
 */
export function appendAgentEventToThread(
  input: AppendAgentEventToThreadInput
): AppendAgentEventToThreadResult {
  return input.repositories.transaction((repositories) =>
    appendAgentEventToThreadInRepositories({ ...input, repositories })
  );
}

/**
 * 既存 transaction repository set の中で Event と pending Run を保存します。
 *
 * Schedule callback など、同じ transaction 内で別 table も更新する処理から利用します。
 */
export function appendAgentEventToThreadInRepositories(
  input: AppendAgentEventToThreadInput
): AppendAgentEventToThreadResult {
  const { repositories } = input;
  // Thread 解決は Event append より先に行い、sequence と Section の所有先を固定します。
  const thread = resolveThreadTarget(repositories, input.target, input.createdAtMs);
  // open Section がなければ作成し、Event が常に Section 境界内に入るようにします。
  const section = resolveOrCreateOpenSection(repositories, thread.threadId, input.createdAtMs);
  // pending Run は Thread 単位で coalesce し、Event ごとの Queue 増殖を防ぎます。
  const runId = input.runId ?? resolvePendingRunId(repositories, thread.threadId);

  repositories.events.appendEvent({
    causationId: input.causationId,
    correlationId: input.correlationId,
    createdAtMs: input.createdAtMs,
    deliveryContextId: input.deliveryContextId,
    eventId: input.eventId,
    eventType: input.eventType,
    idempotencyKey: input.idempotencyKey,
    normalizedThreadKey: thread.normalizedThreadKey,
    occurredAtMs: input.occurredAtMs,
    payloadByteSize: input.payloadByteSize,
    payloadContentType: input.payloadContentType,
    payloadInlineBase64: input.payloadInlineBase64,
    payloadRef: input.payloadRef,
    payloadSha256: input.payloadSha256,
    payloadStorageClass: input.payloadStorageClass,
    requestDigest: input.requestDigest,
    runId,
    sectionId: section.sectionId,
    sequences: repositories.events.getNextSequences(thread.threadId),
    source: input.source,
    threadId: thread.threadId,
    threadKey: thread.threadKey,
  });
  input.afterEventAppended?.({ eventId: input.eventId, repositories, thread });
  repositories.sections.incrementEventCount(thread.threadId, section.sectionId);

  const run = repositories.pendingRuns.upsertPendingRunForThread({
    lastServedAtMs: thread.lastServedAtMs ?? undefined,
    nowMs: input.createdAtMs,
    priority: thread.priority,
    runId,
    threadId: thread.threadId,
    triggerEventId: input.eventId,
  });
  const event = repositories.events.findByEventId(input.eventId);
  if (event === undefined) {
    throw createAgentDomainError({ kind: 'internal', message: 'Event write failed.' });
  }
  return { event, run, section, thread };
}

function resolveThreadTarget(
  repositories: AgentStorageRepositories,
  target: AgentEventThreadTarget,
  nowMs: number
): AgentThreadRow {
  if (target.mode === 'thread_id') {
    const thread = repositories.threads.findByThreadId(target.threadId);
    if (thread === undefined) {
      throw createAgentDomainError({ kind: 'not_found', message: 'Thread not found.' });
    }
    return thread;
  }
  const existing = repositories.threads.findByNormalizedThreadKey(target.normalizedThreadKey);
  if (existing !== undefined) return existing;
  const threadId = crypto.randomUUID();
  repositories.threads.insertThread({
    normalizedThreadKey: target.normalizedThreadKey,
    nowMs,
    threadId,
    threadKey: target.threadKey,
  });
  const created = repositories.threads.findByThreadId(threadId);
  if (created === undefined) {
    throw createAgentDomainError({ kind: 'internal', message: 'Thread write failed.' });
  }
  return created;
}

function resolveOrCreateOpenSection(
  repositories: AgentStorageRepositories,
  threadId: string,
  nowMs: number
): AgentSectionRow {
  const existing = repositories.sections.findOpenSection(threadId);
  if (existing !== undefined) return existing;
  const sectionId = crypto.randomUUID();
  repositories.sections.insertSection({
    createdAtMs: nowMs,
    sectionId,
    sequence: 1,
    startThreadSequence: 1,
    status: 'active',
    threadId,
  });
  repositories.threads.updateCurrentSection({ currentSectionId: sectionId, nowMs, threadId });
  const created = repositories.sections.findBySectionId(threadId, sectionId);
  if (created === undefined) {
    throw createAgentDomainError({ kind: 'internal', message: 'Section write failed.' });
  }
  return created;
}

function resolvePendingRunId(repositories: AgentStorageRepositories, threadId: string): string {
  return repositories.pendingRuns.findPendingRunForThread(threadId)?.runId ?? crypto.randomUUID();
}
