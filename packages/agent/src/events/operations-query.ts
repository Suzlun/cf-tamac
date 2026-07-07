import { assertAgentContext, mapAgentEventRow } from '../domain/agent-operation-utils';
import { createAgentDomainError } from '../domain/errors';

import { authorizeEventOperation } from './operations-authorization';

import type {
  AgentEventView,
  AgentPageView,
  GetAgentEventQuery,
  ListAgentEventsQuery,
  ListAgentEventsResult,
} from '../domain/agent-core';
import type { AgentEventRow, AgentStorageRepositories } from '../storage';

/**
 * Agent-owned storage から単一 Event を取得します。
 *
 * この query operation は Agent ID と request context の整合性を検査し、Event 取得に必要な
 * principal/scope/grant を確認したうえで、Event row を domain view へ変換します。
 * `includePayload` が true で inline payload が保存されている場合だけ、base64 から復元した
 * bytes を payload metadata に付与します。
 *
 * @param input 取得対象の Agent ID、GetEvent query、Agent-owned repository set を含む入力です。
 * @returns 指定された Event の domain view を返します。
 * @throws AgentDomainError Agent ID 不一致、認可失敗、Event 未検出が発生した場合に送出します。
 * @example
 * ```ts
 * const event = getEventFromStore({ agentId, query, repositories });
 * ```
 */
export function getEventFromStore(input: {
  readonly agentId: string;
  readonly query: GetAgentEventQuery;
  readonly repositories: AgentStorageRepositories;
}): AgentEventView {
  assertAgentContext(input.agentId, input.query.context);
  authorizeEventOperation(input.repositories, input.query.context, 'event.get', 'GetEvent');
  const event = input.repositories.events.findByEventId(input.query.eventId);
  if (event === undefined) {
    throw createAgentDomainError({ kind: 'not_found', message: 'Agent Event not found.' });
  }
  return withInlinePayload(input.agentId, event, input.query.includePayload);
}

/**
 * Agent-owned storage から Thread scoped な Event page を取得します。
 *
 * この query operation は Agent ID と request context の整合性、Event list 権限、Thread の存在を
 * 検査したうえで、Thread sequence cursor による pagination を適用します。cursor scope は
 * `agentId:threadId` に固定し、別 Agent や別 Thread の page token と混同しないようにします。
 *
 * @param input 取得対象の Agent ID、ListEvents query、Agent-owned repository set を含む入力です。
 * @returns Event view の配列と、次 page token/result count/cursor scope を含む page 情報を返します。
 * @throws AgentDomainError Agent ID 不一致、認可失敗、Thread 未検出が発生した場合に送出します。
 * @example
 * ```ts
 * const page = listEventsFromStore({ agentId, query, repositories });
 * ```
 */
export function listEventsFromStore(input: {
  readonly agentId: string;
  readonly query: ListAgentEventsQuery;
  readonly repositories: AgentStorageRepositories;
}): ListAgentEventsResult {
  assertAgentContext(input.agentId, input.query.context);
  authorizeEventOperation(input.repositories, input.query.context, 'event.list', 'ListEvents');
  assertThreadExists(input.repositories, input.query.threadId);
  const pageSize = Math.min(Math.max(input.query.pageSize ?? 50, 1), 100);
  const rows = input.repositories.events.listEvents({
    afterThreadSequence: parsePageToken(input.query.pageToken),
    eventType: input.query.eventType,
    limit: pageSize + 1,
    sectionId: input.query.sectionId,
    threadId: input.query.threadId,
  });
  const pageRows = rows.slice(0, pageSize);
  return {
    events: pageRows.map((row) => mapAgentEventRow(input.agentId, row)),
    page: createPage(input.agentId, input.query.threadId, pageRows, rows.length > pageSize),
  };
}

function assertThreadExists(repositories: AgentStorageRepositories, threadId: string): void {
  if (repositories.threads.findByThreadId(threadId) === undefined) {
    throw createAgentDomainError({ kind: 'not_found', message: 'Thread not found.' });
  }
}

function withInlinePayload(
  agentId: string,
  event: AgentEventRow,
  includePayload: boolean
): AgentEventView {
  const view = attachStoredPolicyToEvent(agentId, mapAgentEventRow(agentId, event), event);
  if (!includePayload || event.payloadInlineBase64 === null || view.payloadMetadata === undefined) {
    return view;
  }
  return {
    ...view,
    payloadMetadata: {
      ...view.payloadMetadata,
      inlineBytes: decodeBase64Bytes(event.payloadInlineBase64),
    },
  };
}

function attachStoredPolicyToEvent(
  agentId: string,
  event: AgentEventView,
  row: AgentEventRow
): AgentEventView {
  if (row.requestedModelPolicyRef === undefined || row.requestedModelPolicyRef === null) {
    return event;
  }
  const digest = row.requestedModelPolicyDigest;
  const version = row.requestedModelPolicyVersion;
  return {
    ...event,
    modelPolicy:
      digest === undefined || digest === null || version === undefined || version === null
        ? undefined
        : {
            agentId,
            decisionSchemaVersion: 'v1',
            modelId: '',
            policyDigest: digest,
            policyRef: row.requestedModelPolicyRef,
            provider: '',
            status: row.requestedModelPolicyValidationStatus ?? 'active',
            version,
          },
    policyOverrideSource: row.policyOverrideSource ?? undefined,
    requestedModelPolicyRef: row.requestedModelPolicyRef,
  };
}

function parsePageToken(token: string | undefined): number | undefined {
  if (token === undefined || token === '') return undefined;
  const parsed = Number.parseInt(token, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : undefined;
}

function createPage(
  agentId: string,
  threadId: string,
  rows: readonly AgentEventRow[],
  hasMore: boolean
): AgentPageView {
  const last = rows.at(-1);
  return {
    cursorScope: `${agentId}:${threadId}`,
    nextPageToken: hasMore && last !== undefined ? String(last.threadSequence) : undefined,
    resultCount: rows.length,
  };
}

function decodeBase64Bytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
