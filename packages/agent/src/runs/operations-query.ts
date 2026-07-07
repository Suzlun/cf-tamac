import { assertAgentContext } from '../domain/agent-operation-utils';
import { createAgentDomainError } from '../domain/errors';

import { authorizeRunOperation, requireRun } from './operations-shared';
import { createGetRunResult, mapAgentRunDetailRow } from './views';

import type { AgentCoreRequestContext, AgentPageView } from '../domain';
import type { AgentRunRow, AgentStorageRepositories } from '../storage';
import type { GetAgentRunResult, ListAgentRunsResult } from './views';

/**
 * Durable Object が受け取る Agent-scoped GetRun query を表します。
 *
 * この型は transport/RPC descriptor ではなく、Agent-owned Run store へ渡す
 * domain command/query 境界の入力です。呼び出し元は `context.agentId` と
 * Durable Object の Agent ID が一致する状態で渡す必要があります。
 *
 * @example
 * ```ts
 * const query: GetAgentRunQuery = { context, runId: 'run_123' };
 * ```
 */
export interface GetAgentRunQuery {
  /** Agent ID、Principal、request digest、要求時刻を含む検証済み context です。 */
  readonly context: AgentCoreRequestContext;
  /** 取得対象の AgentRun ID です。空文字は store 操作側で validation error になります。 */
  readonly runId: string;
}

/**
 * Durable Object が受け取る Agent-scoped ListRuns query を表します。
 *
 * Agent ID に閉じた Run 一覧を Thread、status、作成時刻範囲、cursor scope で
 * 絞り込むための入力です。pagination token は同じ filter scope でのみ再利用できます。
 *
 * @example
 * ```ts
 * const query: ListAgentRunsQuery = { context, pageSize: 25, status: 'pending' };
 * ```
 */
export interface ListAgentRunsQuery {
  /** Agent ID、Principal、request digest、要求時刻を含む検証済み context です。 */
  readonly context: AgentCoreRequestContext;
  /** 作成時刻の上限 epoch milliseconds です。`startMs` より小さい場合は validation error です。 */
  readonly endMs?: number;
  /** 呼び出し元が保持する cursor scope です。現在の filter scope と異なる場合は authorization error です。 */
  readonly pageCursorScope?: string;
  /** 1 page あたりの要求件数です。store 操作側で 1〜100 件に丸められます。 */
  readonly pageSize?: number;
  /** 前 page の `nextPageToken` です。空文字または未指定なら先頭 page から取得します。 */
  readonly pageToken?: string;
  /** 作成時刻の下限 epoch milliseconds です。`endMs` より大きい場合は validation error です。 */
  readonly startMs?: number;
  /** Run status filter です。空文字または未指定なら status では絞り込みません。 */
  readonly status?: string;
  /** Thread ID filter です。指定した Thread が存在しない場合は not_found error です。 */
  readonly threadId?: string;
}

/**
 * Agent-local 認可後に 1 件の AgentRun と immutable snapshot metadata を返します。
 *
 * @param input Agent ID、GetRun query、Agent-owned storage repositories をまとめた入力です。
 * @returns Run detail と snapshot 情報を含む GetRun result を返す Promise です。
 * @throws Agent context の Agent ID が一致しない場合、認可に失敗した場合、`runId` が空の場合、または Run が存在しない場合に Agent domain error を送出します。
 *
 * @example
 * ```ts
 * const result = await getRunFromStore({ agentId, query, repositories });
 * ```
 */
export function getRunFromStore(input: {
  readonly agentId: string;
  readonly query: GetAgentRunQuery;
  readonly repositories: AgentStorageRepositories;
}): Promise<GetAgentRunResult> {
  assertAgentContext(input.agentId, input.query.context);
  authorizeRunOperation(input.repositories, input.query.context, 'run.get', 'GetRun', 'read');
  const run = requireRun(input.repositories, input.query.runId);
  return createGetRunResult({ agentId: input.agentId, repositories: input.repositories, run });
}

/**
 * Agent-scoped Runs を Thread、status、時刻範囲、cursor scope で絞り込んで返します。
 *
 * @param input Agent ID、ListRuns query、Agent-owned storage repositories をまとめた入力です。
 * @returns page metadata と Run detail 配列を含む ListRuns result を返します。
 * @throws Agent context の Agent ID が一致しない場合、認可に失敗した場合、時刻範囲や cursor scope が不正な場合、または指定 Thread が存在しない場合に Agent domain error を送出します。
 *
 * @example
 * ```ts
 * const result = listRunsFromStore({ agentId, query, repositories });
 * ```
 */
