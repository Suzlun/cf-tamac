import {
  assertAgentContext,
  authorizeAgentOperation,
  mapAgentEventRow,
  mapAgentRunRow,
  mapAgentSectionRow,
  mapAgentThreadRow,
} from '../domain/agent-operation-utils';
import { createAgentDomainError } from '../domain/errors';

import type {
  AgentCompactionSnapshotReferenceView,
  AgentCoreRequestContext,
  AgentPageView,
  AgentPayloadMetadataView,
  AgentThreadCompactionView,
  AgentThreadHistoryResultView,
  AgentThreadMemoryItemView,
  AgentThreadMemoryView,
  GetAgentThreadQuery,
  GetAgentThreadResult,
  GetAgentThreadMemoryQuery,
  GetAgentThreadMemoryResult,
  GetLatestAgentThreadCompactionQuery,
  GetLatestAgentThreadCompactionResult,
  ListAgentSectionsQuery,
  ListAgentSectionsResult,
  ListAgentThreadsQuery,
  ListAgentThreadsResult,
  SearchAgentThreadHistoryQuery,
  SearchAgentThreadHistoryResult,
} from '../domain/agent-core';
import type {
  AgentHistoryIndexRow,
  AgentStorageRepositories,
  AgentThreadCompactionRow,
  AgentThreadMemoryItemRow,
  AgentThreadMemoryVersionRow,
  AgentThreadRow,
} from '../storage';

/**
 * Run ListThreads against Agent-owned storage with Agent-scoped cursor checks.
 */
export function listThreadsFromStore(input: {
  readonly agentId: string;
  readonly query: ListAgentThreadsQuery;
  readonly repositories: AgentStorageRepositories;
}): ListAgentThreadsResult {
  assertAgentContext(input.agentId, input.query.context);
  authorizeThreadQuery(input.repositories, input.query.context, 'thread.list', 'ListThreads');
  const cursorScope = createThreadListCursorScope(input.agentId);
  assertCursorScope(input.query.pageCursorScope, cursorScope);
  const pageSize = clampPageSize(input.query.pageSize);
  const rows = input.repositories.threads.listThreads({
    afterCreatedAtMs: parseNumericPageToken(input.query.pageToken, 'thread page token'),
    limit: pageSize + 1,
    normalizedThreadKeyPrefix: input.query.threadKeyPrefix?.normalize('NFC'),
    status: input.query.status,
  });
  const pageRows = rows.slice(0, pageSize);
  return {
    page: createPage(cursorScope, pageRows, rows.length > pageSize, (row) => row.createdAtMs),
    threads: pageRows.map((row) => mapThreadWithLatest(input.agentId, input.repositories, row)),
  };
}

/**
 * Run GetThread against Agent-owned storage.
 */
export function getThreadFromStore(input: {
  readonly agentId: string;
  readonly query: GetAgentThreadQuery;
  readonly repositories: AgentStorageRepositories;
}): GetAgentThreadResult {
  assertAgentContext(input.agentId, input.query.context);
  authorizeThreadQuery(input.repositories, input.query.context, 'thread.get', 'GetThread');
  const thread = input.repositories.threads.findByThreadId(input.query.threadId);
  if (thread === undefined) {
    throw createAgentDomainError({ kind: 'not_found', message: 'Thread not found.' });
  }
  const currentSection =
    thread.currentSectionId === null
      ? undefined
      : input.repositories.sections.findBySectionId(thread.threadId, thread.currentSectionId);
  const latestEvent = input.repositories.events.findLatestForThread(thread.threadId);
  const latestRun = input.repositories.pendingRuns.findLatestRunForThread(thread.threadId);
  return {
    currentSection:
      currentSection === undefined ? undefined : mapAgentSectionRow(input.agentId, currentSection),
    latestEvent:
      latestEvent === undefined ? undefined : mapAgentEventRow(input.agentId, latestEvent),
    latestRun: latestRun === undefined ? undefined : mapAgentRunRow(input.agentId, latestRun),
    thread: mapThreadWithLatest(input.agentId, input.repositories, thread),
  };
}

/**
 * Run ListSections against Agent-owned storage with Thread-scoped cursor checks.
 */
