import { createAgentDomainError } from '../domain/errors';

import { scheduleOverlapPolicies } from './foundation';

import type { ScheduleOverlapPolicy, ScheduleStatus } from './foundation';

/**
 * Schedule fire callback に対する重複制御の判断結果です。
 */
export type AgentScheduleFireDecision =
  | { readonly status: 'append_event' }
  | { readonly fireStatus: 'suppressed_inactive'; readonly status: 'suppress' }
  | { readonly fireStatus: 'duplicate_tick'; readonly status: 'duplicate' }
  | { readonly fireStatus: 'skipped_overlap'; readonly status: 'skip' }
  | { readonly fireStatus: 'coalesced_overlap'; readonly status: 'coalesce' }
  | { readonly fireStatus: 'queued_next_overlap'; readonly status: 'queue_next' }
  | { readonly fireStatus: 'queue_next_already_pending'; readonly status: 'queue_next_duplicate' };

/**
 * Fire decision の入力です。
 */
export interface DecideScheduleFireInput {
  readonly existingTickRecorded: boolean;
  readonly lastRunStatus?: string;
  readonly overlapPolicy: ScheduleOverlapPolicy;
  readonly queuedFireCount: number;
  readonly scheduleStatus: ScheduleStatus;
}

/**
 * RPC 入力や保存済み値の overlap policy を正規化します。
 *
 * @param value 入力された policy 文字列です。省略時は `skip` です。
 * @returns 許可済み overlap policy を返します。
 * @throws AgentDomainError 未知 policy の場合に発生します。
 */
export function normalizeScheduleOverlapPolicy(value: string | undefined): ScheduleOverlapPolicy {
  const normalized = value === undefined || value.trim() === '' ? 'skip' : value.trim();
  if (scheduleOverlapPolicies.includes(normalized as ScheduleOverlapPolicy)) {
    return normalized as ScheduleOverlapPolicy;
  }
  throw createAgentDomainError({ kind: 'validation', message: 'Unknown schedule overlap_policy.' });
}

/**
 * 保存済み status 文字列を Schedule lifecycle status へ正規化します。
 */
export function normalizeScheduleStatus(value: string): ScheduleStatus {
  if (
    value === 'active' ||
    value === 'completed' ||
    value === 'cancelled' ||
    value === 'disabled'
  ) {
    return value;
  }
  return 'disabled';
}

/**
 * Schedule fire callback が Event を追加してよいかを判断します。
 *
 * duplicate tick、inactive schedule、active Run overlap を先に判定し、
 * interval callback が同じ Thread に重複 work を作らないようにします。
 */
export function decideScheduleFire(input: DecideScheduleFireInput): AgentScheduleFireDecision {
  if (input.existingTickRecorded) return { fireStatus: 'duplicate_tick', status: 'duplicate' };
  if (input.scheduleStatus !== 'active') {
    return { fireStatus: 'suppressed_inactive', status: 'suppress' };
  }
  if (!isAgentRunActive(input.lastRunStatus)) return { status: 'append_event' };
  if (input.overlapPolicy === 'skip') return { fireStatus: 'skipped_overlap', status: 'skip' };
  if (input.overlapPolicy === 'coalesce') {
    return { fireStatus: 'coalesced_overlap', status: 'coalesce' };
  }
  if (input.queuedFireCount > 0) {
    return { fireStatus: 'queue_next_already_pending', status: 'queue_next_duplicate' };
  }
  return { fireStatus: 'queued_next_overlap', status: 'queue_next' };
}

/**
 * AgentRun がまだ future work を代表しているかを返します。
 */
export function isAgentRunActive(status: string | undefined): boolean {
  return status === 'pending' || status === 'running' || status === 'waiting';
}
