import {
  assertAgentContext,
  checkAgentIdempotency,
  recordAgentIdempotency,
  reserveAgentNonce,
} from '../domain/agent-operation-utils';
import { createAgentDomainError } from '../domain/errors';

import { applyDeliveryResumeAction, classifyDeliveryResult } from './delivery-classification';
import { mapAdapterDeliveryRow } from './mappers';
import {
  assertInstallationActive,
  authorizeIntegrationOperation,
  createProviderNonce,
  publishDeliveryResultOperationName,
  requireConnection,
  requireContextIdempotency,
  requireDeliveryContext,
  requireInstallation,
} from './operation-shared';
import { getIntegrationDeliveryProviderRequestRecord } from './provider-client';
import { verifyIntegrationIngressSignature } from './security';

import type { AgentAdapterDeliveryRow, AgentStorageRepositories } from '../storage';
import type {
  DeliverToIntegrationProviderCommand,
  DeliverToIntegrationProviderResult,
  PublishIntegrationDeliveryResult,
  PublishIntegrationDeliveryResultCommand,
} from './types';

/**
 * IntegrationIngressService.PublishDeliveryResult を検証し、AdapterDelivery の結果を保存します。
 *
 * @param input Agent ID、PublishDeliveryResult command、Agent-owned repository set です。
 * @returns 更新済み delivery view、resume action、safe metadata、idempotency replay 状態を含む result です。
 * @throws Agent context、署名、nonce、authorization、DeliveryContext/connection/installation 前提条件が失敗した場合に発生します。
 * @example
 * ```ts
 * const result = await publishIntegrationDeliveryResultInStore({ agentId, command, repositories });
 * ```
 */
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
  const result = input.repositories.transaction((repositories) => {
    const classification = classifyDeliveryResult(repositories, delivery, input.command.status);
    if (classification === 'stale_callback') {
      return createDeliveryResultResponse(input.agentId, input.command, delivery, {
        replayed: false,
        resumeAction: classification,
      });
    }
    const updated = repositories.integrations.updateDeliveryStatus({
      deliveryId: delivery.deliveryId,
      providerOperationId: input.command.providerOperationId,
      status: input.command.status,
      updatedAtMs: input.command.context.requestedAtMs,
    });
    applyDeliveryResumeAction(
      repositories,
      updated,
      classification,
      input.command.context.requestedAtMs
    );
    return createDeliveryResultResponse(input.agentId, input.command, updated, {
      replayed: false,
      resumeAction: classification,
    });
  });
  recordAgentIdempotency({
    context: input.command.context,
    operationName: publishDeliveryResultOperationName,
    repositories: input.repositories,
    response: result,
  });
  return result;
}

function createDeliveryResultResponse(
  agentId: string,
  command: PublishIntegrationDeliveryResultCommand,
  delivery: AgentAdapterDeliveryRow,
  options: { readonly replayed: boolean; readonly resumeAction: string }
): PublishIntegrationDeliveryResult {
  const mappedDelivery = mapAdapterDeliveryRow(delivery);
  const result = {
    delivery: mappedDelivery,
    replayed: options.replayed,
    resumeAction: options.resumeAction,
    result: {
      agentId,
      connectionId: delivery.connectionId,
      deliveryContextId: delivery.deliveryContextId,
      deliveryId: command.deliveryId,
      installationId: command.installationId,
      providerOperationId: command.providerOperationId,
      resumeAction: options.resumeAction,
      runId: delivery.runId ?? undefined,
      status: command.status,
    },
  } satisfies PublishIntegrationDeliveryResult;
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
  if (delivery.providerOperationId !== null && input.command.providerOperationId === undefined) {
    throw createAgentDomainError({
      kind: 'precondition',
      message: 'Delivery result provider operation identity is required.',
      target: 'provider_operation_id',
    });
  }
  if (
    delivery.providerOperationId !== null &&
    input.command.providerOperationId !== delivery.providerOperationId
  ) {
    throw createAgentDomainError({
      kind: 'precondition',
      message: 'Delivery result provider operation identity does not match.',
      target: 'provider_operation_id',
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

/**
 * DeliveryContext に bind された Provider Delivery RPC を実行し、AdapterDelivery ledger を記録します。
 *
 * @param input Agent ID、Provider client を含む delivery command、Agent-owned repository set です。
 * @returns Provider request/response を反映した delivery view と Provider operation 情報です。
 * @throws Agent context、authorization、DeliveryContext/connection/installation 前提条件、Provider RPC が失敗した場合に発生します。
 * @example
 * ```ts
 * const result = await deliverToIntegrationProvider({ agentId, command, repositories });
 * ```
 */
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
