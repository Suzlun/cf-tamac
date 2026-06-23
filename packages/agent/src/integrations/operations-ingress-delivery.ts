import { normalizeDeliveryContextInput } from '../adapters';
import {
  assertAgentContext,
  checkAgentIdempotency,
  recordAgentIdempotency,
  reserveAgentNonce,
} from '../domain/agent-operation-utils';
import { createAgentDomainError } from '../domain/errors';
import { publishEventInStore } from '../events';
import { recordToolResultInStore } from '../tools';

import { mapAdapterDeliveryRow, mapDeliveryContextRow } from './mappers';
import {
  assertInstallationActive,
  authorizeIntegrationOperation,
  createConnectionCapability,
  createProviderNonce,
  publishDeliveryResultOperationName,
  requireAdapterDefinition,
  requireConnection,
  requireContextIdempotency,
  requireDeliveryContext,
  requireInstallation,
  resolveIngressConnection,
} from './operation-shared';
import { getIntegrationDeliveryProviderRequestRecord } from './provider-client';
import { verifyIntegrationIngressSignature } from './security';

import type { AgentEventBlobWriter } from '../events';
import type { AgentAdapterDeliveryRow, AgentStorageRepositories } from '../storage';
import type {
  DeliverToIntegrationProviderCommand,
  DeliverToIntegrationProviderResult,
  PublishIntegrationDeliveryResult,
  PublishIntegrationDeliveryResultCommand,
  PublishIntegrationEventCommand,
  PublishIntegrationEventResult,
  PublishIntegrationToolResultCommand,
} from './types';

/** IntegrationIngressService.PublishEvent を検証して Event と任意 DeliveryContext を作成します。 */
export async function publishIntegrationEventInStore(input: {
  readonly agentId: string;
  readonly blobWriter: AgentEventBlobWriter;
  readonly command: PublishIntegrationEventCommand;
  readonly repositories: AgentStorageRepositories;
  readonly storageUsagePercent?: number;
}): Promise<PublishIntegrationEventResult> {
  assertAgentContext(input.agentId, input.command.context);
  const connection = resolveIngressConnection(input.repositories, input.command);
  const adapter = requireAdapterDefinition(
    input.repositories,
    connection.installationId,
    connection.adapterId
  );
  await verifyIntegrationIngressSignature({
    agentId: input.agentId,
    canonicalBodyDigest: input.command.context.bodyDigest,
    connectionId: connection.connectionId,
    idempotencyKey: requireContextIdempotency(input.command.context),
    installationId: input.command.installationId,
    method: 'PublishEvent',
    repositories: input.repositories,
    signature: input.command.signature,
  });
  authorizeIntegrationOperation(
    input.repositories,
    input.command.context,
    'integration.ingress.event',
    'PublishEvent',
    'ingress',
    createConnectionCapability(input.agentId, connection),
    [adapter.ingressGrant, 'agent.event']
  );
  const deliveryInput = normalizeDeliveryContextInput({
    connectionDeliveryCapabilityId: connection.deliveryCapabilityId ?? undefined,
    requestedCapability: input.command.deliveryCapability,
    requestedExpiresAtMs: input.command.deliveryExpiresAtMs,
    requestedMetadataRef: input.command.deliveryMetadataRef,
  });
  const deliveryContextId = deliveryInput === undefined ? undefined : crypto.randomUUID();
  const eventResult = await publishEventInStore({
    agentId: input.agentId,
    blobWriter: input.blobWriter,
    command: {
      context: input.command.context,
      deliveryContextId,
      eventType: input.command.eventType,
      occurredAtMs: input.command.occurredAtMs,
      payload: input.command.payload,
      payloadContentType: input.command.payloadContentType,
      payloadReference: input.command.payloadReference,
      source: input.command.source,
      threadKey: input.command.threadKey,
    },
    repositories: input.repositories,
    storageUsagePercent: input.storageUsagePercent,
  });
  const deliveryContext =
    deliveryInput === undefined || deliveryContextId === undefined
      ? undefined
      : input.repositories.integrations.createDeliveryContext({
          capability: deliveryInput.capability,
          connectionId: connection.connectionId,
          createdAtMs: input.command.context.requestedAtMs,
          deliveryContextId,
          eventId: eventResult.event.eventId,
          expiresAtMs: deliveryInput.expiresAtMs,
          installationId: connection.installationId,
          metadataRef: deliveryInput.metadataRef,
          status: 'active',
          threadId: eventResult.thread.threadId,
        });
  return {
    deliveryContext:
      deliveryContext === undefined ? undefined : mapDeliveryContextRow(deliveryContext),
    event: eventResult.event,
    replayed: eventResult.replayed,
    thread: eventResult.thread,
  };
}

