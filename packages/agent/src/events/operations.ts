import {
  assertAgentContext,
  authorizeAgentOperation,
  checkAgentIdempotency,
  mapAgentEventRow,
  mapAgentRunRow,
  mapAgentThreadRow,
  recordAgentIdempotency,
  reserveAgentNonce,
} from '../domain/agent-operation-utils';
import { createAgentDomainError } from '../domain/errors';
import {
  mapAgentModelPolicySummaryRow,
  mapValidationRecord,
  requireActiveAgentModelPolicy,
} from '../domain/model-policy-operations';
import {
  recordAgentImmutableBlobReference,
  writeAgentImmutableBlob,
  type AgentImmutableBlobWriter,
  type AgentStoredImmutableBlobDescriptor,
} from '../storage/blob-offload';
import { AgentStorageThresholdViolation } from '../storage/storage-thresholds';
import { createThreadKeyIdentity } from '../threads';

import { appendAgentEventToThread } from './mailbox';
import { createEventPayloadDescriptor, type EventPayloadDescriptor } from './payload';

import type {
  AgentCoreRequestContext,
  AgentEventView,
  AgentPageView,
  GetAgentEventQuery,
  ListAgentEventsQuery,
  ListAgentEventsResult,
  PublishAgentEventCommand,
  PublishAgentEventResult,
} from '../domain/agent-core';
import type { AgentEventRow, AgentStorageRepositories } from '../storage';

/**
 * Event operations が large payload bytes を Agent-owned blob storage へ保存する callback です。
 */
export type AgentEventBlobWriter = AgentImmutableBlobWriter;

interface RequestedModelPolicyContext {
  readonly source: 'client_override' | 'integration_override';
  readonly summary: NonNullable<AgentEventView['modelPolicy']>;
  readonly validation: NonNullable<AgentEventView['modelPolicyValidation']>;
}

/**
 * Run PublishEvent against Agent-owned storage and blob storage.
 */
export async function publishEventInStore(input: {
  readonly agentId: string;
  readonly blobWriter: AgentEventBlobWriter;
  readonly command: PublishAgentEventCommand;
  readonly repositories: AgentStorageRepositories;
  readonly storageUsagePercent?: number;
}): Promise<PublishAgentEventResult> {
  assertAgentContext(input.agentId, input.command.context);
  assertPublicThreadKey(input.command.threadKey);
  const replay = checkAgentIdempotency<PublishAgentEventResult>({
    context: input.command.context,
    operationName: 'AgentEventService.PublishEvent',
    repositories: input.repositories,
  });
  if (replay.status === 'replay') return { ...replay.response, replayed: true };
  reserveAgentNonce(input.repositories, input.command.context);
  authorizeEventOperation(
    input.repositories,
    input.command.context,
    'event.publish',
    'PublishEvent'
  );
  const result = await appendEvent(input);
  recordAgentIdempotency({
    context: input.command.context,
    operationName: 'AgentEventService.PublishEvent',
    repositories: input.repositories,
    response: result,
  });
  return result;
}

