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
import {
  verifyIntegrationIngressSignature,
  withVerifiedIntegrationIngressPrincipal,
} from './security';

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
  // Connection の存在・状態は signature 成功前に読まず、署名済み request identity 自体を canonical input にします。
  const verifiedPrincipal = await verifyIntegrationIngressSignature({
    agentId: input.agentId,
    canonicalBodyDigest: input.command.context.bodyDigest,
    connectionId: input.command.connectionId,
    idempotencyKey: requireContextIdempotency(input.command.context),
    installationId: input.command.installationId,
    method: 'PublishEvent',
    repositories: input.repositories,
    signature: input.command.signature,
  });
  // Provider が自己申告した principal は使わず、active Installation trust key が検証した principal を後続処理へ固定します。
  const verifiedContext = withVerifiedIntegrationIngressPrincipal(
    input.command.context,
    verifiedPrincipal
  );
  const verifiedCommand = { ...input.command, context: verifiedContext };
  // detached signature 成功後に初めて Connection/Adapter ownership を照合し、未署名 caller への state enumeration を防ぎます。
  const connection = resolveIngressConnection(input.repositories, verifiedCommand);
  const adapter = requireAdapterDefinition(
    input.repositories,
    connection.installationId,
    connection.adapterId
  );
  assertIntegrationModelPolicyOverrideAllowed(
    input.repositories,
    connection,
    adapter,
    verifiedCommand.modelPolicyRef
  );
  const deliveryInput = normalizeDeliveryContextInput({
    connectionDeliveryCapabilityId: connection.deliveryCapabilityId ?? undefined,
    requestedCapability: verifiedCommand.deliveryCapability,
    requestedExpiresAtMs: verifiedCommand.deliveryExpiresAtMs,
    requestedMetadataRef: verifiedCommand.deliveryMetadataRef,
  });
  const deliveryContextId = deliveryInput === undefined ? undefined : crypto.randomUUID();
  const eventResult = await publishEventInStore({
    agentId: input.agentId,
    blobWriter: input.blobWriter,
    command: {
      context: verifiedContext,
      deliveryContextId,
      eventType: verifiedCommand.eventType,
      modelPolicyRef: verifiedCommand.modelPolicyRef,
      occurredAtMs: verifiedCommand.occurredAtMs,
      payload: verifiedCommand.payload,
      payloadContentType: verifiedCommand.payloadContentType,
      payloadReference: verifiedCommand.payloadReference,
      source: verifiedCommand.source,
      threadKey: verifiedCommand.threadKey,
    },
    repositories: input.repositories,
    storageUsagePercent: input.storageUsagePercent,
    // idempotency/nonce reservation の後に Connection 固有 ingress grant を検査し、generic Event grant との両方を要求します。
    authorizeAfterReplayReservation: (context) => {
      authorizeIntegrationOperation(
        input.repositories,
        context,
        'integration.ingress.event',
        'PublishEvent',
        'ingress',
        createConnectionCapability(input.agentId, connection),
        [adapter.ingressGrant]
      );
    },
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
  // Invocation ownership は signature 成功後まで解決せず、未署名 caller へ Tool ledger の存在を露出しません。
  const verifiedPrincipal = await verifyIntegrationIngressSignature({
    agentId: input.agentId,
    canonicalBodyDigest: input.command.context.bodyDigest,
    idempotencyKey: requireContextIdempotency(input.command.context),
    installationId: input.command.installationId,
    invocationId: input.command.invocationId,
    method: 'PublishToolResult',
    repositories: input.repositories,
    signature: input.command.signature,
  });
  // final Tool result authorization と Agent-owned idempotency ledger は verified principal を持つ context だけで実行します。
  const verifiedContext = withVerifiedIntegrationIngressPrincipal(
    input.command.context,
    verifiedPrincipal
  );
  const verifiedCommand = { ...input.command, context: verifiedContext };
  const invocation = input.repositories.tools.findInvocation(verifiedCommand.invocationId);
  if (invocation === undefined) {
    throw createAgentDomainError({ kind: 'not_found', message: 'ToolInvocation not found.' });
  }
  if (invocation.installationId !== verifiedCommand.installationId) {
    throw createAgentDomainError({
      kind: 'authorization',
      message: 'Tool result installation does not own invocation.',
      target: 'installation_id',
    });
  }
  return recordToolResultInStore({
    agentId: input.agentId,
    command: {
      context: verifiedContext,
      invocationId: verifiedCommand.invocationId,
      outputRef: verifiedCommand.outputPayload?.ref ?? verifiedCommand.outputRef,
      providerOperationId: verifiedCommand.providerOperationId,
      status: verifiedCommand.status,
    },
    repositories: input.repositories,
  });
}