/** IntegrationIngressService.PublishToolResult を検証して Tool result に委譲します。 */
export async function publishIntegrationToolResultInStore(input: {
  readonly agentId: string;
  readonly command: PublishIntegrationToolResultCommand;
  readonly repositories: AgentStorageRepositories;
}) {
  assertAgentContext(input.agentId, input.command.context);
  const invocation = input.repositories.tools.findInvocation(input.command.invocationId);
  if (invocation === undefined) {
    throw createAgentDomainError({ kind: 'not_found', message: 'ToolInvocation not found.' });
  }
  if (invocation.installationId !== input.command.installationId) {
    throw createAgentDomainError({
      kind: 'authorization',
      message: 'Tool result installation does not own invocation.',
      target: 'installation_id',
    });
  }
  await verifyIntegrationIngressSignature({
    agentId: input.agentId,
    canonicalBodyDigest: input.command.context.bodyDigest,
    idempotencyKey: requireContextIdempotency(input.command.context),
    installationId: input.command.installationId,
    invocationId: input.command.invocationId,
    method: 'PublishToolResult',
    repositories: input.repositories,
    signature: input.command.signature,
  });
  return recordToolResultInStore({
    agentId: input.agentId,
    command: {
      context: input.command.context,
      invocationId: input.command.invocationId,
      outputRef: input.command.outputPayload?.ref ?? input.command.outputRef,
      providerOperationId: input.command.providerOperationId,
      status: input.command.status,
    },
    repositories: input.repositories,
  });
}

/** IntegrationIngressService.PublishDeliveryResult を検証して AdapterDelivery を更新します。 */
export async function publishIntegrationDeliveryResultInStore(input: {
  readonly agentId: string;
  readonly command: PublishIntegrationDeliveryResultCommand;
  readonly repositories: AgentStorageRepositories;
}): Promise<PublishIntegrationDeliveryResult> {
  assertAgentContext(input.agentId, input.command.context);
  const replay = checkAgentIdempotency<PublishIntegrationDeliveryResult>({
    context: input.command.context,
    operationName: publishDeliveryResultOperationName,
    repositories: input.repositories,
  });
  if (replay.status === 'replay') return { ...replay.response, replayed: true };
  const delivery = requireDeliveryResultBinding(input);
  await verifyIntegrationIngressSignature({
    agentId: input.agentId,
    canonicalBodyDigest: input.command.context.bodyDigest,
    deliveryContextId: delivery.deliveryContextId,
    idempotencyKey: requireContextIdempotency(input.command.context),
    installationId: input.command.installationId,
    method: 'PublishDeliveryResult',
    repositories: input.repositories,
    signature: input.command.signature,
  });
  reserveAgentNonce(input.repositories, input.command.context);
  authorizeIntegrationOperation(
    input.repositories,
    input.command.context,
    'integration.delivery.result',
    'PublishDeliveryResult',
    'ingress',
    {
      adapterConnectionId: delivery.connectionId,
      capabilityId: delivery.deliveryContextId,
      capabilityKind: 'delivery',
      installationId: delivery.installationId,
      ownerAgentId: input.agentId,
    },
    ['integration.delivery.result']
  );
  const updated = input.repositories.integrations.updateDeliveryStatus({
    deliveryId: delivery.deliveryId,
    providerOperationId: input.command.providerOperationId,
    status: input.command.status,
    updatedAtMs: input.command.context.requestedAtMs,
  });
  const result = {
    delivery: mapAdapterDeliveryRow(updated),
    replayed: false,
    result: {
      agentId: input.agentId,
      connectionId: updated.connectionId,
      deliveryContextId: updated.deliveryContextId,
      deliveryId: input.command.deliveryId,
      installationId: input.command.installationId,
      providerOperationId: input.command.providerOperationId,
      status: input.command.status,
    },
  } satisfies PublishIntegrationDeliveryResult;
  recordAgentIdempotency({
    context: input.command.context,
    operationName: publishDeliveryResultOperationName,
    repositories: input.repositories,
    response: result,
  });
  return result;
}

