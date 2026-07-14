'use server';

import { loadAgentRpcClients } from '../../agent-rpc/agent-loader';
import {
  executeBrowserSafeAgentRpcQuery,
  type BrowserSafeAgentRpcActionResult,
} from '../../agent-rpc/safe-results';
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
 * Thread 一覧 query が Browser へ返す allowlisted display DTO です。
 *
 * @remarks
 * row は `toBrowserSafeThreadSummary`、cursor は `toBrowserSafePageInfo` の出力だけで構成します。
 * Agent-owned snapshot body、SDK response、credential context は含めません。
 */
export type BrowserSafeThreadListDisplayData = BrowserSafePagedResult<BrowserSafeThreadSummary>;

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
): Promise<BrowserSafeAgentRpcActionResult<BrowserSafeThreadListDisplayData>> {
  return executeBrowserSafeAgentRpcQuery(
    async () => {
      // Agent scope と cursor scope を request に固定して、Thread 正本を server-side で取得します。
      const { clients } = await loadAgentRpcClients(agentId);
      const response = await clients.withErrorNormalization(() =>
        clients.threads.listThreads({
          agentId,
          page: buildScopedPageRequest(agentId, 'threads', options.page),
          status: options.status,
          threadKeyPrefix: options.threadKeyPrefix,
        })
      );
      return { correlationId: clients.invocation.correlationId, response };
    },
    (response) => ({
      // generated Thread row をそのまま返さず、明示的な summary/page mapper の結果だけを返します。
      items: response.threads.map(toBrowserSafeThreadSummary),
      page: toBrowserSafePageInfo(response.page),
    }),
    'Thread一覧を取得しました',
    'Threadの安全な一覧情報を表示しています。',
    'Thread一覧を確認してください',
    'Thread一覧を確認できませんでした。時間をおいてもう一度表示してください。'
  );
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
): Promise<BrowserSafeAgentRpcActionResult<BrowserSafeThreadDetail>> {
  return executeBrowserSafeAgentRpcQuery(
    async () => {
      // detail request は caller の thread ID を Agent-scoped SDK invocation にだけ渡します。
      const { clients } = await loadAgentRpcClients(agentId);
      const response = await clients.withErrorNormalization(() =>
        clients.threads.getThread({ agentId, threadId })
      );
      return { correlationId: clients.invocation.correlationId, response };
    },
    (response) => {
      // latest Event/Run も各 summary mapper を通し、generated nested object を Browser へ流しません。
      const thread = toSafeRecord(response.thread);
      return {
        threadId: toOptionalString(thread?.threadId) ?? threadId,
        threadKey: toOptionalString(thread?.threadKey) ?? '',
        status: toOptionalString(thread?.status) ?? '',
        currentSection: toBrowserSafeThreadSection(response.currentSection),
        latestEvent: toBrowserSafeEventSummary(response.latestEvent),
        latestRun: toBrowserSafeRunSummary(response.latestRun),
      };
    },
    'Thread詳細を取得しました',
    'Threadの安全な詳細情報を表示しています。',
    'Thread詳細を確認してください',
    'Thread詳細を確認できませんでした。時間をおいてもう一度表示してください。'
  );
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
): Promise<BrowserSafeAgentRpcActionResult<BrowserSafeCompactionDetail>> {
  return executeBrowserSafeAgentRpcQuery(
    async () => {
      // Compaction の raw body ではなく、Agent RPC response を server-only に受け取ります。
      const { clients } = await loadAgentRpcClients(agentId);
      const response = await clients.withErrorNormalization(() =>
        clients.threads.getLatestCompaction({ agentId, threadId })
      );
      return { correlationId: clients.invocation.correlationId, response };
    },
    (response) => toBrowserSafeCompaction(response.compaction, response.snapshot),
    'Compaction情報を取得しました',
    'Compactionの安全な参照情報を表示しています。',
    'Compaction情報を確認してください',
    'Compaction情報を確認できませんでした。時間をおいてもう一度表示してください。'
  );
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
): Promise<BrowserSafeAgentRpcActionResult<BrowserSafeThreadMemoryDetail>> {
  return executeBrowserSafeAgentRpcQuery(
    async () => {
      // Memory の本文 blob は取得結果を Browser へ渡さず、server-only mapper に閉じます。
      const { clients } = await loadAgentRpcClients(agentId);
      const response = await clients.withErrorNormalization(() =>
        clients.threads.getThreadMemory({ agentId, threadId })
      );
      return { correlationId: clients.invocation.correlationId, response };
    },
    (response) => {
      // Memory item は content reference/provenance の allowlisted metadata だけへ射影します。
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
    },
    'Thread Memoryを取得しました',
    'Thread Memoryの安全な参照情報を表示しています。',
    'Thread Memoryを確認してください',
    'Thread Memoryを確認できませんでした。時間をおいてもう一度表示してください。'
  );
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
): Promise<BrowserSafeAgentRpcActionResult<BrowserSafeThreadHistoryResult>> {
  return executeBrowserSafeAgentRpcQuery(
    async () => {
      // History 検索条件は Agent/Thread scope を含む request としてだけ SDK に渡します。
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
      return { correlationId: clients.invocation.correlationId, response };
    },
    (response) => ({
      // History body は返さず、明示的に安全化した reference metadata と cursor だけを返します。
      items: response.results.map(toBrowserSafeHistoryItem),
      page: toBrowserSafePageInfo(response.page),
    }),
    'Thread履歴を取得しました',
    'Thread履歴の安全な参照情報を表示しています。',
    'Thread履歴を確認してください',
    'Thread履歴を確認できませんでした。時間をおいてもう一度表示してください。'
  );
}

function toOptionalInt64String(value: unknown): string | undefined {
  const converted = toSafeStringFromInt64(value);
  return converted === '' ? undefined : converted;
}
