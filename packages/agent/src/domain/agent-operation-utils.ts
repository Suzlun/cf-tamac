import { createAgentDomainError } from './errors';
import { decideAgentFinalAuthorization } from './final-authorization';

import type {
  AgentCapabilitySummaryView,
  AgentConfigView,
  AgentCoreRequestContext,
  AgentCredentialView,
  AgentEventView,
  AgentPayloadMetadataView,
  AgentProfileView,
  AgentRunView,
  AgentThreadSectionView,
  AgentThreadView,
} from './agent-core';
import type {
  AgentAuthorizationCredentialState,
  AgentAuthorizationLifecycleState,
  AgentCapabilityOwnershipContext,
} from './authorization';
import type {
  AgentConfigRow,
  AgentCredentialRow,
  AgentEventRow,
  AgentGrantRow,
  AgentProfileRow,
  AgentRunRow,
  AgentSectionRow,
  AgentStorageRepositories,
  AgentThreadRow,
} from '../storage';
import type { AgentPrincipalType } from './security/types';

/**
 * Reserved system Thread key for Agent lifecycle and management audit Events.
 */
export const agentSystemThreadKey = '__system__';

/**
 * Number of milliseconds for Stage 2 command idempotency records.
 */
export const agentIdempotencyTtlMs = 24 * 60 * 60 * 1000;

/**
 * Result of checking a command idempotency record.
 */
export type AgentIdempotencyCheck<T> =
  | { readonly status: 'new_command' }
  | { readonly response: T; readonly status: 'replay' };

/**
 * Ensure the command targets the Durable Object's Agent identity.
 */
export function assertAgentContext(agentId: string, context: AgentCoreRequestContext): void {
  if (context.agentId !== agentId) {
    throw createAgentDomainError({
      kind: 'authorization',
      message: 'Agent context does not match Durable Object identity.',
    });
  }
}

/**
 * Check command idempotency and detect duplicate digest conflicts.
 */
export function checkAgentIdempotency<T>(input: {
  readonly context: AgentCoreRequestContext;
  readonly operationName: string;
  readonly repositories: AgentStorageRepositories;
}): AgentIdempotencyCheck<T> {
  const idempotencyKey = requireAgentIdempotencyKey(input.context);
  const existing = input.repositories.idempotency.findRecord(
    input.context.principal.principalId,
    idempotencyKey
  );
  if (existing === undefined) {
    return { status: 'new_command' };
  }
  if (existing.requestDigest !== input.context.bodyDigest.digestHex) {
    throw createAgentDomainError({
      kind: 'conflict',
      message: 'Idempotency key was already used with a different request digest.',
    });
  }
  if (existing.operationName !== input.operationName) {
    throw createAgentDomainError({
      kind: 'conflict',
      message: 'Idempotency key was already used for a different Agent operation.',
    });
  }
  if (existing.responseRef === null) {
    throw createAgentDomainError({
      kind: 'concurrency',
      message: 'Idempotent Agent command is still being recorded.',
    });
  }
  return { response: JSON.parse(existing.responseRef) as T, status: 'replay' };
}

/**
 * Record a successful idempotent command response for replay.
 */
export function recordAgentIdempotency(input: {
  readonly context: AgentCoreRequestContext;
  readonly operationName: string;
  readonly repositories: AgentStorageRepositories;
  readonly response: unknown;
}): void {
  input.repositories.idempotency.insertRecord({
    createdAtMs: input.context.requestedAtMs,
    expiresAtMs: input.context.requestedAtMs + agentIdempotencyTtlMs,
    idempotencyKey: requireAgentIdempotencyKey(input.context),
    operationName: input.operationName,
    principalId: input.context.principal.principalId,
    requestDigest: input.context.bodyDigest.digestHex,
    responseRef: JSON.stringify(input.response),
    status: 'succeeded',
  });
}

