import {
  assertAgentContext,
  authorizeAgentOperation,
  checkAgentIdempotency,
  completeAgentIdempotencyRecord,
  failAgentIdempotencyRecord,
  mapAgentEventRow,
  mapAgentRunRow,
  mapAgentThreadRow,
  reserveAgentIdempotencyRecord,
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
import { authorizeEventOperation } from './operations-authorization';
import { createEventPayloadDescriptor, type EventPayloadDescriptor } from './payload';

import type {
  AgentCoreRequestContext,
  AgentEventView,
  PublishAgentEventCommand,
  PublishAgentEventResult,
} from '../domain/agent-core';
import type { AgentStorageRepositories } from '../storage';

/**
 * Event operations が large payload bytes を Agent-owned blob storage へ保存する callback です。
 *
 * @remarks
 * Event publish domain operation は R2 bucket を直接知らず、この writer だけを Durable Object 境界から受け取ります。
 * これにより payload offload の副作用を Agent-owned blob storage に限定します。
 */
export type AgentEventBlobWriter = AgentImmutableBlobWriter;

const publishEventOperationName = 'AgentEventService.PublishEvent';

interface RequestedModelPolicyContext {
  readonly source: 'client_override' | 'integration_override';
  readonly summary: NonNullable<AgentEventView['modelPolicy']>;
  readonly validation: NonNullable<AgentEventView['modelPolicyValidation']>;
}

/**
 * Agent-owned storage と blob storage へ Event publish mutation を適用します。
 *
 * この関数は `PublishEvent` の domain operation として、Agent ID の整合性検査、
 * Thread key の予約語拒否、idempotency replay 判定、nonce 予約、最終認可、payload の
 * inline/R2 保存判定、Event append、pending Run coalesce、idempotency response 記録を
 * まとめて実行します。scheduler wake は Durable Object handler 側の責務として、この関数では
 * 実行しません。
 *
 * @param input publish 対象の Agent ID、payload offload writer、PublishEvent command、
 * Agent-owned repository set、現在の storage 使用率を含む入力です。
 * @returns 受理された Event view、coalesce された pending Run、Thread view、replay 状態を返します。
 * @throws AgentDomainError Agent ID 不一致、system Thread key、nonce/idempotency conflict、
 * 認可失敗、model policy override 不許可、storage threshold 違反、payload/R2 metadata 不整合、
 * Event/Thread/Section 永続化失敗が発生した場合に送出します。
 * @example
 * ```ts
 * const result = await publishEventInStore({
 *   agentId,
 *   blobWriter,
 *   command,
 *   repositories,
 *   storageUsagePercent,
 * });
 * ```
 */
export async function publishEventInStore(input: {
  readonly agentId: string;
  /**
   * idempotency/nonce reservation 成功後、generic Event authorization より前に実行する追加の Agent-owned authorization です。
   */
  readonly authorizeAfterReplayReservation?: (context: AgentCoreRequestContext) => void;
  readonly blobWriter: AgentEventBlobWriter;
  readonly command: PublishAgentEventCommand;
  readonly repositories: AgentStorageRepositories;
  readonly storageUsagePercent?: number;
}): Promise<PublishAgentEventResult> {
  assertAgentContext(input.agentId, input.command.context);
  assertPublicThreadKey(input.command.threadKey);
  // nonce と idempotency record は、外部 blob writer が Durable Object を interleave する前に同じ SQLite transaction で予約します。
  const replay = input.repositories.transaction((repositories) => {
    const existing = checkAgentIdempotency<PublishAgentEventResult>({
      context: input.command.context,
      operationName: publishEventOperationName,
      repositories,
    });
    if (existing.status === 'replay') return existing;

    // 署名検証済み principal の nonce と command key を同時に確保し、並行 retry が外部書込みへ到達しないようにします。
    reserveAgentNonce(repositories, input.command.context);
    reserveAgentIdempotencyRecord({
      context: input.command.context,
      operationName: publishEventOperationName,
      repositories,
    });
    // Provider ingress は reservation 後に Connection 固有 grant を検査し、generic Event grant だけの迂回を防ぎます。
    input.authorizeAfterReplayReservation?.(input.command.context);
    authorizeEventOperation(repositories, input.command.context, 'event.publish', 'PublishEvent');
    return existing;
  });
  if (replay.status === 'replay') return { ...replay.response, replayed: true };
  let result: PublishAgentEventResult;
  try {
    result = await appendEvent(input);
  } catch (error) {
    // blob/R2 write など Event commit 前の失敗は ledger に明示し、同一 key の再実行を fail closed にします。
    failAgentIdempotencyRecord({
      context: input.command.context,
      repositories: input.repositories,
    });
    throw error;
  }
  // Event/Run の durable commit 後だけ replay response を確定し、成功した retry を元の結果へ収束させます。
  completeAgentIdempotencyRecord({
    context: input.command.context,
    repositories: input.repositories,
    response: result,
  });
  return result;
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
