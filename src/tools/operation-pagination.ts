import { createAgentDomainError } from '../domain/errors';

import type { AgentPageView } from '../domain';
import type { AgentToolInvocationRow } from '../storage';
import type { ListToolInvocationsQuery } from './operation-types';

/**
 * ToolInvocation 一覧の cursor scope を作成します。
 *
 * @param agentId Durable Object が所有する Agent ID です。
 * @param query Thread/status filter を含む ListInvocations query です。
 * @returns Agent scope と filter を固定した cursor scope 文字列です。
 * @throws この関数は純粋な文字列組み立てのみを行うため例外を投げません。
 * @example
 * ```ts
 * const scope = createInvocationCursorScope(agentId, query);
 * ```
 */
export function createInvocationCursorScope(
  agentId: string,
  query: ListToolInvocationsQuery
): string {
  const parts = [`${agentId}:tool-invocations`];
  if (query.threadId !== undefined && query.threadId !== '') parts.push(`thread=${query.threadId}`);
  if (query.status !== undefined && query.status !== '') parts.push(`status=${query.status}`);
  return parts.join(':');
}

/**
 * 要求された cursor scope が現在の filter scope と一致することを確認します。
 *
 * @param actual request page に含まれる cursor scope です。
 * @param expected 現在の filter から再計算した cursor scope です。
 * @throws scope が別 filter を指す場合に authorization domain error を投げます。
 * @example
 * ```ts
 * assertCursorScope(request.page?.cursorScope, expected);
 * ```
 */
export function assertCursorScope(actual: string | undefined, expected: string): void {
  if (actual !== undefined && actual !== '') {
    if (actual !== expected) {
      throw createAgentDomainError({
        kind: 'authorization',
        message: 'Pagination cursor is outside the requested ToolInvocation scope.',
      });
    }
  }
}

/**
 * ToolInvocation page token を storage query 用の cursor 値へ変換します。
 *
 * @param token 前回 page の nextPageToken です。
 * @returns created_at と invocation_id の cursor 値です。
 * @throws token 形式が不正な場合に validation domain error を投げます。
 * @example
 * ```ts
 * const cursor = parseInvocationPageToken(pageToken);
 * ```
 */
export function parseInvocationPageToken(token: string | undefined): {
  readonly afterCreatedAtMs?: number;
  readonly afterInvocationId?: string;
} {
  if (token === undefined || token === '') return {};
  const [rawCreatedAtMs, rawInvocationId] = token.split(':');
  const parsed = Number.parseInt(rawCreatedAtMs ?? '', 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw createAgentDomainError({
      kind: 'validation',
      message: 'Invalid ToolInvocation page token.',
    });
  }
  return { afterCreatedAtMs: parsed, afterInvocationId: rawInvocationId };
}

/**
 * ToolInvocation 一覧の PageResponse view を作成します。
 *
 * @param cursorScope 現在の filter scope です。
 * @param rows response に含める page 内行です。
 * @param hasMore 追加 page が存在するかどうかです。
 * @returns result count と nextPageToken を含む page view です。
 * @throws この関数は純粋な値変換のみを行うため例外を投げません。
 * @example
 * ```ts
 * const page = createInvocationPage(scope, rows, rows.length > pageSize);
 * ```
 */
export function createInvocationPage(
  cursorScope: string,
  rows: readonly AgentToolInvocationRow[],
  hasMore: boolean
): AgentPageView {
  const last = rows.at(-1);
  return {
    cursorScope,
    nextPageToken:
      hasMore && last !== undefined
        ? `${String(last.createdAtMs)}:${last.invocationId}`
        : undefined,
    resultCount: rows.length,
  };
}

/**
 * public list RPC の page size を Agent policy の範囲へ丸めます。
 *
 * @param pageSize request で指定された page size です。
 * @returns 1 以上 100 以下へ clamp した page size です。
 * @throws この関数は数値 clamp のみを行うため例外を投げません。
 * @example
 * ```ts
 * const limit = clampPageSize(request.page?.pageSize);
 * ```
 */
export function clampPageSize(pageSize: number | undefined): number {
  return Math.min(Math.max(pageSize ?? 50, 1), 100);
}

/**
 * 空文字を undefined へ正規化し、storage filter の未指定表現を統一します。
 *
 * @param value request 由来の optional string です。
 * @returns 空文字または undefined の場合は undefined、それ以外は元の文字列です。
 * @throws この関数は純粋な値変換のみを行うため例外を投げません。
 * @example
 * ```ts
 * const installationId = normalizeOptional(request.installationId);
 * ```
 */
export function normalizeOptional(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}