/**
 * 成功応答がまだ確定していない idempotent command を記録中として予約します。
 *
 * @param input command context、operation 名、Agent-owned repository set です。
 * @returns 予約した idempotency key を返します。
 * @throws AgentDomainError `idempotency_key` が未指定の場合に発生します。
 * @example
 * ```ts
 * const key = reserveAgentIdempotencyRecord({ context, operationName, repositories });
 * ```
 */
export function reserveAgentIdempotencyRecord(input: {
  readonly context: AgentCoreRequestContext;
  readonly operationName: string;
  readonly repositories: AgentStorageRepositories;
}): string {
  const idempotencyKey = requireAgentIdempotencyKey(input.context);
  input.repositories.idempotency.insertRecord({
    createdAtMs: input.context.requestedAtMs,
    expiresAtMs: input.context.requestedAtMs + agentIdempotencyTtlMs,
    idempotencyKey,
    operationName: input.operationName,
    principalId: input.context.principal.principalId,
    requestDigest: input.context.bodyDigest.digestHex,
    status: 'recording',
  });
  return idempotencyKey;
}

/**
 * 予約済み idempotency record に成功応答を保存し、retry replay を可能にします。
 *
 * @param input command context、repository set、replay 用 response です。
 * @throws AgentDomainError `idempotency_key` が未指定の場合に発生します。
 * @example
 * ```ts
 * completeAgentIdempotencyRecord({ context, repositories, response });
 * ```
 */
export function completeAgentIdempotencyRecord(input: {
  readonly context: AgentCoreRequestContext;
  readonly repositories: AgentStorageRepositories;
  readonly response: unknown;
}): void {
  input.repositories.idempotency.updateRecordResponse({
    idempotencyKey: requireAgentIdempotencyKey(input.context),
    principalId: input.context.principal.principalId,
    responseRef: JSON.stringify(input.response),
    status: 'succeeded',
  });
}

/**
 * Reserve a replay-protection nonce when one is present in the command context.
 */
export function reserveAgentNonce(
  repositories: AgentStorageRepositories,
  context: AgentCoreRequestContext
): void {
  if (context.nonce === undefined) {
    return;
  }
  const ttlSeconds = 300;
  const result = repositories.requestNonces.reserveNonce({
    createdAtMs: context.requestedAtMs,
    expiresAtMs: context.requestedAtMs + ttlSeconds * 1000,
    nonce: context.nonce,
    principalId: context.principal.principalId,
  });
  if (result.status === 'replay') {
    throw createAgentDomainError({ kind: 'authorization', message: 'Nonce replay detected.' });
  }
}

/**
 * Enforce Agent-local final authorization against persisted state.
 */
export function authorizeAgentOperation(input: {
  readonly action: string;
  readonly allowMissingProfile?: boolean;
  readonly capability?: AgentCapabilityOwnershipContext;
  readonly context: AgentCoreRequestContext;
  readonly method: string;
  readonly requiredGrants?: readonly string[];
  readonly requiredPrincipalTypes: readonly AgentPrincipalType[];
  readonly requiredScopes: readonly string[];
  readonly service: string;
  readonly repositories: AgentStorageRepositories;
}): AgentProfileRow | undefined {
  const profile = input.repositories.profile.getProfile();
  if (profile === undefined && input.allowMissingProfile !== true) {
    throw createAgentDomainError({ kind: 'not_found', message: 'Agent is not initialized.' });
  }
  const grantDetails = getActiveGrantCapabilities(
    input.repositories,
    input.context.principal.principalId
  );
  const grants = grantDetails.map((grant) => grant.capability);
  const credentialState =
    profile === undefined && input.allowMissingProfile === true
      ? 'active'
      : resolveCredentialState(input.repositories, input.context);
  const decision = decideAgentFinalAuthorization({
    agentId: input.context.agentId,
    credentialState,
    lifecycleState: normalizeLifecycleState(profile?.lifecycleStatus),
    capability: input.capability,
    operation: { action: input.action, method: input.method, service: input.service },
    principal: { ...input.context.principal, grantDetails, grants },
    requiredGrants: input.requiredGrants ?? input.requiredScopes,
    requiredPrincipalTypes: input.requiredPrincipalTypes,
    requiredScopes: input.requiredScopes,
  });
  if (decision.status === 'deny') {
    throw createAgentDomainError({ kind: decision.denialKind, message: decision.safeMessage });
  }
  return profile;
}

