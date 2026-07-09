'use server';

import { loadAgentRpcClients } from '../../agent-rpc/agent-loader';
import {
  buildScopedPageRequest,
  toOptionalString,
  toSafeNumber,
  toSafeRecord,
  toSafeStringFromInt64,
  type BrowserSafePagedResult,
} from '../browser-safe-helpers';

import {
  toBrowserSafeCompaction,
  toBrowserSafeEventSummary,
  toBrowserSafeHistoryItem,
  toBrowserSafePageInfo,
  toBrowserSafeRunSummary,
  toBrowserSafeThreadMemoryItem,
  toBrowserSafeThreadSection,
  toBrowserSafeThreadSummary,
  type BrowserSafeCompactionDetail,
  type BrowserSafeThreadDetail,
  type BrowserSafeThreadHistoryResult,
  type BrowserSafeThreadMemoryDetail,
  type BrowserSafeThreadSummary,
  type ListThreadsOptions,
  type SearchThreadHistoryOptions,
} from './view-models';

/**
 * AgentThreadService.ListThreads を Agent-scoped cursor 付きで呼び出す。
 *
 * @param agentId - Thread を読み出す Agent aggregate の ID。
 * @param options - 任意の status/thread key prefix filter と cursor 入力。
 * @returns Browser-safe Thread summary と page metadata。
 * @remarks Client D1 は Agent-owned Thread snapshot を保持しないため、常にAgent RPCから読み出す。
 */
export async function listThreads(
  agentId: string,
  options: ListThreadsOptions = {}
): Promise<BrowserSafePagedResult<BrowserSafeThreadSummary>> {
  const { clients } = await loadAgentRpcClients(agentId);
  const response = await clients.withErrorNormalization(() =>
    clients.threads.listThreads({
      agentId,
      page: buildScopedPageRequest(agentId, 'threads', options.page),
      status: options.status,
      threadKeyPrefix: options.threadKeyPrefix,
    })
  );

  return {
    items: response.threads.map(toBrowserSafeThreadSummary),
    page: toBrowserSafePageInfo(response.page),
  };
}

/**
 * AgentThreadService.GetThread を呼び、detail drawer 用の安全な Thread 詳細を返す。
 *
 * @param agentId - Thread を所有する Agent aggregate の ID。
 * @param threadId - detail を取得する Thread ID。
 * @returns Browser-safe Thread detail。
 * @remarks latest Event / Run は表示用 metadata だけへ変換し、payload body は返さない。
 */
export async function getThread(
  agentId: string,
  threadId: string
): Promise<BrowserSafeThreadDetail> {
  const { clients } = await loadAgentRpcClients(agentId);
  const response = await clients.withErrorNormalization(() =>
    clients.threads.getThread({ agentId, threadId })
  );

  const thread = toSafeRecord(response.thread);
  return {
    threadId: toOptionalString(thread?.threadId) ?? threadId,
    threadKey: toOptionalString(thread?.threadKey) ?? '',
    status: toOptionalString(thread?.status) ?? '',
    currentSection: toBrowserSafeThreadSection(response.currentSection),
    latestEvent: toBrowserSafeEventSummary(response.latestEvent),
    latestRun: toBrowserSafeRunSummary(response.latestRun),
  };
}

/**
 * AgentThreadService.GetLatestCompaction を呼び、latest ready 出力だけを返す。
 *
 * @param agentId - Compaction を所有する Agent aggregate の ID。
 * @param threadId - latest compaction を取得する Thread ID。
 * @returns Browser-safe compaction detail。
 * @remarks Handoff/History/MemoryDelta の本文は返さず、参照と digest だけを返す。
 */
export async function getLatestCompaction(
  agentId: string,
  threadId: string
): Promise<BrowserSafeCompactionDetail> {
  const { clients } = await loadAgentRpcClients(agentId);
  const response = await clients.withErrorNormalization(() =>
    clients.threads.getLatestCompaction({ agentId, threadId })
  );

  return toBrowserSafeCompaction(response.compaction, response.snapshot);
}

/**
 * AgentThreadService.GetThreadMemory を呼び、Memory lineage を安全化して返す。
 *
 * @param agentId - Memory を所有する Agent aggregate の ID。
 * @param threadId - Memory を取得する Thread ID。
 * @returns Browser-safe Thread memory detail。
 * @remarks Memory 本文 blob は返さず、lineage と参照 metadata だけを返す。
 */
export async function getThreadMemory(
  agentId: string,
  threadId: string
): Promise<BrowserSafeThreadMemoryDetail> {
  const { clients } = await loadAgentRpcClients(agentId);
  const response = await clients.withErrorNormalization(() =>
    clients.threads.getThreadMemory({ agentId, threadId })
  );

  const memory = toSafeRecord(response.memory);
  return {
    memoryId: toOptionalString(memory?.memoryId),
    version: toOptionalString(memory?.version),
    itemCount: toSafeNumber(memory?.itemCount),
    memoryRef: toOptionalString(memory?.memoryRef),
    snapshotRef: toOptionalString(memory?.snapshotRef),
    latestCompactionId: toOptionalString(memory?.latestCompactionId),
    rebaseStatus: toOptionalString(memory?.rebaseStatus),
    updatedAtUnixMs: toOptionalInt64String(memory?.updatedAtUnixMs),
    items: response.items.map(toBrowserSafeThreadMemoryItem),
  };
}

/**
 * AgentThreadService.SearchThreadHistory を呼び、R2 body 参照メタデータだけを返す。
 *
 * @param agentId - History を所有する Agent aggregate の ID。
 * @param threadId - 検索対象 Thread ID。
 * @param query - Agent RPC へ渡す検索 query。
 * @param options - 任意の section/compaction/provenance filter と cursor 入力。
 * @returns Browser-safe Thread history search result。
 * @remarks query は filter にも同じ値を入れ、検索 scope を Agent/Thread に固定する。
 */
export async function searchThreadHistory(
  agentId: string,
  threadId: string,
  query: string,
  options: SearchThreadHistoryOptions = {}
): Promise<BrowserSafeThreadHistoryResult> {
  const { clients } = await loadAgentRpcClients(agentId);
  const response = await clients.withErrorNormalization(() =>
    clients.threads.searchThreadHistory({
      agentId,
      threadId,
      query,
      page: buildScopedPageRequest(agentId, `history:${threadId}`, options.page),
      filter: {
        query,
        sectionId: options.sectionId,
        compactionId: options.compactionId,
        provenanceContains: options.provenanceContains,
      },
    })
  );

  return {
    items: response.results.map(toBrowserSafeHistoryItem),
    page: toBrowserSafePageInfo(response.page),
  };
}

function toOptionalInt64String(value: unknown): string | undefined {
  const converted = toSafeStringFromInt64(value);
  return converted === '' ? undefined : converted;
}
