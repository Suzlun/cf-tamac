'use server';

import { loadAgentRpcClients } from '../../agent-rpc/agent-loader';
import {
  executeBrowserSafeAgentRpcQuery,
  type BrowserSafeAgentRpcActionResult,
} from '../../agent-rpc/safe-results';
import { buildScopedPageRequest, type BrowserSafePagedResult } from '../browser-safe-helpers';

import {
  toBrowserSafeEventSummary,
  toBrowserSafePageInfo,
  type BrowserSafeEventSummary,
  type ListEventsOptions,
} from './view-models';

/**
 * Event 一覧 query が Browser へ返す allowlisted display DTO です。
 *
 * @remarks
 * Event row は `toBrowserSafeEventSummary`、page は `toBrowserSafePageInfo` を必ず経由します。
 * generated response、payload body、SDK diagnostic はこの DTO に含めません。
 */
export type BrowserSafeEventListDisplayData = BrowserSafePagedResult<BrowserSafeEventSummary>;

/**
 * AgentEventService.ListEvents を Thread-scoped cursor と filter 付きで呼び出す。
 *
 * @param agentId - Event を読み出す Agent aggregate の ID。
 * @param options - Thread ID、任意の section/event type filter、cursor 入力。
 * @returns Browser-safe Event summary と page metadata。
 * @remarks Thread ID を request に必須で入れ、Client D1 に Event snapshot を保存しない。
 */
export async function listEvents(
  agentId: string,
  options: ListEventsOptions
): Promise<BrowserSafeAgentRpcActionResult<BrowserSafeEventListDisplayData>> {
  return executeBrowserSafeAgentRpcQuery(
    async () => {
      // Thread scope と cursor scope を server-only SDK request に固定して Event 一覧を取得します。
      const { clients } = await loadAgentRpcClients(agentId);
      const response = await clients.withErrorNormalization(() =>
        clients.events.listEvents({
          agentId,
          threadId: options.threadId,
          page: buildScopedPageRequest(agentId, `events:${options.threadId}`, options.page),
          sectionId: options.sectionId,
          eventType: options.eventType,
        })
      );
      return { correlationId: clients.invocation.correlationId, response };
    },
    (response) => ({
      // Event payload 全体を返さず、row/page の明示的な安全 mapper 出力だけを display DTO に入れます。
      items: response.events.map(toBrowserSafeEventSummary),
      page: toBrowserSafePageInfo(response.page),
    }),
    'Event一覧を取得しました',
    'Eventの安全な一覧情報を表示しています。',
    'Event一覧を確認してください',
    'Event一覧を確認できませんでした。時間をおいてもう一度表示してください。'
  );
}