/**
 * Convert an Agent profile row into a secret-free view.
 */
export function mapAgentProfileRow(row: AgentProfileRow): AgentProfileView {
  return {
    agentId: row.agentId,
    configVersion: row.configVersion,
    createdAtMs: row.createdAtMs,
    credentialGeneration: row.credentialGeneration,
    displayName: row.displayName ?? undefined,
    status: row.lifecycleStatus,
    systemThreadId: row.systemThreadId ?? '',
    updatedAtMs: row.updatedAtMs,
  };
}

/**
 * Convert a versioned Agent config row into a secret-free view.
 */
export function mapAgentConfigRow(agentId: string, row: AgentConfigRow): AgentConfigView {
  return {
    agentId,
    budgetPolicyRef: row.budgetPolicyRef ?? undefined,
    configBodyRef: row.configBodyRef ?? undefined,
    configVersion: row.configVersion,
    displayName: row.displayName ?? undefined,
    memoryPolicyRef: row.memoryPolicyRef ?? undefined,
    modelPolicyRef: row.modelPolicyRef ?? undefined,
    schedulePolicyRef: row.schedulePolicyRef ?? undefined,
    toolPolicyRef: row.toolPolicyRef ?? undefined,
    updatedAtMs: row.updatedAtMs,
    updatedByPrincipalId: row.updatedByPrincipalId ?? undefined,
  };
}

/**
 * Convert a credential row into a secret-free credential view.
 */
export function mapAgentCredentialRow(
  agentId: string,
  row: AgentCredentialRow
): AgentCredentialView {
  return {
    agentId,
    credentialId: row.credentialId,
    createdAtMs: row.createdAtMs,
    expiresAtMs: row.expiresAtMs ?? undefined,
    generation: row.generation,
    keyId: row.credentialId,
    overlapUntilMs: row.status === 'overlap' ? (row.expiresAtMs ?? undefined) : undefined,
    publicFingerprint: row.publicFingerprint ?? undefined,
    revokedAtMs: row.revokedAtMs ?? undefined,
    status: row.status,
    verifierMaterialRef: row.verifierRef ?? undefined,
  };
}

/**
 * Convert a Thread row into a safe Thread view.
 */
export function mapAgentThreadRow(agentId: string, row: AgentThreadRow): AgentThreadView {
  return {
    agentId,
    createdAtMs: row.createdAtMs,
    currentSectionId: row.currentSectionId ?? undefined,
    lastServedAtMs: row.lastServedAtMs ?? undefined,
    normalizedThreadKey: row.normalizedThreadKey,
    priority: row.priority,
    status: row.status,
    threadId: row.threadId,
    threadKey: row.threadKey,
    updatedAtMs: row.updatedAtMs,
  };
}

/**
 * Convert a Section row into a safe Thread Section view.
 */
export function mapAgentSectionRow(agentId: string, row: AgentSectionRow): AgentThreadSectionView {
  return {
    agentId,
    endThreadSequence: row.endThreadSequence ?? undefined,
    eventCount: row.eventCount,
    frozenAtMs: row.frozenAtMs ?? undefined,
    openedAtMs: row.openedAtMs ?? row.createdAtMs,
    sectionId: row.sectionId,
    sectionOrdinal: row.sequence,
    startThreadSequence: row.startThreadSequence,
    status: row.status,
    threadId: row.threadId,
  };
}

/**
 * Convert an Event row into a safe Event view.
 */