export function listRunsFromStore(input: {
  readonly agentId: string;
  readonly query: ListAgentRunsQuery;
  readonly repositories: AgentStorageRepositories;
}): ListAgentRunsResult {
  assertAgentContext(input.agentId, input.query.context);
  authorizeRunOperation(input.repositories, input.query.context, 'run.list', 'ListRuns', 'read');
  assertTimeRange(input.query.startMs, input.query.endMs);
  assertThreadFilter(input.repositories, input.query.threadId);
  const cursorScope = createRunListCursorScope(input.agentId, input.query);
  assertCursorScope(input.query.pageCursorScope, cursorScope);
  const pageSize = clampPageSize(input.query.pageSize);
  const cursor = parseRunPageToken(input.query.pageToken);
  const rows = input.repositories.pendingRuns.listRuns({
    afterCreatedAtMs: cursor?.createdAtMs,
    afterRunId: cursor?.runId,
    endCreatedAtMs: input.query.endMs,
    limit: pageSize + 1,
    startCreatedAtMs: input.query.startMs,
    status: normalizeOptionalFilter(input.query.status),
    threadId: normalizeOptionalFilter(input.query.threadId),
  });
  const pageRows = rows.slice(0, pageSize);
  return {
    page: createPage(cursorScope, pageRows, rows.length > pageSize),
    runs: pageRows.map((run) => mapAgentRunDetailRow(input.agentId, input.repositories, run)),
  };
}

function assertThreadFilter(
  repositories: AgentStorageRepositories,
  threadId: string | undefined
): void {
  if (
    threadId !== undefined &&
    threadId !== '' &&
    repositories.threads.findByThreadId(threadId) === undefined
  ) {
    throw createAgentDomainError({ kind: 'not_found', message: 'Thread not found.' });
  }
}

function assertCursorScope(actual: string | undefined, expected: string): void {
  if (actual !== undefined && actual !== '' && actual !== expected) {
    throw createAgentDomainError({
      kind: 'authorization',
      message: 'Pagination cursor is outside the requested Agent Run scope.',
    });
  }
}

function assertTimeRange(startMs: number | undefined, endMs: number | undefined): void {
  if (startMs !== undefined && endMs !== undefined && startMs > endMs) {
    throw createAgentDomainError({
      kind: 'validation',
      message: 'Run time range start must be less than or equal to range end.',
    });
  }
}

function createRunListCursorScope(agentId: string, query: ListAgentRunsQuery): string {
  const parts = [`${agentId}:runs`];
  if (query.threadId !== undefined && query.threadId !== '') parts.push(`thread=${query.threadId}`);
  if (query.status !== undefined && query.status !== '') parts.push(`status=${query.status}`);
  if (query.startMs !== undefined) parts.push(`start=${String(query.startMs)}`);
  if (query.endMs !== undefined) parts.push(`end=${String(query.endMs)}`);
  return parts.join(':');
}

function createPage(
  cursorScope: string,
  rows: readonly AgentRunRow[],
  hasMore: boolean
): AgentPageView {
  const last = rows.at(-1);
  return {
    cursorScope,
    nextPageToken: hasMore && last !== undefined ? createRunPageToken(last) : undefined,
    resultCount: rows.length,
  };
}

function clampPageSize(pageSize: number | undefined): number {
  return Math.min(Math.max(pageSize ?? 50, 1), 100);
}

function parseRunPageToken(
  token: string | undefined
): { readonly createdAtMs: number; readonly runId?: string } | undefined {
  if (token === undefined || token === '') return undefined;
  const separator = token.indexOf(':');
  if (separator === -1) return { createdAtMs: parseNumericPageToken(token, 'run page token') };
  const createdAtMs = parseNumericPageToken(token.slice(0, separator), 'run page token');
  const runId = decodeURIComponent(token.slice(separator + 1));
  if (runId === '') {
    throw createAgentDomainError({ kind: 'validation', message: 'Invalid run page token.' });
  }
  return { createdAtMs, runId };
}

function parseNumericPageToken(token: string, label: string): number {
  const parsed = Number.parseInt(token, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw createAgentDomainError({ kind: 'validation', message: `Invalid ${label}.` });
  }
  return parsed;
}

function createRunPageToken(run: AgentRunRow): string {
  return `${String(run.createdAtMs)}:${encodeURIComponent(run.runId)}`;
}

function normalizeOptionalFilter(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}