export function listSectionsFromStore(input: {
  readonly agentId: string;
  readonly query: ListAgentSectionsQuery;
  readonly repositories: AgentStorageRepositories;
}): ListAgentSectionsResult {
  assertAgentContext(input.agentId, input.query.context);
  authorizeThreadQuery(input.repositories, input.query.context, 'section.list', 'ListSections');
  assertThreadExists(input.repositories, input.query.threadId);
  const cursorScope = createSectionListCursorScope(input.agentId, input.query.threadId);
  assertCursorScope(input.query.pageCursorScope, cursorScope);
  const pageSize = clampPageSize(input.query.pageSize);
  assertSectionRange(input.query.startSectionOrdinal, input.query.endSectionOrdinal);
  const rows = input.repositories.sections.listSections({
    afterSectionOrdinal: parseNumericPageToken(input.query.pageToken, 'section page token'),
    endSectionOrdinal: input.query.endSectionOrdinal,
    limit: pageSize + 1,
    startSectionOrdinal: input.query.startSectionOrdinal,
    threadId: input.query.threadId,
  });
  const pageRows = rows.slice(0, pageSize);
  return {
    page: createPage(cursorScope, pageRows, rows.length > pageSize, (row) => row.sequence),
    sections: pageRows.map((row) => mapAgentSectionRow(input.agentId, row)),
  };
}

/**
 * Agent/Thread scope と最終認可を確認して、対象 Thread の latest ready Compaction だけを返します。
 *
 * @param input Agent ID、query、Agent-owned repository set を含む入力です。
 * @returns ready Compaction がある場合は digest 付き snapshot 参照を返し、ない場合は空結果を返します。
 * @throws AgentDomainError Thread が存在しない、または principal が読み取り権限を持たない場合に発生します。
 */
export function getLatestCompactionFromStore(input: {
  readonly agentId: string;
  readonly query: GetLatestAgentThreadCompactionQuery;
  readonly repositories: AgentStorageRepositories;
}): GetLatestAgentThreadCompactionResult {
  // DO identity と request context の Agent ID を照合し、別 Agent の Thread 参照を入口で止めます。
  assertAgentContext(input.agentId, input.query.context);
  authorizeThreadQuery(
    input.repositories,
    input.query.context,
    'thread.compaction.get_latest',
    'GetLatestCompaction'
  );
  assertThreadExists(input.repositories, input.query.threadId);

  // repository は status=ready だけを返すため、running/failed/cancelled は usable context へ入れません。
  const compaction = input.repositories.compactions.findLatestReadyCompaction(input.query.threadId);
  if (compaction === undefined) return {};
  return {
    compaction: mapThreadCompaction(input.agentId, compaction),
    snapshot: mapCompactionSnapshot(input.agentId, compaction),
  };
}

/**
 * Agent/Thread scope と最終認可を確認して、active ThreadMemory version と item lineage を返します。
 *
 * @param input Agent ID、query、Agent-owned repository set を含む入力です。
 * @returns usable な active ThreadMemory version と、その version に属する item 群を返します。
 * @throws AgentDomainError Thread が存在しない、または principal が読み取り権限を持たない場合に発生します。
 */
export function getThreadMemoryFromStore(input: {
  readonly agentId: string;
  readonly query: GetAgentThreadMemoryQuery;
  readonly repositories: AgentStorageRepositories;
}): GetAgentThreadMemoryResult {
  // Agent ID、principal、Thread 所有関係を順に確認し、Client/別 Agent の状態混入を防ぎます。
  assertAgentContext(input.agentId, input.query.context);
  authorizeThreadQuery(
    input.repositories,
    input.query.context,
    'thread.memory.get',
    'GetThreadMemory'
  );
  assertThreadExists(input.repositories, input.query.threadId);

  // active version は repository 側で status=active かつ version 降順に選びます。
  const memory = input.repositories.memory.findActiveThreadMemoryVersion(input.query.threadId);
  if (memory === undefined || !isMemoryVersionBackedByReadyCompaction(input.repositories, memory)) {
    return { items: [] };
  }

  // item は active version の snapshot として返し、supersede/provenance lineage を維持します。
  const items = input.repositories.memory.listThreadMemoryItems(
    input.query.threadId,
    memory.memoryId
  );
  return {
    items: items.map((item) => mapThreadMemoryItem(input.agentId, item)),
    memory: mapThreadMemory(input.agentId, memory),
  };
}

