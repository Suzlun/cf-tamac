import { normalizeDeliveryContextInput } from '../adapters';
import { assertAgentContext } from '../domain/agent-operation-utils';
import { createAgentDomainError } from '../domain/errors';
import { publishEventInStore } from '../events';
import { recordToolResultInStore } from '../tools';

import { mapDeliveryContextRow } from './mappers';
import {
  authorizeIntegrationOperation,
  createConnectionCapability,
  requireAdapterDefinition,
  requireContextIdempotency,
  requireInstallation,
  resolveIngressConnection,
} from './operation-shared';
import { verifyIntegrationIngressSignature } from './security';

import type { AgentEventBlobWriter } from '../events';
import type { AgentAdapterConnectionRow, AgentStorageRepositories } from '../storage';
import type {
  PublishIntegrationEventCommand,
  PublishIntegrationEventResult,
  PublishIntegrationToolResultCommand,
} from './types';

/**
 * IntegrationIngressService.PublishEvent を検証し、Event と任意の DeliveryContext を作成します。
 *
 * @param input Agent ID、blob writer、PublishEvent command、Agent-owned repository set、任意の storage 使用率です。
 * @returns 受理 Event、Thread、任意の DeliveryContext、model policy、idempotency replay 状態を含む result です。
 * @throws Agent context、署名、authorization、model policy allowlist、Event 保存が失敗した場合に発生します。
 * @example
 * ```ts
 * const result = await publishIntegrationEventInStore({ agentId, blobWriter, command, repositories });
 * ```
 */
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

/**
 * IntegrationIngressService.PublishToolResult を検証し、Tool result 記録へ委譲します。
 *
 * @param input Agent ID、PublishToolResult command、Agent-owned repository set です。
 * @returns ToolInvocation mutation result を返します。
 * @throws Agent context、署名、installation/invocation identity、Tool result 記録が失敗した場合に発生します。
 * @example
 * ```ts
 * const result = await publishIntegrationToolResultInStore({ agentId, command, repositories });
 * ```
 */
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
