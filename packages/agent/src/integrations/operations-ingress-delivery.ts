import { normalizeDeliveryContextInput } from '../adapters';
import {
  assertAgentContext,
  checkAgentIdempotency,
  recordAgentIdempotency,
  reserveAgentNonce,
} from '../domain/agent-operation-utils';
import { createAgentDomainError } from '../domain/errors';
import { publishEventInStore } from '../events';
import { appendAgentEventToThreadInRepositories } from '../events/mailbox';
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
import type {
  AgentAdapterConnectionRow,
  AgentAdapterDeliveryRow,
  AgentStorageRepositories,
} from '../storage';
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
  const ingressContext = {
    ...input.command.context,
    principal: {
      ...input.command.context.principal,
      connectionId: connection.connectionId,
      installationId: connection.installationId,
    },
  };
  const adapter = requireAdapterDefinition(
    input.repositories,
    connection.installationId,
    connection.adapterId
  );
  await verifyIntegrationIngressSignature({
    agentId: input.agentId,
    canonicalBodyDigest: ingressContext.bodyDigest,
    connectionId: connection.connectionId,
    idempotencyKey: requireContextIdempotency(ingressContext),
    installationId: input.command.installationId,
    method: 'PublishEvent',
    repositories: input.repositories,
    signature: input.command.signature,
  });
  assertIntegrationModelPolicyOverrideAllowed(
    input.repositories,
    connection,
    adapter,
    input.command.modelPolicyRef
  );
  authorizeIntegrationOperation(
    input.repositories,
    ingressContext,
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
      context: ingressContext,
      deliveryContextId,
      eventType: input.command.eventType,
      modelPolicyRef: input.command.modelPolicyRef,
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
          modelPolicyDigest: eventResult.event.modelPolicy?.policyDigest,
          modelPolicyRef: eventResult.event.requestedModelPolicyRef,
          status: 'active',
          threadId: eventResult.thread.threadId,
        });
  return {
    deliveryContext:
      deliveryContext === undefined ? undefined : mapDeliveryContextRow(deliveryContext),
    event: eventResult.event,
    replayed: eventResult.replayed,
    requestedModelPolicy: eventResult.event.modelPolicy,
    thread: eventResult.thread,
  };
}

function assertIntegrationModelPolicyOverrideAllowed(
  repositories: AgentStorageRepositories,
  connection: AgentAdapterConnectionRow,
  adapter: { readonly allowedModelPolicyRefs: string | null; readonly installationId: string },
  requestedPolicyRef: string | undefined
): void {
  const policyRef = requestedPolicyRef?.trim().normalize('NFC');
  if (policyRef === undefined || policyRef === '') return;
  const installation = requireInstallation(repositories, connection.installationId);
  const installationAllowed = collectInstallationPolicyRefs(repositories, installation);
  const adapterAllowed = mergePolicyRefs(
    parsePolicyRefList(adapter.allowedModelPolicyRefs),
    installationAllowed
  );
  const connectionAllowed = mergePolicyRefs(
    parsePolicyRefList(connection.allowedModelPolicyRefs),
    adapterAllowed
  );
  if (
    installationAllowed.length === 0 ||
    adapterAllowed.length === 0 ||
    connectionAllowed.length === 0 ||
    !installationAllowed.includes(policyRef) ||
    !adapterAllowed.includes(policyRef) ||
    !connectionAllowed.includes(policyRef)
  ) {
    throw createAgentDomainError({
      kind: 'authorization',
      message: 'Integration model policy override is outside the Adapter Connection allowlist.',
      target: 'model_policy_ref',
    });
  }
  if (repositories.modelPolicies.getActivePolicy(policyRef) === undefined) {
    throw createAgentDomainError({
      kind: 'precondition',
      message: 'Requested model policy is not active for this Agent.',
      target: 'model_policy_ref',
    });
  }
}

function collectInstallationPolicyRefs(
  repositories: AgentStorageRepositories,
  installation: { readonly allowedModelPolicyRefs: string | null; readonly installationId: string }
): readonly string[] {
  const stored = parsePolicyRefList(installation.allowedModelPolicyRefs);
  const grantRefs = repositories.integrations
    .listGrants(installation.installationId)
    .filter((grant) => grant.status === 'active')
    .map((grant) => extractPolicyRefFromGrant(grant.scope))
    .filter((entry): entry is string => entry !== undefined);
  return mergePolicyRefs(stored, grantRefs);
}

