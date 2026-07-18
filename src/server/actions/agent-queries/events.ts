'use server';

import { loadAgentRpcClients } from '../../agent-rpc/agent-loader';
import { buildScopedPageRequest, type BrowserSafePagedResult } from '../browser-safe-helpers';

import {
  toBrowserSafeEventSummary,
  toBrowserSafePageInfo,
  type BrowserSafeEventSummary,
  type ListEventsOptions,
} from './view-models';

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
): Promise<BrowserSafePagedResult<BrowserSafeEventSummary>> {
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

  return {
    items: response.events.map(toBrowserSafeEventSummary),
    page: toBrowserSafePageInfo(response.page),
  };
}