/**
 * Agent/Thread scope と最終認可を確認して、ready Compaction 由来の ThreadHistory index だけを検索します。
 *
 * @param input Agent ID、query/filter、Agent-owned repository set を含む入力です。
 * @returns filter と cursor を適用した History metadata 結果を返します。raw R2 body は返しません。
 * @throws AgentDomainError Thread が存在しない、cursor scope が違う、または time range が不正な場合に発生します。
 */
export function searchThreadHistoryFromStore(input: {
  readonly agentId: string;
  readonly query: SearchAgentThreadHistoryQuery;
  readonly repositories: AgentStorageRepositories;
}): SearchAgentThreadHistoryResult {
  // Agent ID と final authorization を先に確認し、検索条件の処理前に unauthorized access を止めます。
  assertAgentContext(input.agentId, input.query.context);
  authorizeThreadQuery(
    input.repositories,
    input.query.context,
    'thread.history.search',
    'SearchThreadHistory'
  );
  assertThreadExists(input.repositories, input.query.threadId);
  assertTimeRange(input.query.startCreatedAtMs, input.query.endCreatedAtMs);

  // cursor scope は Agent/Thread 固定にし、別 Agent/Thread の cursor reuse を拒否します。
  const cursorScope = createHistorySearchCursorScope(input.agentId, input.query.threadId);
  assertCursorScope(input.query.pageCursorScope, cursorScope);
  const pageSize = clampPageSize(input.query.pageSize);
  const cursor = parseHistoryPageToken(input.query.pageToken);
  const historyPage = collectReadyHistoryPage(input.repositories, input.query, cursor, pageSize);
  return {
    page: createPage(
      cursorScope,
      historyPage.rows,
      historyPage.hasMore,
      createHistoryPageTokenForRow
    ),
    results: historyPage.rows.map((row) => mapThreadHistoryResult(input.agentId, row)),
  };
}

function collectReadyHistoryPage(
  repositories: AgentStorageRepositories,
  query: SearchAgentThreadHistoryQuery,
  cursor: { readonly createdAtMs: number; readonly historyId?: string } | undefined,
  pageSize: number
): { readonly hasMore: boolean; readonly rows: readonly AgentHistoryIndexRow[] } {
  // storage index は Compaction status を join しないため、ready rows が page を満たすまで安全に前方走査します。
  const readyRows: AgentHistoryIndexRow[] = [];
  let scanCursor = cursor;
  const scanBatchSize = Math.max(pageSize + 1, 25);
  while (readyRows.length <= pageSize) {
    const scannedRows = repositories.history.searchHistoryIndexes({
      afterCreatedAtMs: scanCursor?.createdAtMs,
      afterHistoryId: scanCursor?.historyId,
      compactionId: normalizeOptionalFilter(query.compactionId),
      endCreatedAtMs: query.endCreatedAtMs,
      limit: scanBatchSize,
      provenanceContains: normalizeOptionalFilter(query.provenanceContains),
      query: normalizeOptionalFilter(query.query),
      sectionId: normalizeOptionalFilter(query.sectionId),
      startCreatedAtMs: query.startCreatedAtMs,
      threadId: query.threadId,
    });
    if (scannedRows.length === 0) return { hasMore: false, rows: readyRows };
    readyRows.push(...scannedRows.filter((row) => isReadyHistoryIndex(repositories, row)));
    if (readyRows.length > pageSize) return { hasMore: true, rows: readyRows.slice(0, pageSize) };
    if (scannedRows.length < scanBatchSize) return { hasMore: false, rows: readyRows };
    scanCursor = createHistoryCursorFromScannedRows(scannedRows);
  }
  return { hasMore: true, rows: readyRows.slice(0, pageSize) };
}

function authorizeThreadQuery(
  repositories: AgentStorageRepositories,
  context: AgentCoreRequestContext,
  action: string,
  method: string
): void {
  authorizeAgentOperation({
    action,
    context,
    method,
    repositories,
    requiredPrincipalTypes: ['CLIENT_SERVICE', 'ADMIN_OPERATOR', 'INTERNAL_SERVICE'],
    requiredScopes: ['agent.rpc', 'agent.read'],
    service: 'cftamac.agent.v1.AgentThreadService',
  });
}

