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
  // generated request の identity を canonical form に固定してから、Provider 署名検証を行う Agent aggregate へ渡します。
  const agentId = requireAgentId(request.agentId);
  const installationId = requireIngressIdentity(request.installationId, 'installation_id');
  const connectionId = requireIngressIdentity(request.connectionId, 'connection_id');
  const idempotencyKey = requireIngressIdentity(request.idempotencyKey, 'idempotency_key');
  const event = request.event;
  const context = await createIntegrationIngressContext(
    {
      agentId,
      idempotencyKey,
      installationId,
      request,
    },
    'PublishEvent'
  );

  // Event payload と delivery context を generated request から domain command へ写像し、modelPolicyRef も既存通り event 側から伝播します。
  const result = await getAIAgentDurableObjectStub(env, agentId).publishIntegrationEvent({
    connectionId,
    context,
    deliveryCapability: event?.deliveryContext?.capability,
    deliveryExpiresAtMs: toNumber(event?.deliveryContext?.expiresAtUnixMs),
    deliveryMetadataRef: mapPayloadReference(event?.deliveryContext?.metadataRef),
    eventType: event?.eventType ?? '',
    installationId,
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
  // Tool result callback も ingress context を共有し、Provider の installation/invocation identity を NFC へ正規化します。
  const agentId = requireAgentId(request.agentId);
  const installationId = requireIngressIdentity(request.installationId, 'installation_id');
  const invocationId = requireIngressIdentity(request.invocationId, 'invocation_id');
  const idempotencyKey = requireIngressIdentity(request.idempotencyKey, 'idempotency_key');
  const context = await createIntegrationIngressContext(
    {
      agentId,
      idempotencyKey,
      installationId,
      request,
    },
    'PublishToolResult'
  );
  const result = await getAIAgentDurableObjectStub(env, agentId).publishIntegrationToolResult({
    context,
    installationId,
    invocationId,
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
  // Delivery result callback は delivery/installation identity を固定し、解決済み DeliveryContext との照合を AIAgent aggregate に委譲します。
  const agentId = requireAgentId(request.agentId);
  const installationId = requireIngressIdentity(request.installationId, 'installation_id');
  const deliveryId = requireIngressIdentity(request.deliveryId, 'delivery_id');
  const idempotencyKey = requireIngressIdentity(request.idempotencyKey, 'idempotency_key');
  const context = await createIntegrationIngressContext(
    {
      agentId,
      idempotencyKey,
      installationId,
      request,
    },
    'PublishDeliveryResult'
  );
  const result = await getAIAgentDurableObjectStub(env, agentId).publishIntegrationDeliveryResult({
    context,
    deliveryContextId: normalizeOptionalIngressIdentity(request.deliveryContextId),
    deliveryId,
    installationId,
    providerOperationId: request.providerOperationId,
    signature: mapSignatureInput(request),
    status: request.status,
  });
  return mapPublishDeliveryResultResponse(result);
}

async function createIntegrationIngressContext(
  input: {
    readonly agentId: string;
    readonly idempotencyKey: string;
    readonly installationId: string;
    readonly request:
      | PublishDeliveryResultRequest
      | PublishIntegrationEventRequest
      | PublishToolResultRequest;
  },
  method: 'PublishDeliveryResult' | 'PublishEvent' | 'PublishToolResult'
): Promise<AgentCoreRequestContext> {
  // detached metadata を除いた canonical unsigned Protobuf bytes の digest を一度だけ作り、署名・idempotency の同一入力にします。
  const signature = mapSignatureInput(input.request);
  const canonicalBodyDigest = await createUnsignedIngressBodyDigest(input.request, method);
  return {
    agentId: input.agentId,
    bodyDigest: canonicalBodyDigest,
    idempotencyKey: input.idempotencyKey,
    method,
    nonce: signature.nonce,
    principal: createUnverifiedIntegrationIngressPrincipal(
      input.agentId,
      input.installationId,
      signature
    ),
    requestTimestampMs: signature.timestampMs,
    requestedAtMs: Date.now(),
    service: integrationIngressServiceName,
  };
}

function createUnverifiedIntegrationIngressPrincipal(
  agentId: string,
  installationId: string,
  signature: IntegrationIngressSignatureInput
): AgentCoreRequestContext['principal'] {
  // dispatch は routing 用 identity だけを保持し、active trust key が検証した principal へ必ず置換されるまで final authorization に使いません。
  return {
    agentId,
    installationId,
    keyId: signature.keyId,
    principalId: installationId,
    principalType: 'INTEGRATION_INSTALLATION',
    scopes: [],
  };
}

function requireIngressIdentity(value: string | undefined, target: string): string {
  // canonical signature base と storage lookup の双方で同じ NFC-trimmed identity を使い、表記揺れを拒否します。
  const normalized = value?.trim().normalize('NFC');
  if (normalized === undefined || normalized === '') {
    throw createAgentDomainError({
      kind: 'validation',
      message: `Integration ingress ${target} is required.`,
      target,
    });
  }
  return normalized;
}

function normalizeOptionalIngressIdentity(value: string | undefined): string | undefined {
  // optional identity は空文字を未指定へ揃え、canonical signature base の `-` sentinel と同じ意味にします。
  const normalized = value?.trim().normalize('NFC');
  return normalized === undefined || normalized === '' ? undefined : normalized;
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