export function mapAgentEventRow(agentId: string, row: AgentEventRow): AgentEventView {
  return {
    agentId,
    agentSequence: row.agentSequence,
    causationId: row.causationId ?? undefined,
    correlationId: row.correlationId ?? undefined,
    deliveryContextId: row.deliveryContextId ?? undefined,
    eventId: row.eventId,
    eventType: row.eventType,
    idempotencyKey: row.idempotencyKey,
    normalizedThreadKey: row.normalizedThreadKey,
    occurredAtMs: row.occurredAtMs,
    payloadMetadata: mapPayloadMetadata(row),
    payloadRef: row.payloadRef ?? undefined,
    runId: row.runId ?? undefined,
    sectionId: row.sectionId,
    source: row.source,
    threadId: row.threadId,
    threadKey: row.threadKey,
    threadSequence: row.threadSequence,
  };
}

/**
 * Convert a pending Run row into a safe Run view.
 */
export function mapAgentRunRow(agentId: string, row: AgentRunRow): AgentRunView {
  return {
    agentId,
    pendingSinceMs: row.pendingSinceMs,
    runId: row.runId,
    status: row.status,
    threadId: row.threadId,
    triggerEventId: row.triggerEventId,
  };
}

/**
 * Build an empty capability summary for Stage 2 Agent core operations.
 */
export function createEmptyCapabilitySummary(agentId: string): AgentCapabilitySummaryView {
  return {
    activeInstallationCount: 0,
    activeScheduleCount: 0,
    adapterConnectionCount: 0,
    agentId,
    deliveryCapabilityCount: 0,
    toolCount: 0,
  };
}

function getActiveGrantCapabilities(
  repositories: AgentStorageRepositories,
  principalId: string
): readonly { readonly capability: string; readonly scopeRef?: string }[] {
  return repositories.grants
    .listGrantsForPrincipal(principalId)
    .filter((grant: AgentGrantRow) => grant.status === 'active')
    .map((grant) => ({ capability: grant.capability, scopeRef: grant.scopeRef ?? undefined }));
}

function resolveCredentialState(
  repositories: AgentStorageRepositories,
  context: AgentCoreRequestContext
): AgentAuthorizationCredentialState {
  if (context.principal.keyId === undefined) {
    return 'active';
  }
  const credential = repositories.credentials.findCredential(context.principal.keyId);
  if (credential === undefined) {
    return 'disabled';
  }
  if (credential.status === 'active' || credential.status === 'overlap') {
    if (credential.expiresAtMs !== null && credential.expiresAtMs <= context.requestedAtMs) {
      return 'expired';
    }
    return credential.status;
  }
  return credential.status === 'revoked' ? 'revoked' : 'disabled';
}

function normalizeLifecycleState(value: string | undefined): AgentAuthorizationLifecycleState {
  if (
    value === 'active' ||
    value === 'disabled' ||
    value === 'destroying' ||
    value === 'destroyed'
  ) {
    return value;
  }
  return 'initializing';
}

function mapPayloadMetadata(row: AgentEventRow): AgentPayloadMetadataView | undefined {
  if (row.payloadRef === null || row.payloadSha256 === null || row.payloadByteSize === null) {
    return undefined;
  }
  return {
    byteSize: row.payloadByteSize,
    contentType: row.payloadContentType ?? 'application/octet-stream',
    ref: row.payloadRef,
    sha256: row.payloadSha256,
    storageClass: normalizeStorageClass(row.payloadStorageClass),
  };
}

function normalizeStorageClass(value: string | null): 'inline' | 'r2' | 'reference' {
  return value === 'r2' || value === 'reference' ? value : 'inline';
}

/**
 * command context から必須 idempotency key を取得します。
 *
 * @param context RPC command から構築した Agent core request context です。
 * @returns 空でない idempotency key です。
 * @throws AgentDomainError `idempotency_key` が未指定または空の場合に発生します。
 * @example
 * ```ts
 * const key = requireAgentIdempotencyKey(context);
 * ```
 */
export function requireAgentIdempotencyKey(context: AgentCoreRequestContext): string {
  if (context.idempotencyKey === undefined || context.idempotencyKey === '') {
    throw createAgentDomainError({ kind: 'validation', message: 'idempotency_key is required.' });
  }
  return context.idempotencyKey;
}