function mapThreadWithLatest(
  agentId: string,
  repositories: AgentStorageRepositories,
  thread: AgentThreadRow
) {
  const latestEvent = repositories.events.findLatestForThread(thread.threadId);
  const latestRun = repositories.pendingRuns.findLatestRunForThread(thread.threadId);
  return {
    ...mapAgentThreadRow(agentId, thread),
    latestEventId: latestEvent?.eventId,
    latestRunId: latestRun?.runId,
  };
}

function assertThreadExists(repositories: AgentStorageRepositories, threadId: string): void {
  if (repositories.threads.findByThreadId(threadId) === undefined) {
    throw createAgentDomainError({ kind: 'not_found', message: 'Thread not found.' });
  }
}

function assertCursorScope(actual: string | undefined, expected: string): void {
  if (actual !== undefined && actual !== '' && actual !== expected) {
    throw createAgentDomainError({
      kind: 'authorization',
      message: 'Pagination cursor is outside the requested Agent scope.',
    });
  }
}

function assertSectionRange(start: number | undefined, end: number | undefined): void {
  if (start !== undefined && end !== undefined && start > end) {
    throw createAgentDomainError({
      kind: 'validation',
      message: 'Section range start must be less than or equal to range end.',
    });
  }
}

function assertTimeRange(start: number | undefined, end: number | undefined): void {
  if (start !== undefined && end !== undefined && start > end) {
    throw createAgentDomainError({
      kind: 'validation',
      message: 'History time range start must be less than or equal to range end.',
    });
  }
}

function clampPageSize(pageSize: number | undefined): number {
  return Math.min(Math.max(pageSize ?? 50, 1), 100);
}

function parseNumericPageToken(token: string | undefined, label: string): number | undefined {
  if (token === undefined || token === '') return undefined;
  const parsed = Number.parseInt(token, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw createAgentDomainError({ kind: 'validation', message: `Invalid ${label}.` });
  }
  return parsed;
}

function parseHistoryPageToken(
  token: string | undefined
): { readonly createdAtMs: number; readonly historyId?: string } | undefined {
  if (token === undefined || token === '') return undefined;
  const separator = token.indexOf(':');
  if (separator === -1) {
    return { createdAtMs: parseRequiredNumericPageToken(token, 'history page token') };
  }
  const createdAtMs = parseRequiredNumericPageToken(
    token.slice(0, separator),
    'history page token'
  );
  const historyId = decodeURIComponent(token.slice(separator + 1));
  if (historyId === '') {
    throw createAgentDomainError({ kind: 'validation', message: 'Invalid history page token.' });
  }
  return { createdAtMs, historyId };
}

function parseRequiredNumericPageToken(token: string, label: string): number {
  const parsed = Number.parseInt(token, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw createAgentDomainError({ kind: 'validation', message: `Invalid ${label}.` });
  }
  return parsed;
}

function createHistoryCursorFromScannedRows(rows: readonly AgentHistoryIndexRow[]): {
  readonly createdAtMs: number;
  readonly historyId: string;
} {
  const last = rows.at(-1);
  if (last === undefined) {
    throw createAgentDomainError({ kind: 'internal', message: 'History scan cursor is missing.' });
  }
  return { createdAtMs: last.createdAtMs, historyId: last.historyId };
}

function createThreadListCursorScope(agentId: string): string {
  return `${agentId}:threads`;
}

function createSectionListCursorScope(agentId: string, threadId: string): string {
  return `${agentId}:${threadId}:sections`;
}

function createHistorySearchCursorScope(agentId: string, threadId: string): string {
  return `${agentId}:${threadId}:history`;
}

function createPage<T>(
  cursorScope: string,
  rows: readonly T[],
  hasMore: boolean,
  getToken: (row: T) => number | string
): AgentPageView {
  const last = rows.at(-1);
  return {
    cursorScope,
    nextPageToken: hasMore && last !== undefined ? String(getToken(last)) : undefined,
    resultCount: rows.length,
  };
}

function mapThreadCompaction(
  agentId: string,
  row: AgentThreadCompactionRow
): AgentThreadCompactionView {
  return {
    agentId,
    completedAtMs: row.completedAtMs ?? undefined,
    compactionId: row.compactionId,
    compactionOrdinal: row.compactionOrdinal,
    digestSha256: row.digestSha256 ?? undefined,
    endThreadSequence: row.endThreadSequence,
    handoffRef: row.handoffRef ?? undefined,
    historyRef: row.historyRef ?? undefined,
    memoryDeltaRef: row.memoryDeltaRef ?? undefined,
    sectionId: row.sectionId,
    sectionOrdinal: row.sectionOrdinal,
    startedAtMs: row.startedAtMs ?? undefined,
    startThreadSequence: row.startThreadSequence,
    status: row.status,
    threadId: row.threadId,
  };
}