/**
 * Run GetEvent against Agent-owned storage.
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
 * Run ListEvents against Agent-owned storage with scoped pagination.
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

async function appendEvent(input: {
  readonly agentId: string;
  readonly blobWriter: AgentEventBlobWriter;
  readonly command: PublishAgentEventCommand;
  readonly repositories: AgentStorageRepositories;
  readonly storageUsagePercent?: number;
}): Promise<PublishAgentEventResult> {
  const now = input.command.context.requestedAtMs;
  const identity = createThreadKeyIdentity(input.agentId, input.command.threadKey);
  const eventId = crypto.randomUUID();
  const requestedModelPolicy = resolveRequestedModelPolicy(input);
  const payload = await createEventPayload(input, eventId);
  const persisted = appendAgentEventToThread({
    afterEventAppended: ({ repositories, thread }) => {
      if (payload?.storageClass !== 'r2' || payload.r2ObjectKey === undefined) return;
      recordAgentImmutableBlobReference({
        descriptor: createEventPayloadBlobDescriptor(payload),
        nowMs: now,
        ownerId: eventId,
        ownerKind: 'event_payload',
        provenanceRef: `event:${eventId}`,
        repositories,
        retentionStatus: 'active',
        threadId: thread.threadId,
      });
    },
    causationId: input.command.context.causationId,
    correlationId: input.command.context.correlationId,
    createdAtMs: now,
    deliveryContextId: input.command.deliveryContextId,
    eventId,
    eventType: input.command.eventType,
    idempotencyKey: input.command.context.idempotencyKey ?? '',
    occurredAtMs: input.command.occurredAtMs ?? now,
    payloadByteSize: payload?.byteSize,
    payloadContentType: payload?.contentType,
    payloadInlineBase64: payload?.inlineBase64,
    payloadRef: payload?.ref,
    payloadSha256: payload?.sha256,
    payloadStorageClass: payload?.storageClass,
    policyOverrideSource: requestedModelPolicy?.source,
    repositories: input.repositories,
    requestDigest: input.command.context.bodyDigest.digestHex,
    requestedModelPolicyDigest: requestedModelPolicy?.summary.policyDigest,
    requestedModelPolicyRef: requestedModelPolicy?.summary.policyRef,
    requestedModelPolicyValidationStatus: requestedModelPolicy?.validation.status,
    requestedModelPolicyVersion: requestedModelPolicy?.summary.version,
    source: input.command.source,
    target: {
      mode: 'thread_key',
      normalizedThreadKey: identity.normalizedThreadKey,
      threadKey: identity.threadKey,
    },
  });
  return {
    accepted: true,
    event: attachRequestedPolicyToEvent(
      mapAgentEventRow(input.agentId, persisted.event),
      requestedModelPolicy
    ),
    pendingRun: mapAgentRunRow(input.agentId, persisted.run),
    replayed: false,
    thread: {
      ...mapAgentThreadRow(input.agentId, persisted.thread),
      currentSectionId: persisted.section.sectionId,
      latestEventId: eventId,
      latestRunId: persisted.run.runId,
    },
  };
}

async function createEventPayload(
  input: {
    readonly agentId: string;
    readonly blobWriter: AgentEventBlobWriter;
    readonly command: PublishAgentEventCommand;
    readonly storageUsagePercent?: number;
  },
  eventId: string
) {
  const descriptor = await createEventPayloadDescriptorOrDomainError(input, eventId);
  if (descriptor?.r2ObjectKey !== undefined && input.command.payload !== undefined) {
    const stored = await writeAgentImmutableBlob({
      agentId: input.agentId,
      body: input.command.payload,
      contentType: descriptor.contentType,
      objectKey: descriptor.r2ObjectKey,
      ownerId: eventId,
      ownerKind: 'event_payload',
      writer: input.blobWriter,
    });
    return { ...descriptor, ...stored, r2ObjectKey: stored.objectKey };
  }
  return descriptor;
}

async function createEventPayloadDescriptorOrDomainError(
  input: {
    readonly agentId: string;
    readonly command: PublishAgentEventCommand;
    readonly storageUsagePercent?: number;
  },
  eventId: string
): Promise<EventPayloadDescriptor | undefined> {
  try {
    // threshold 判定は R2 write 前に行い、critical mode の新規大容量 mutation を止めます。
    return await createEventPayloadDescriptor({
      agentId: input.agentId,
      contentType: input.command.payloadContentType,
      eventId,
      payload: input.command.payload,
      payloadReference: input.command.payloadReference,
      storageUsagePercent: input.storageUsagePercent,
    });
  } catch (error) {
    if (error instanceof AgentStorageThresholdViolation) {
      throw createAgentDomainError({
        kind: 'precondition',
        message: error.message,
        safeDetails: { storageStatus: error.status },
        target: 'event.payload',
      });
    }
    throw error;
  }
}

function createEventPayloadBlobDescriptor(
  payload: EventPayloadDescriptor
): AgentStoredImmutableBlobDescriptor {
  if (payload.r2ObjectKey === undefined) {
    throw createAgentDomainError({
      kind: 'internal',
      message: 'R2 Event payload metadata is missing an object key.',
    });
  }
  return {
    byteSize: payload.byteSize,
    contentType: payload.contentType,
    objectKey: payload.r2ObjectKey,
    ref: payload.ref,
    sha256: payload.sha256,
    storageClass: 'r2',
  };
}

function authorizeEventOperation(
  repositories: AgentStorageRepositories,
  context: AgentCoreRequestContext,
  action: string,
  method: string
): void {
  authorizeAgentOperation({
    action,
    context,
    method,
    repositories,
    requiredPrincipalTypes: [
      'CLIENT_SERVICE',
      'ADMIN_OPERATOR',
      'INTERNAL_SERVICE',
      'INTEGRATION_INSTALLATION',
    ],
    requiredScopes: ['agent.rpc', 'agent.event'],
    service: 'cftamac.agent.v1.AgentEventService',
  });
}

function resolveRequestedModelPolicy(input: {
  readonly agentId: string;
  readonly command: PublishAgentEventCommand;
  readonly repositories: AgentStorageRepositories;
}): RequestedModelPolicyContext | undefined {
  const policyRef = input.command.modelPolicyRef?.trim();
  if (policyRef === undefined || policyRef === '') return undefined;
  authorizePolicyOverride(input.repositories, input.command.context, policyRef);
  const policy = requireActiveAgentModelPolicy({
    agentId: input.agentId,
    policyRef,
    repositories: input.repositories,
  });
  const validation = input.repositories.modelPolicies.validatePolicy(
    {
      decisionSchemaVersion: policy.decisionSchemaVersion,
      modelId: policy.modelId,
      policyRef: policy.policyRef,
      provider: policy.provider,
      safeMetadataRef:
        policy.safeMetadataRef === null
          ? undefined
          : { ref: policy.safeMetadataRef, sha256: policy.safeMetadataSha256 ?? undefined },
      status: policy.status,
    },
    input.command.context.requestedAtMs
  );
  return {
    source:
      input.command.context.principal.principalType === 'INTEGRATION_INSTALLATION'
        ? 'integration_override'
        : 'client_override',
    summary: mapAgentModelPolicySummaryRow(input.agentId, policy),
    validation: mapValidationRecord(validation),
  };
}

function authorizePolicyOverride(
  repositories: AgentStorageRepositories,
  context: AgentCoreRequestContext,
  policyRef: string
): void {
  try {
    authorizeAgentOperation({
      action: 'event.model_policy.override',
      capability: {
        adapterConnectionId: context.principal.connectionId,
        capabilityKind: 'integration',
        installationId: context.principal.installationId,
        modelPolicyRef: policyRef,
        ownerAgentId: context.agentId,
      },
      context,
      method: context.method,
      repositories,
      requiredGrants: [
        'agent.model_policy.override',
        `agent.model_policy.override:${policyRef}`,
        `model_policy:${policyRef}`,
      ],
      requiredPrincipalTypes: [
        'CLIENT_SERVICE',
        'INTEGRATION_INSTALLATION',
        'INTERNAL_SERVICE',
        'ADMIN_OPERATOR',
      ],
      requiredScopes: [
        'agent.model_policy.override',
        `agent.model_policy.override:${policyRef}`,
        `model_policy:${policyRef}`,
      ],
      service: context.service,
    });
  } catch (error) {
    if (error instanceof Error) {
      throw createAgentDomainError({
        kind: 'authorization',
        message: 'Principal lacks a model policy override grant for this Event.',
        target: 'model_policy_ref',
      });
    }
    throw error;
  }
}

function assertPublicThreadKey(threadKey: string): void {
  if (threadKey.normalize('NFC') === '__system__') {
    throw createAgentDomainError({ kind: 'authorization', message: 'System Thread is reserved.' });
  }
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

function attachRequestedPolicyToEvent(
  event: AgentEventView,
  requestedModelPolicy: RequestedModelPolicyContext | undefined
): AgentEventView {
  if (requestedModelPolicy === undefined) return event;
  return {
    ...event,
    modelPolicy: requestedModelPolicy.summary,
    modelPolicyValidation: requestedModelPolicy.validation,
    policyOverrideSource: requestedModelPolicy.source,
    requestedModelPolicyRef: requestedModelPolicy.summary.policyRef,
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
