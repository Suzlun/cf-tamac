import { createAgentDomainError } from '../domain/errors';
import { appendAgentEventToThreadInRepositories } from '../events/mailbox';

import { requireDeliveryContext } from './operation-shared';

import type { AgentAdapterDeliveryRow, AgentStorageRepositories } from '../storage';

/**
 * Provider Delivery result callback を受けた後に実行する Agent 内部 action の分類です。
 *
 * @remarks
 * `resume` は待機中 Run を再開する場合、`terminal_failure` は待機中 Run を失敗へ閉じる場合、
 * `follow_up_event` は Thread へ後続 Event を追加する場合、`stale_callback` は既に完了済みまたは
 * 再開対象を失った古い callback を副作用なしで受理する場合を表します。この分類自体は
 * repository 更新や例外送出を行わず、分類不能な入力は stale callback として扱います。
 */
export type DeliveryResultClassification =
  | 'follow_up_event'
  | 'resume'
  | 'stale_callback'
  | 'terminal_failure';

/**
 * AdapterDelivery と Provider status から Delivery result の後続処理を決定します。
 *
 * @param repositories Run snapshot と入力 snapshot を確認する Agent-owned repository 集約です。
 * @param delivery Provider callback が紐づく AdapterDelivery ledger row です。
 * @param status Provider が返した Delivery status です。
 * @returns Run 再開、終端失敗、follow-up Event、古い callback のいずれかの分類です。
 * @throws この関数は分類不能な入力を stale callback に倒すため例外を投げません。
 * @example
 * ```ts
 * const action = classifyDeliveryResult(repositories, delivery, command.status);
 * ```
 */
export function classifyDeliveryResult(
  repositories: AgentStorageRepositories,
  delivery: AgentAdapterDeliveryRow,
  status: string
): DeliveryResultClassification {
  if (isTerminalDeliveryLedgerStatus(delivery.status)) return 'stale_callback';
  if (delivery.runId === null) return 'follow_up_event';
  const run = repositories.pendingRuns.findRunById(delivery.runId);
  const snapshot = repositories.pendingRuns.findRunInputSnapshot(delivery.runId);
  if (run === undefined || snapshot === undefined) return 'stale_callback';
  if (run.status !== 'waiting') return 'stale_callback';
  if (isFailureDeliveryStatus(status)) return 'terminal_failure';
  if (isFollowUpDeliveryStatus(status)) return 'follow_up_event';
  return 'resume';
}

/**
 * Delivery result 分類に対応する Run 遷移または follow-up Event 追加を実行します。
 *
 * @param repositories Run status と Thread mailbox を更新する Agent-owned repository 集約です。
 * @param delivery 更新済み AdapterDelivery ledger row です。
 * @param action stale callback を除いた Delivery result 分類です。
 * @param nowMs 副作用の発生時刻として保存する Unix epoch milliseconds です。
 * @returns 副作用を完了したら値を返しません。
 * @throws DeliveryContext に紐づく Thread が存在しない場合は not_found domain error を送出します。
 * @example
 * ```ts
 * applyDeliveryResumeAction(repositories, updatedDelivery, action, requestedAtMs);
 * ```
 */
export function applyDeliveryResumeAction(
  repositories: AgentStorageRepositories,
  delivery: AgentAdapterDeliveryRow,
  action: Exclude<DeliveryResultClassification, 'stale_callback'>,
  nowMs: number
): void {
  if (action === 'resume' && delivery.runId !== null) {
    repositories.pendingRuns.transitionRunStatus({
      fromStatus: 'waiting',
      nowMs,
      runId: delivery.runId,
      toStatus: 'pending',
    });
    return;
  }
  if (action === 'terminal_failure' && delivery.runId !== null) {
    repositories.pendingRuns.transitionRunStatus({
      fromStatus: 'waiting',
      nowMs,
      runId: delivery.runId,
      toStatus: 'failed',
    });
    return;
  }
  appendDeliveryFollowUpEvent(repositories, delivery, nowMs);
}

function appendDeliveryFollowUpEvent(
  repositories: AgentStorageRepositories,
  delivery: AgentAdapterDeliveryRow,
  nowMs: number
): void {
  const context = requireDeliveryContext(repositories, delivery.deliveryContextId);
  const thread = repositories.threads.findByThreadId(context.threadId);
  if (thread === undefined) {
    throw createAgentDomainError({
      kind: 'not_found',
      message: 'DeliveryContext Thread not found.',
    });
  }
  appendAgentEventToThreadInRepositories({
    causationId: delivery.deliveryId,
    createdAtMs: nowMs,
    deliveryContextId: delivery.deliveryContextId,
    eventId: crypto.randomUUID(),
    eventType: 'integration.delivery.result',
    idempotencyKey: `delivery-result:${delivery.deliveryId}:${String(nowMs)}`,
    occurredAtMs: nowMs,
    repositories,
    requestDigest: delivery.requestDigest ?? undefined,
    source: 'agent.integration',
    target: {
      mode: 'thread_id',
      normalizedThreadKey: thread.normalizedThreadKey,
      threadId: thread.threadId,
      threadKey: thread.threadKey,
    },
  });
}

function isFailureDeliveryStatus(status: string): boolean {
  return ['cancelled', 'failed', 'rejected', 'terminal_failure', 'timed_out', 'timeout'].includes(
    status
  );
}

function isFollowUpDeliveryStatus(status: string): boolean {
  return ['follow_up', 'follow_up_event', 'provider_event'].includes(status);
}

function isTerminalDeliveryLedgerStatus(status: string): boolean {
  return ['cancelled', 'delivered', 'failed', 'rejected', 'succeeded', 'terminal_failure'].includes(
    status
  );
}