function requireDeliveryResultBinding(input: {
  readonly command: PublishIntegrationDeliveryResultCommand;
  readonly repositories: AgentStorageRepositories;
}): AgentAdapterDeliveryRow {
  const delivery = input.repositories.integrations.findDelivery(input.command.deliveryId);
  if (delivery === undefined) {
    throw createAgentDomainError({ kind: 'not_found', message: 'AdapterDelivery not found.' });
  }
  if (delivery.installationId !== input.command.installationId) {
    throw createAgentDomainError({
      kind: 'authorization',
      message: 'Delivery result installation does not own delivery.',
      target: 'installation_id',
    });
  }
  if (
    input.command.deliveryContextId !== undefined &&
    input.command.deliveryContextId !== delivery.deliveryContextId
  ) {
    throw createAgentDomainError({
      kind: 'authorization',
      message: 'Delivery result does not match the original DeliveryContext.',
      target: 'delivery_context_id',
    });
  }
  const context = requireDeliveryContext(input.repositories, delivery.deliveryContextId);
  if (context.status !== 'active') {
    throw createAgentDomainError({
      kind: 'precondition',
      message: 'DeliveryContext is not active.',
      target: 'delivery_context_id',
    });
  }
  const connection = requireConnection(input.repositories, delivery.connectionId);
  if (connection.status !== 'active' || connection.connectionId !== context.connectionId) {
    throw createAgentDomainError({
      kind: 'precondition',
      message: 'Adapter Connection is not active for Delivery result.',
      target: 'connection_id',
    });
  }
  const installation = requireInstallation(input.repositories, delivery.installationId);
  assertInstallationActive(installation);
  return delivery;
}

/** DeliveryContext に bind された Provider Delivery RPC を実行し、AdapterDelivery を記録します。 */
export async function deliverToIntegrationProvider(input: {
  readonly agentId: string;
  readonly command: DeliverToIntegrationProviderCommand;
  readonly repositories: AgentStorageRepositories;
}): Promise<DeliverToIntegrationProviderResult> {
  assertAgentContext(input.agentId, input.command.context);
  const context = requireDeliveryContext(input.repositories, input.command.deliveryContextId);
  if (context.status !== 'active') {
    throw createAgentDomainError({
      kind: 'precondition',
      message: 'DeliveryContext is not active.',
      target: 'delivery_context_id',
    });
  }
  const connection = requireConnection(input.repositories, context.connectionId);
  const installation = requireInstallation(input.repositories, context.installationId);
  assertInstallationActive(installation);
  authorizeIntegrationOperation(
    input.repositories,
    input.command.context,
    'integration.delivery.send',
    'Deliver',
    'delivery',
    {
      adapterConnectionId: connection.connectionId,
      capabilityId: context.deliveryContextId,
      capabilityKind: 'delivery',
      installationId: installation.installationId,
      ownerAgentId: input.agentId,
    },
    ['agent.integration']
  );
  const deliveryId = crypto.randomUUID();
  try {
    const provider = await input.command.providerClient.deliver({
      agentId: input.agentId,
      connectionId: connection.connectionId,
      deliveryContextId: context.deliveryContextId,
      deliveryId,
      idempotencyKey: input.command.idempotencyKey,
      installationId: installation.installationId,
      nonce: createProviderNonce(input.command.context, deliveryId),
      payloadRef: input.command.payloadRef.ref,
      providerTargetRef: installation.providerBaseUrl ?? '',
      runId: input.command.runId,
      threadId: context.threadId,
      timestampUnixMs: input.command.context.requestedAtMs,
    });
    const row = input.repositories.integrations.createAdapterDelivery({
      connectionId: connection.connectionId,
      createdAtMs: input.command.context.requestedAtMs,
      deliveryContextId: context.deliveryContextId,
      deliveryId,
      eventId: context.eventId,
      idempotencyKey: input.command.idempotencyKey,
      installationId: installation.installationId,
      providerTargetRef: provider.record.requestUrl,
      requestDigest: provider.record.rawBodyDigestHex,
      requestPayloadRef: input.command.payloadRef.ref,
      runId: input.command.runId,
      status: provider.response.status,
      updatedAtMs: input.command.context.requestedAtMs,
    });
    const updated =
      provider.response.operation === undefined
        ? row
        : input.repositories.integrations.updateDeliveryStatus({
            deliveryId: row.deliveryId,
            providerOperationId: provider.response.operation.operationId,
            status: provider.response.status,
            updatedAtMs: input.command.context.requestedAtMs,
          });
    return {
      delivery: mapAdapterDeliveryRow(updated),
      operation: provider.response.operation,
      status: provider.response.status,
    };
  } catch (error) {
    const record = getIntegrationDeliveryProviderRequestRecord(error);
    input.repositories.integrations.createAdapterDelivery({
      connectionId: connection.connectionId,
      createdAtMs: input.command.context.requestedAtMs,
      deliveryContextId: context.deliveryContextId,
      deliveryId,
      eventId: context.eventId,
      idempotencyKey: input.command.idempotencyKey,
      installationId: installation.installationId,
      providerTargetRef: record?.requestUrl ?? installation.providerBaseUrl ?? undefined,
      requestDigest: record?.rawBodyDigestHex,
      requestPayloadRef: input.command.payloadRef.ref,
      runId: input.command.runId,
      status: 'failed',
      updatedAtMs: input.command.context.requestedAtMs,
    });
    throw error;
  }
}
