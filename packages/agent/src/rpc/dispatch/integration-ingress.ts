import type {
  PublishDeliveryResultRequest,
  PublishDeliveryResultResponseSchema,
  PublishIntegrationEventRequest,
  PublishIntegrationEventResponseSchema,
  PublishToolResultRequest,
  PublishToolResultResponseSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { getAIAgentDurableObjectStub } from '../../agent-routing';
import { createAgentDomainError } from '../../domain/errors';
import { mapPayloadReference, requireAgentId, toNumber } from '../mappers/core';
import {
  mapPublishDeliveryResultResponse,
  mapPublishIntegrationEventResponse,
  mapPublishToolResultResponse,
} from '../mappers/integrations';

import {
  createUnsignedIngressBodyDigest,
  mapSignatureInput,
} from './integration-ingress-signature';

import type { AgentCoreRequestContext } from '../../domain';
import type { AgentWorkerEnv } from '../../env';
import type { IntegrationIngressSignatureInput } from '../../integrations';
import type { MessageInitShape } from '@bufbuild/protobuf';

const integrationIngressServiceName = 'cftamac.agent.v1.IntegrationIngressService';

type PublishIntegrationEventResponseInit = MessageInitShape<
  typeof PublishIntegrationEventResponseSchema
>;
type PublishToolResultResponseInit = MessageInitShape<typeof PublishToolResultResponseSchema>;
type PublishDeliveryResultResponseInit = MessageInitShape<
  typeof PublishDeliveryResultResponseSchema
>;

/**
 * IntegrationIngressService.PublishEvent を Agent-owned Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った signed ingress event、thread key、delivery context、idempotency key です。
 * @returns generated PublishIntegrationEventResponse の初期化値です。
 * @throws Agent ID、thread key、signature metadata、payload、または model policy override が不正な場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchPublishIntegrationEvent(env, request);
 * ```
 */
export async function dispatchPublishIntegrationEvent(
  env: AgentWorkerEnv,
  request: PublishIntegrationEventRequest
): Promise<PublishIntegrationEventResponseInit> {
  // Integration ingress は Provider 署名と unsigned body digest を context に固定してから Agent aggregate へ渡します。
  const agentId = requireAgentId(request.agentId);
  const event = request.event;
  const context = await createIntegrationIngressContext(agentId, request, 'PublishEvent');

  // Event payload と delivery context を generated request から domain command へ写像し、modelPolicyRef も既存通り event 側から伝播します。
  const result = await getAIAgentDurableObjectStub(env, agentId).publishIntegrationEvent({
    connectionId: request.connectionId,
    context,
    deliveryCapability: event?.deliveryContext?.capability,
    deliveryExpiresAtMs: toNumber(event?.deliveryContext?.expiresAtUnixMs),
    deliveryMetadataRef: mapPayloadReference(event?.deliveryContext?.metadataRef),
    eventType: event?.eventType ?? '',
    installationId: request.installationId,
    modelPolicyRef: event?.modelPolicyRef,
    occurredAtMs: toNumber(event?.occurredAtUnixMs),
    payload: event?.payload,
    payloadContentType: event?.payloadContentType,
    payloadReference: mapPayloadReference(event?.payloadReference),
    signature: mapSignatureInput(request),
    source: event?.source ?? 'integration',
    threadKey: request.threadKey,
  });
  return mapPublishIntegrationEventResponse(result);
}

/**
 * IntegrationIngressService.PublishToolResult を Agent-owned Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った signed tool result、installation ID、invocation ID、provider operation ID です。
 * @returns generated PublishToolResultResponse の初期化値です。
 * @throws Agent ID、signature metadata、tool result status、または invocation identity が不正な場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchPublishToolResult(env, request);
 * ```
 */
export async function dispatchPublishToolResult(
  env: AgentWorkerEnv,
  request: PublishToolResultRequest
): Promise<PublishToolResultResponseInit> {
  // Tool result callback も ingress context を共有し、status は domain が受け付ける値に限定します。
  const agentId = requireAgentId(request.agentId);
  const context = await createIntegrationIngressContext(agentId, request, 'PublishToolResult');
  const result = await getAIAgentDurableObjectStub(env, agentId).publishIntegrationToolResult({
    context,
    installationId: request.installationId,
    invocationId: request.invocationId,
    outputPayload: mapPayloadReference(request.outputPayload),
    outputRef: request.outputRef,
    providerOperationId: request.providerOperationId,
    signature: mapSignatureInput(request),
    status: normalizeToolResultStatus(request.status),
  });
  return mapPublishToolResultResponse(result);
}

/**
 * IntegrationIngressService.PublishDeliveryResult を Agent-owned Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った signed delivery result、delivery identity、provider operation ID です。
 * @returns generated PublishDeliveryResultResponse の初期化値です。
 * @throws Agent ID、signature metadata、delivery identity、または provider operation identity が不正な場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchPublishDeliveryResult(env, request);
 * ```
 */
export async function dispatchPublishDeliveryResult(
  env: AgentWorkerEnv,
  request: PublishDeliveryResultRequest
): Promise<PublishDeliveryResultResponseInit> {
  // Delivery result callback は delivery context と provider operation の一致検証を AIAgent aggregate に委譲します。
  const agentId = requireAgentId(request.agentId);
  const context = await createIntegrationIngressContext(agentId, request, 'PublishDeliveryResult');
  const result = await getAIAgentDurableObjectStub(env, agentId).publishIntegrationDeliveryResult({
    context,
    deliveryContextId: request.deliveryContextId,
    deliveryId: request.deliveryId,
    installationId: request.installationId,
    providerOperationId: request.providerOperationId,
    signature: mapSignatureInput(request),
    status: request.status,
  });
  return mapPublishDeliveryResultResponse(result);
}

async function createIntegrationIngressContext(
  agentId: string,
  request: PublishDeliveryResultRequest | PublishIntegrationEventRequest | PublishToolResultRequest,
  method: 'PublishDeliveryResult' | 'PublishEvent' | 'PublishToolResult'
): Promise<AgentCoreRequestContext> {
  // detached signature metadata と unsigned body digest を context に格納し、以降の監査・replay・署名検証で同じ値を参照させます。
  const signature = mapSignatureInput(request);
  const canonicalBodyDigest = await createUnsignedIngressBodyDigest(request, method);
  return {
    agentId,
    bodyDigest: canonicalBodyDigest,
    idempotencyKey: request.idempotencyKey,
    method,
    nonce: signature.nonce,
    principal: createIntegrationIngressPrincipal(agentId, request.installationId, signature),
    requestTimestampMs: signature.timestampMs,
    requestedAtMs: Date.now(),
    service: integrationIngressServiceName,
  };
}

function createIntegrationIngressPrincipal(
  agentId: string,
  installationId: string,
  signature: IntegrationIngressSignatureInput
): AgentCoreRequestContext['principal'] {
  // Provider callback の主体は installation trust key に結び付くため、principalId も installation ID で固定します。
  return {
    agentId,
    installationId,
    keyId: signature.keyId,
    principalId: installationId,
    principalType: 'INTEGRATION_INSTALLATION',
    scopes: [],
  };
}

function normalizeToolResultStatus(status: string): 'failed' | 'succeeded' {
  // generated field は string なので、domain に渡す前に現行 contract の二値へ fail-closed で狭めます。
  if (status === 'succeeded' || status === 'failed') return status;
  throw createAgentDomainError({
    kind: 'validation',
    message: 'Tool result status must be succeeded or failed.',
    target: 'status',
  });
}
