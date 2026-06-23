import { createAgentDomainError } from '../domain/errors';

import { normalizeScheduleOverlapPolicy, normalizeScheduleStatus } from './overlap';

import type { AgentPageView } from '../domain';
import type { AgentScheduleRow } from '../storage';
import type { AgentScheduleView } from './types';

/**
 * Agent-owned Schedule row を RPC/domain 表示用の View に変換します。
 *
 * @param agentId Schedule を所有する Agent ID です。
 * @param row Durable Object SQLite から読み取った Schedule row です。
 * @returns null を undefined に正規化し、status と overlap policy を安全な列挙値へ丸めた View を返します。
 * @throws この変換は永続化済み row の読み替えだけを行うため、例外は投げません。
 * @example
 * ```ts
 * const view = mapScheduleRow('agent-1', scheduleRow);
 * ```
 */
export function mapScheduleRow(agentId: string, row: AgentScheduleRow): AgentScheduleView {
  return {
    agentId,
    auditEventId: row.auditEventId ?? undefined,
    callbackIdentity: row.callbackIdentity ?? undefined,
    cancelledAtMs: row.cancelledAtMs ?? undefined,
    createdAtMs: row.createdAtMs,
    createdByPrincipalId: row.createdByPrincipalId ?? undefined,
    installationId: row.installationId ?? undefined,
    lastFireAtMs: row.lastFireAtMs ?? undefined,
    nextFireAtMs: row.nextFireAtMs ?? undefined,
    overlapPolicy: normalizeScheduleOverlapPolicy(row.overlapPolicy),
    scheduleId: row.scheduleId,
    scheduleSpec: row.scheduleSpec,
    status: normalizeScheduleStatus(row.status),
    threadId: row.threadId,
    threadKey: row.threadKey ?? undefined,
  };
}

/**
 * Agent scope の Schedule list cursor scope を生成します。
 *
 * @param agentId Schedule list を読む Agent ID です。
 * @returns 別 Agent の cursor と混線しない Schedule list 専用 cursor scope です。
 * @throws この関数は文字列連結だけを行うため、例外は投げません。
 * @example
 * ```ts
 * const scope = createScheduleListCursorScope('agent-1');
 * ```
 */
export function createScheduleListCursorScope(agentId: string): string {
  return `${agentId}:schedules`;
}

/**
 * Schedule list cursor scope が現在の Agent scope と一致することを検証します。
 *
 * @param actual RPC request から受け取った cursor scope です。
 * @param expected 現在の Agent ID から生成した期待 cursor scope です。
 * @throws AgentDomainError cursor scope が別 Agent または別 list 由来の場合に発生します。
 * @example
 * ```ts
 * assertCursorScope(page.cursorScope, createScheduleListCursorScope(agentId));
 * ```
 */
export function assertCursorScope(actual: string | undefined, expected: string): void {
  if (actual === undefined || actual === '' || actual === expected) return;
  throw createAgentDomainError({
    kind: 'validation',
    message: 'Schedule page cursor scope mismatch.',
  });
}

/**
 * Schedule list の page size を API が許容する範囲へ丸めます。
 *
 * @param value RPC request から受け取った page size です。
 * @returns 未指定時は 50、範囲外は 1 から 100 に丸めた page size です。
 * @throws この関数は数値の丸めだけを行うため、例外は投げません。
 * @example
 * ```ts
 * const pageSize = clampSchedulePageSize(request.pageSize);
 * ```
 */
export function clampSchedulePageSize(value: number | undefined): number {
  return Math.min(Math.max(value ?? 50, 1), 100);
}

/**
 * Schedule list の page token を repository cursor 条件に変換します。
 *
 * @param token 前回応答の `nextPageToken` です。
 * @returns 作成時刻と Schedule ID を使う seek pagination 条件です。不正 token は空条件として扱います。
 * @throws この関数は不正 token を許容して空条件へ落とすため、例外は投げません。
 * @example
 * ```ts
 * const cursor = parseSchedulePageToken(pageToken);
 * ```
 */
export function parseSchedulePageToken(token: string | undefined): {
  readonly afterCreatedAtMs?: number;
  readonly afterScheduleId?: string;
} {
  if (token === undefined || token === '') return {};
  const [createdAtRaw, scheduleId] = token.split(':');
  const afterCreatedAtMs = Number.parseInt(createdAtRaw ?? '', 10);
  if (!Number.isFinite(afterCreatedAtMs)) return {};
  return { afterCreatedAtMs, afterScheduleId: scheduleId === '' ? undefined : scheduleId };
}

/**
 * Schedule list の paging metadata を作成します。
 *
 * @param cursorScope Agent scope 付きの cursor scope です。
 * @param rows 現在 page に含める Schedule row です。
 * @param hasMore repository が page size を超える row を返したかどうかです。
 * @returns 次 page token と件数を含む AgentPageView です。
 * @throws この関数は row 内容を読み替えるだけを行うため、例外は投げません。
 * @example
 * ```ts
 * const page = createSchedulePage(scope, rows, hasMore);
 * ```
 */
export function createSchedulePage(
  cursorScope: string,
  rows: readonly AgentScheduleRow[],
  hasMore: boolean
): AgentPageView {
  const last = rows.at(-1);
  return {
    cursorScope,
    nextPageToken:
      hasMore && last !== undefined ? `${String(last.createdAtMs)}:${last.scheduleId}` : undefined,
    resultCount: rows.length,
  };
}

/**
 * RPC の optional filter 文字列を repository が扱う undefined-or-trimmed 形式へ正規化します。
 *
 * @param value request から受け取った filter 値です。
 * @returns 空白のみの文字列と nullish は undefined、それ以外は trim 済み文字列です。
 * @throws この関数は文字列正規化だけを行うため、例外は投げません。
 * @example
 * ```ts
 * const installationId = normalizeOptionalFilter(request.installationId);
 * ```
 */
export function normalizeOptionalFilter(value: string | undefined | null): string | undefined {
  if (value === undefined || value === null || value.trim() === '') return undefined;
  return value.trim();
}