function mapCompactionSnapshot(
  agentId: string,
  row: AgentThreadCompactionRow
): AgentCompactionSnapshotReferenceView | undefined {
  // snapshot は output/digest が揃った ready Compaction だけに付け、未完成 output を再開文脈へ混ぜません。
  if (row.outputRef === null || row.digestSha256 === null) return undefined;
  return {
    agentId,
    compactionId: row.compactionId,
    digestSha256: row.digestSha256,
    sectionId: row.sectionId,
    snapshotRef: row.outputRef,
    threadId: row.threadId,
  };
}

function mapThreadMemory(agentId: string, row: AgentThreadMemoryVersionRow): AgentThreadMemoryView {
  return {
    agentId,
    itemCount: row.itemCount,
    latestCompactionId: row.latestCompactionId ?? undefined,
    memoryId: row.memoryId,
    memoryRef: row.memoryRef ?? undefined,
    rebaseStatus: row.rebaseStatus ?? undefined,
    snapshotRef: row.snapshotRef ?? undefined,
    threadId: row.threadId,
    updatedAtMs: row.updatedAtMs,
    version: row.version,
  };
}

function mapThreadMemoryItem(
  agentId: string,
  row: AgentThreadMemoryItemRow
): AgentThreadMemoryItemView {
  return {
    agentId,
    contentRef: mapStoredReference(
      row.contentRef,
      'text/plain; charset=utf-8',
      0,
      row.contentSha256
    ),
    memoryId: row.memoryId,
    memoryItemId: row.memoryItemId,
    provenanceRef: row.provenanceRef ?? undefined,
    status: row.status,
    supersedesItemId: row.supersedesItemId ?? undefined,
    threadId: row.threadId,
  };
}

function mapThreadHistoryResult(
  agentId: string,
  row: AgentHistoryIndexRow
): AgentThreadHistoryResultView {
  return {
    agentId,
    body: mapStoredReference(
      row.bodyRef,
      row.bodyContentType,
      row.bodyByteSize,
      row.bodySha256,
      row.bodyStorageClass
    ),
    compactionId: row.compactionId ?? undefined,
    createdAtMs: row.createdAtMs,
    historyId: row.historyId,
    historyRef: row.historyRef,
    provenanceRef: row.provenanceRef ?? undefined,
    sectionId: row.sectionId ?? undefined,
    summary: row.summary ?? undefined,
    threadId: row.threadId,
  };
}

function mapStoredReference(
  ref: string | null,
  contentType: string | null,
  byteSize: number | null,
  sha256: string | null,
  storageClass: string | null = 'reference'
): AgentPayloadMetadataView | undefined {
  if (ref === null || sha256 === null) return undefined;
  return {
    byteSize: byteSize ?? 0,
    contentType: contentType ?? 'application/octet-stream',
    ref,
    sha256,
    storageClass: normalizeStorageClass(storageClass),
  };
}

function isMemoryVersionBackedByReadyCompaction(
  repositories: AgentStorageRepositories,
  memory: AgentThreadMemoryVersionRow
): boolean {
  // 手動 seed など Compaction 未紐付けの active Memory は許可し、紐付けがある場合は ready だけを許可します。
  if (memory.latestCompactionId === null) return true;
  return repositories.compactions.findByCompactionId(memory.latestCompactionId)?.status === 'ready';
}

function isReadyHistoryIndex(
  repositories: AgentStorageRepositories,
  row: AgentHistoryIndexRow
): boolean {
  // History を usable context として返すには、所有 Compaction が ready であることを必須にします。
  if (row.compactionId === null) return false;
  return repositories.compactions.findByCompactionId(row.compactionId)?.status === 'ready';
}

function createHistoryPageTokenForRow(row: AgentHistoryIndexRow): string {
  return `${String(row.createdAtMs)}:${encodeURIComponent(row.historyId)}`;
}

function normalizeStorageClass(value: string | null): 'inline' | 'r2' | 'reference' {
  return value === 'inline' || value === 'r2' ? value : 'reference';
}

function normalizeOptionalFilter(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}
