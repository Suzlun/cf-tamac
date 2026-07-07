import { createAgentDomainError } from '../domain/errors';

import { scheduleOverlapPolicies } from './schedule-status';

import type { ScheduleOverlapPolicy, ScheduleStatus } from './schedule-status';

/**
 * Schedule fire callback に対する重複制御の判断結果です。
 *
 * @remarks
 * Event を append する、duplicate として抑止する、inactive/overlap policy に従って抑止・coalesce・queue する、
 * という runtime callback の分岐を明示します。
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
 *
 * @remarks
 * 同一 tick 記録済みか、直近 Run が active か、overlap policy が何かをまとめ、callback handler から
 * `decideScheduleFire` へ渡します。
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
 * @example
 * ```ts
 * const policy = normalizeScheduleOverlapPolicy(command.overlapPolicy);
 * ```
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
 *
 * @param value SQLite row などから復元した status 文字列です。
 * @returns 既知 status はそのまま返し、未知 status は fail-closed に `disabled` へ正規化します。
 * @throws この関数は未知値を例外にせず `disabled` へ倒すため例外を投げません。
 * @example
 * ```ts
 * const status = normalizeScheduleStatus(row.status);
 * ```
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
 *
 * @param input tick 重複、schedule status、直近 Run status、overlap policy、queue 数を含む判断入力です。
 * @returns callback を Event append / suppress / duplicate / overlap handling のどれに進めるかの判断結果です。
 * @throws この関数は入力済み metadata の純粋判定だけを行うため例外を投げません。
 * @example
 * ```ts
 * const decision = decideScheduleFire({ existingTickRecorded, overlapPolicy, queuedFireCount, scheduleStatus });
 * ```
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
 *
 * @param status 直近 Run の status 文字列、または存在しない場合の `undefined` です。
 * @returns pending、running、waiting のいずれかであれば `true` です。
 * @throws この関数は文字列比較だけを行うため例外を投げません。
 * @example
 * ```ts
 * if (isAgentRunActive(lastRun?.status)) return { status: 'skip' };
 * ```
 */
export function isAgentRunActive(status: string | undefined): boolean {
  return status === 'pending' || status === 'running' || status === 'waiting';
}