function extractPolicyRefFromGrant(grant: string): string | undefined {
  if (grant.startsWith('model_policy:'))
    return normalizePolicyRef(grant.slice('model_policy:'.length));
  if (grant.startsWith('agent.model_policy.override:')) {
    return normalizePolicyRef(grant.slice('agent.model_policy.override:'.length));
  }
  return undefined;
}

function normalizePolicyRef(value: string): string | undefined {
  const normalized = value.trim().normalize('NFC');
  return normalized === '' ? undefined : normalized;
}

function mergePolicyRefs(
  primary: readonly string[],
  fallback: readonly string[]
): readonly string[] {
  const source = primary.length === 0 ? fallback : primary;
  return [...new Set(source)];
}

function parsePolicyRefList(value: string | null): readonly string[] {
  if (value === null || value === '') return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string' && entry !== '');
  } catch {
    return [];
  }
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

function classifyDeliveryResult(
  repositories: AgentStorageRepositories,
  delivery: AgentAdapterDeliveryRow,
  status: string
): 'follow_up_event' | 'resume' | 'stale_callback' | 'terminal_failure' {
  if (isTerminalDeliveryLedgerStatus(delivery.status)) return 'stale_callback';
  if (delivery.runId === null) return 'follow_up_event';
  const run = repositories.pendingRuns.findRunById(delivery.runId);
  const snapshot = repositories.pendingRuns.findRunInputSnapshot(delivery.runId);
  if (run === undefined || snapshot === undefined) return 'stale_callback';
  if (run.status !== 'waiting') return 'stale_callback';
  if (isFailureDeliveryStatus(status)) return 'terminal_failure';
  if (isFollowUpDeliveryStatus(status)) return 'follow_up_event';
  return 'resume';
}

function applyDeliveryResumeAction(
  repositories: AgentStorageRepositories,
  delivery: AgentAdapterDeliveryRow,
  action: 'follow_up_event' | 'resume' | 'terminal_failure',
  nowMs: number
): void {
  if (action === 'resume' && delivery.runId !== null) {
    repositories.pendingRuns.transitionRunStatus({
      fromStatus: 'waiting',
      nowMs,
      runId: delivery.runId,
      toStatus: 'pending',
    });
    return;
  }
  if (action === 'terminal_failure' && delivery.runId !== null) {
    repositories.pendingRuns.transitionRunStatus({
      fromStatus: 'waiting',
      nowMs,
      runId: delivery.runId,
      toStatus: 'failed',
    });
    return;
  }
  appendDeliveryFollowUpEvent(repositories, delivery, nowMs);
}

function appendDeliveryFollowUpEvent(
  repositories: AgentStorageRepositories,
  delivery: AgentAdapterDeliveryRow,
  nowMs: number
): void {
  const context = requireDeliveryContext(repositories, delivery.deliveryContextId);
  const thread = repositories.threads.findByThreadId(context.threadId);
  if (thread === undefined) {
    throw createAgentDomainError({
      kind: 'not_found',
      message: 'DeliveryContext Thread not found.',
    });
  }
  appendAgentEventToThreadInRepositories({
    causationId: delivery.deliveryId,
    createdAtMs: nowMs,
    deliveryContextId: delivery.deliveryContextId,
    eventId: crypto.randomUUID(),
    eventType: 'integration.delivery.result',
    idempotencyKey: `delivery-result:${delivery.deliveryId}:${String(nowMs)}`,
    occurredAtMs: nowMs,
    repositories,
    requestDigest: delivery.requestDigest ?? undefined,
    source: 'agent.integration',
    target: {
      mode: 'thread_id',
      normalizedThreadKey: thread.normalizedThreadKey,
      threadId: thread.threadId,
      threadKey: thread.threadKey,
    },
  });
}

function isFailureDeliveryStatus(status: string): boolean {
  return ['cancelled', 'failed', 'rejected', 'terminal_failure', 'timed_out', 'timeout'].includes(
    status
  );
}

function isFollowUpDeliveryStatus(status: string): boolean {
  return ['follow_up', 'follow_up_event', 'provider_event'].includes(status);
}

function isTerminalDeliveryLedgerStatus(status: string): boolean {
  return ['cancelled', 'delivered', 'failed', 'rejected', 'succeeded', 'terminal_failure'].includes(
    status
  );
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
