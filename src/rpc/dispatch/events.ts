import type {
  GetEventRequest,
  GetEventResponseSchema,
  ListEventsRequest,
  ListEventsResponseSchema,
  PublishEventRequest,
  PublishEventResponseSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { getAIAgentDurableObjectStub } from '../../agent-routing';
import { createAgentCoreContext } from '../command-context';
import {
  mapGetEventResponse,
  mapListEventsResponse,
  mapPayloadReference,
  mapPublishEventResponse,
  requireAgentId,
  toNumber,
} from '../mappers/core';

import type { AgentWorkerEnv } from '../../env';
import type { MessageInitShape } from '@bufbuild/protobuf';

type PublishEventResponseInit = MessageInitShape<typeof PublishEventResponseSchema>;
type GetEventResponseInit = MessageInitShape<typeof GetEventResponseSchema>;
type ListEventsResponseInit = MessageInitShape<typeof ListEventsResponseSchema>;

/**
 * AgentEventService.PublishEvent を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った Event、thread key、idempotency key、replay/security context です。
 * @returns generated PublishEventResponse の初期化値です。
 * @throws Agent ID、thread key、idempotency key、payload が不正な場合、または AIAgent 側の認可・永続化で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchPublishEvent(env, request);
 * ```
 */
export async function dispatchPublishEvent(
  env: AgentWorkerEnv,
  request: PublishEventRequest
): Promise<PublishEventResponseInit> {
  // Event publish は Agent ID と public thread key を Durable Object 内の event pipeline へ渡します。
  const agentId = requireAgentId(request.agentId);
  const event = request.event;
  const context = await createAgentCoreContext({
    agentId,
    causationId: event?.causationId,
    correlationId: event?.correlationId,
    fallbackDigestSeed: request,
    idempotencyKey: request.idempotencyKey,
    method: 'PublishEvent',
    replay: request.replay,
    security: request.security,
    service: 'cftamac.agent.v1.AgentEventService',
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).publishEvent({
    context,
    eventType: event?.eventType ?? '',
    occurredAtMs: toNumber(event?.occurredAtUnixMs),
    payload: event?.payload,
    payloadContentType: event?.payloadContentType,
    payloadReference: mapPayloadReference(event?.payloadReference),
    modelPolicyRef: event?.modelPolicyRef,
    source: event?.source ?? 'client',
    threadKey: request.threadKey,
  });
  return mapPublishEventResponse(result);
}

/**
 * AgentEventService.GetEvent を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った Event ID と payload 表示条件です。
 * @returns generated GetEventResponse の初期化値です。
 * @throws Agent ID や Event ID が不正な場合、または AIAgent 側の参照・認可で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchGetEvent(env, request);
 * ```
 */
export async function dispatchGetEvent(
  env: AgentWorkerEnv,
  request: GetEventRequest
): Promise<GetEventResponseInit> {
  // Event の取得は Agent-owned event store に限定し、payload 表示可否も request の明示条件に従います。
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'GetEvent',
    service: 'cftamac.agent.v1.AgentEventService',
  });
  const event = await getAIAgentDurableObjectStub(env, agentId).getEvent({
    context,
    eventId: request.eventId,
    includePayload: request.includePayload,
  });
  return mapGetEventResponse(event);
}

/**
 * AgentEventService.ListEvents を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った Thread/Section/Event type/page filter です。
 * @returns generated ListEventsResponse の初期化値です。
 * @throws Agent ID や pagination 入力が不正な場合、または AIAgent 側の参照・認可で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchListEvents(env, request);
 * ```
 */
export async function dispatchListEvents(
  env: AgentWorkerEnv,
  request: ListEventsRequest
): Promise<ListEventsResponseInit> {
  // List query も必ず Agent ID scope を持つ Durable Object へ閉じ、横断検索 RPC にしません。
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'ListEvents',
    service: 'cftamac.agent.v1.AgentEventService',
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).listEvents({
    context,
    eventType: request.eventType,
    pageSize: request.page?.pageSize,
    pageToken: request.page?.pageToken,
    sectionId: request.sectionId,
    threadId: request.threadId,
  });
  return mapListEventsResponse(result);
}
