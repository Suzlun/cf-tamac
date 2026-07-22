import { describe, expect, it } from 'vitest';

import { publishEventInStore } from '../events';
import {
  agentBlobBucketBindingName,
  agentImmutableBlobOwnerKinds,
  agentInlineBodyLimitBytes,
  decideAgentBodyStorage,
  validateAgentModelPolicy,
  writeAgentImmutableBlob,
} from '../storage';

import type { AgentCoreRequestContext } from '../domain';
import type {
  AgentEventRow,
  AgentEventSequencePair,
  AgentGrantRow,
  AgentIdempotencyRecordRow,
  AgentImmutableBlobWriteInput,
  AgentImmutableBlobWriteResult,
  AgentModelPolicyInputRecord,
  AgentModelPolicyRow,
  AgentR2ObjectReferenceRow,
  AgentRunRow,
  AgentSectionRow,
  AgentStorageRepositories,
  AgentThreadRow,
  RecordAgentR2ObjectReferenceInput,
} from '../storage';

const agentId = 'agent-alpha';
const principalId = 'principal-1';
const nowMs = 1_700_000_200_000;

describe('Agent Stage 4 R2 offload and storage thresholds', () => {
  it('[AGENT-EVENTING-S008] Large Event payload is offloaded with digest metadata', async () => {
    const harness = new EventOffloadHarness();
    const payload = new Uint8Array(agentInlineBodyLimitBytes + 32);
    payload.fill(9);

    const result = await publishEventInStore({
      agentId,
      blobWriter: (blob) => harness.writeBlob(blob),
      command: {
        context: createContext('PublishEvent', 'event-large-digest'),
        eventType: 'user.message.received',
        payload,
        payloadContentType: 'application/octet-stream',
        source: 'client',
        threadKey: 'customer:large-event',
      },
      repositories: harness.repositories,
      storageUsagePercent: 90,
    });

    const object = harness.r2Object(result.event.payloadMetadata?.ref ?? '');
    expect(result.event.payloadMetadata).toMatchObject({
      byteSize: payload.byteLength,
      contentType: 'application/octet-stream',
      ref: `r2://agents/${agentId}/events/${result.event.eventId}/payload.bin`,
      storageClass: 'r2',
    });
    expect(result.event.payloadMetadata?.sha256).toMatch(/^[\da-f]{64}$/);
    expect(result.event.payloadMetadata).not.toHaveProperty('inlineBytes');
    expect(harness.events[0]).toMatchObject({
      payloadInlineBase64: null,
      payloadRef: result.event.payloadMetadata?.ref,
      payloadSha256: result.event.payloadMetadata?.sha256,
      payloadStorageClass: 'r2',
    });
    expect(object).toMatchObject({
      bucketBinding: agentBlobBucketBindingName,
      byteSize: payload.byteLength,
      contentType: 'application/octet-stream',
      objectRef: result.event.payloadMetadata?.ref,
      ownerId: result.event.eventId,
      ownerKind: 'event_payload',
      retentionStatus: 'active',
      sha256: result.event.payloadMetadata?.sha256,
      status: 'active',
      threadId: result.thread.threadId,
    });
    expect(harness.blobWrites).toHaveLength(1);
    expect(harness.blobWrites[0]).toMatchObject({
      key: object.objectKey,
      sha256: object.sha256,
    });
  });

  it('[AGENT-EVENTING-S006] Provider Event reservation excludes concurrent blob writes and records completion or failure', async () => {
    const harness = new EventOffloadHarness();
    const payload = new Uint8Array(agentInlineBodyLimitBytes + 32);
    let allowBlobWrite: () => void = () => undefined;
    let signalBlobWriterStarted: () => void = () => undefined;
    let providerAuthorizationCount = 0;
    let writerCalls = 0;
    const blobWriterStarted = new Promise<void>((resolve) => {
      signalBlobWriterStarted = resolve;
    });
    const command = {
      context: createContext('PublishEvent', 'provider-event-race-digest', {
        idempotencyKey: 'provider-event-race-key',
        nonce: 'provider-event-race-nonce',
        principalType: 'INTEGRATION_INSTALLATION',
      }),
      eventType: 'integration.message.received',
      payload,
      payloadContentType: 'application/octet-stream',
      source: 'integration' as const,
      threadKey: 'provider:delayed-blob-write',
    };
    const delayedBlobWriter = async (blob: AgentImmutableBlobWriteInput) => {
      // 外部 R2 write の待機点を固定し、並行 retry が予約状態を観測するようにします。
      writerCalls += 1;
      signalBlobWriterStarted();
      await new Promise<void>((resolve) => {
        allowBlobWrite = resolve;
      });
      return harness.writeBlob(blob);
    };
    const publish = () =>
      publishEventInStore({
        agentId,
        // verified Provider principal 用の Connection grant 判定は、reservation 成功後に一度だけ通過します。
        authorizeAfterReplayReservation: () => {
          providerAuthorizationCount += 1;
        },
        blobWriter: delayedBlobWriter,
        command,
        repositories: harness.repositories,
        storageUsagePercent: 90,
      });

    const first = publish();
    await blobWriterStarted;

    // Durable Object SQLite reservation は外部 write 前に nonce/key を記録し、次の retry を fail closed にします。
    expect(harness.idempotencyRecord('provider-event-race-key')).toMatchObject({
      responseRef: null,
      status: 'recording',
    });
    expect(harness.nonceReservationCount()).toBe(1);
    await expect(publish()).rejects.toThrow('still being recorded');
    expect(providerAuthorizationCount).toBe(1);
    expect(writerCalls).toBe(1);
    expect(harness.blobWrites).toHaveLength(0);

    allowBlobWrite();
    const accepted = await first;
    expect(harness.idempotencyRecord('provider-event-race-key')).toMatchObject({
      responseRef: expect.any(String),
      status: 'succeeded',
    });

    // 完了済み command は同じ Event result を replay し、blob/Event/Run を重複させません。
    await expect(publish()).resolves.toMatchObject({
      event: { eventId: accepted.event.eventId },
      replayed: true,
    });
    expect(harness.blobWrites).toHaveLength(1);
    expect(harness.events).toHaveLength(1);
    expect(harness.repositories.pendingRuns.listRuns({ limit: 10 })).toHaveLength(1);

    const failedCommand = {
      ...command,
      context: createContext('PublishEvent', 'provider-event-failure-digest', {
        idempotencyKey: 'provider-event-failure-key',
        nonce: 'provider-event-failure-nonce',
        principalType: 'INTEGRATION_INSTALLATION',
      }),
      threadKey: 'provider:failed-blob-write',
    };
    let failedWriterCalls = 0;
    const failingPublish = () =>
      publishEventInStore({
        agentId,
        blobWriter: () => {
          // R2 失敗では Event durable commit 前に ledger を failed へ移し、同一 key を再実行しません。
          failedWriterCalls += 1;
          return Promise.reject(new Error('R2 write unavailable'));
        },
        command: failedCommand,
        repositories: harness.repositories,
        storageUsagePercent: 90,
      });

    await expect(failingPublish()).rejects.toThrow('R2 write unavailable');
    expect(harness.idempotencyRecord('provider-event-failure-key')).toMatchObject({
      responseRef: null,
      status: 'failed',
    });
    await expect(failingPublish()).rejects.toThrow('previously failed');
    expect(failedWriterCalls).toBe(1);
  });

  it('storage threshold policy emits warning priority force-r2 and critical decisions safely', () => {
    expect(
      decideAgentBodyStorage({ byteSize: 1, currentPercent: 70, operationClass: 'mutation' })
        .snapshot
    ).toMatchObject({
      degraded: true,
      status: 'warning',
    });
    expect(
      decideAgentBodyStorage({ byteSize: 1, currentPercent: 80, operationClass: 'mutation' })
        .snapshot
    ).toMatchObject({
      shouldPrioritizeCompaction: true,
      status: 'compaction_priority',
    });
    expect(
      decideAgentBodyStorage({ byteSize: 1, currentPercent: 90, operationClass: 'mutation' })
    ).toMatchObject({ allowed: true, storageClass: 'r2' });
    expect(
      decideAgentBodyStorage({
        byteSize: agentInlineBodyLimitBytes + 1,
        currentPercent: 90,
        operationClass: 'mutation',
      })
    ).toMatchObject({ allowed: true, storageClass: 'r2' });
    expect(
      decideAgentBodyStorage({
        byteSize: agentInlineBodyLimitBytes + 1,
        currentPercent: 95,
        operationClass: 'mutation',
      })
    ).toMatchObject({ allowed: false, storageClass: 'r2' });
    expect(
      decideAgentBodyStorage({
        byteSize: agentInlineBodyLimitBytes + 1,
        currentPercent: 95,
        operationClass: 'compact',
      })
    ).toMatchObject({ allowed: true, storageClass: 'r2' });
    expect(agentImmutableBlobOwnerKinds).toEqual(
      expect.arrayContaining([
        'event_payload',
        'thread_history_body',
        'transcript',
        'tool_result_blob',
        'artifact',
        'event_archive_segment',
      ])
    );
  });

  it('[AGENT-MODEL-POLICY-S006] [AGENT-EVENTING-S010] Client Event model policy override is accepted and coalesced into pending work', async () => {
    const harness = new EventOffloadHarness();

    const result = await publishEventInStore({
      agentId,
      blobWriter: (blob) => harness.writeBlob(blob),
      command: {
        context: createContext('PublishEvent', 'event-override-digest', {
          scopes: ['agent.rpc', 'agent.event', 'agent.model_policy.override:policy-fast'],
        }),
        eventType: 'user.message.received',
        modelPolicyRef: 'policy-fast',
        source: 'client',
        threadKey: 'customer:model-policy-override',
      },
      repositories: harness.repositories,
    });

    expect(result.event).toMatchObject({
      policyOverrideSource: 'client_override',
      requestedModelPolicyRef: 'policy-fast',
    });
    expect(result.event.modelPolicy).toMatchObject({
      decisionSchemaVersion: 'v1',
      policyDigest: 'f'.repeat(64),
      policyRef: 'policy-fast',
      provider: 'workers-ai',
      status: 'active',
      version: 1,
    });
    expect(harness.events[0]).toMatchObject({
      policyOverrideSource: 'client_override',
      requestedModelPolicyDigest: 'f'.repeat(64),
      requestedModelPolicyRef: 'policy-fast',
      requestedModelPolicyValidationStatus: 'active',
      requestedModelPolicyVersion: 1,
    });
    expect(harness.repositories.pendingRuns.listRuns({ limit: 10 })).toHaveLength(1);
  });

  it('[AGENT-MODEL-POLICY-S006] [AGENT-EVENTING-S011] [AGENT-SECURITY-S016] Integration grant-outside policy override is rejected before Event and Run writes', async () => {
    const harness = new EventOffloadHarness();

    await expect(
      publishEventInStore({
        agentId,
        blobWriter: (blob) => harness.writeBlob(blob),
        command: {
          context: createContext('PublishEvent', 'integration-override-digest', {
            principalId: 'installation-inst-1',
            principalType: 'INTEGRATION_INSTALLATION',
            scopes: ['agent.rpc', 'agent.event'],
          }),
          eventType: 'integration.message.received',
          modelPolicyRef: 'policy-expensive',
          source: 'integration',
          threadKey: 'customer:integration-policy-override',
        },
        repositories: harness.repositories,
      })
    ).rejects.toThrow(/model policy override grant/);

    expect(harness.events).toHaveLength(0);
    expect(harness.repositories.pendingRuns.listRuns({ limit: 10 })).toHaveLength(0);
    expect(harness.blobWrites).toHaveLength(0);
  });

  it('digest verification rejects mismatched immutable blob writes before indexing', async () => {
    await expect(
      writeAgentImmutableBlob({
        agentId,
        body: new Uint8Array([1, 2, 3]),
        contentType: 'application/octet-stream',
        objectKey: 'agents/agent-alpha/events/event-bad/payload.bin',
        ownerId: 'event-bad',
        ownerKind: 'event_payload',
        writer: (blob) =>
          Promise.resolve({
            byteSize: blob.body.byteLength,
            key: blob.key,
            sha256: '0'.repeat(64),
          }),
      })
    ).rejects.toThrow(/digest verification failed/);
  });
});

class EventOffloadHarness {
  private agentSequence = 0;
  private readonly idempotencyRecords = new Map<string, AgentIdempotencyRecordRow>();
  private readonly reservedNonces = new Set<string>();
  private readonly r2Objects = new Map<string, AgentR2ObjectReferenceRow>();
  private readonly sections = new Map<string, AgentSectionRow>();
  private readonly threads = new Map<string, AgentThreadRow>();
  readonly blobWrites: AgentImmutableBlobWriteInput[] = [];
  readonly events: AgentEventRow[] = [];
  readonly repositories: AgentStorageRepositories;

  constructor() {
    this.repositories = this.createRepositories();
  }

  r2Object(objectRef: string): AgentR2ObjectReferenceRow {
    const row = this.r2Objects.get(objectRef);
    if (row === undefined) throw new Error('Expected indexed R2 object reference.');
    return row;
  }

  idempotencyRecord(idempotencyKey: string): AgentIdempotencyRecordRow | undefined {
    return this.idempotencyRecords.get(idempotencyKey);
  }

  nonceReservationCount(): number {
    return this.reservedNonces.size;
  }

  writeBlob(input: AgentImmutableBlobWriteInput): Promise<AgentImmutableBlobWriteResult> {
    // fake R2 writer は body を外部へ出さず、実装と同じ検証 metadata だけを返します。
    this.blobWrites.push(input);
    return Promise.resolve({
      byteSize: input.body.byteLength,
      contentType: input.contentType,
      key: input.key,
      sha256: input.sha256,
    });
  }

  private createRepositories(): AgentStorageRepositories {
    let repositories = undefined as unknown as AgentStorageRepositories;
    repositories = {
      archives: this.createArchivesRepository(),
      credentials: {
        findActiveCredential: () => undefined,
        findCredential: () => undefined,
        findCredentialByGeneration: () => undefined,
        insertCredential: unusedRepositoryMethod,
        listCredentials: () => [],
        tableName: 'agent_credentials',
        updateCredentialStatus: unusedRepositoryMethod,
      },
      events: this.createEventsRepository(),
      grants: {
        insertGrant: unusedRepositoryMethod,
        listGrantsForPrincipal: () => createGrantRows(),
        tableName: 'agent_grants',
        upsertGrant: unusedRepositoryMethod,
      },
      idempotency: {
        findRecord: (_principalId: string, idempotencyKey: string) => {
          return this.idempotencyRecords.get(idempotencyKey);
        },
        insertRecord: (
          input: Parameters<AgentStorageRepositories['idempotency']['insertRecord']>[0]
        ) => {
          this.idempotencyRecords.set(input.idempotencyKey, {
            createdAtMs: input.createdAtMs,
            expiresAtMs: input.expiresAtMs,
            idempotencyKey: input.idempotencyKey,
            operationName: input.operationName,
            principalId: input.principalId,
            requestDigest: input.requestDigest,
            responseRef: input.responseRef ?? null,
            status: input.status,
          });
        },
        tableName: 'agent_idempotency_records',
        updateRecordResponse: (
          input: Parameters<AgentStorageRepositories['idempotency']['updateRecordResponse']>[0]
        ) => {
          const record = this.idempotencyRecords.get(input.idempotencyKey);
          if (record === undefined) throw new Error('idempotency record missing in harness');
          this.idempotencyRecords.set(input.idempotencyKey, {
            ...record,
            responseRef: input.responseRef,
            status: input.status,
          });
        },
      },
      modelPolicies: this.createModelPoliciesRepository(),
      pendingRuns: this.createPendingRunsRepository(),
      profile: {
        getProfile: () => ({
          agentId,
          configVersion: 1,
          createdAtMs: nowMs,
          credentialGeneration: 1,
          displayName: 'Agent Alpha',
          lifecycleStatus: 'active',
          systemThreadId: 'thread-system',
          updatedAtMs: nowMs,
        }),
        tableName: 'agent_profile',
        upsertProfile: unusedRepositoryMethod,
      },
      requestNonces: {
        findNonce: () => undefined,
        insertNonce: unusedRepositoryMethod,
        reserveNonce: (input: { readonly nonce: string; readonly principalId: string }) => {
          const key = `${input.principalId}:${input.nonce}`;
          if (this.reservedNonces.has(key)) return { status: 'replay' as const };
          this.reservedNonces.add(key);
          return { status: 'reserved' as const };
        },
        tableName: 'agent_request_nonces',
      },
      sections: this.createSectionsRepository(),
      threads: this.createThreadsRepository(),
      transaction: <T>(operation: (repositories: AgentStorageRepositories) => T): T =>
        operation(repositories),
    } as unknown as AgentStorageRepositories;
    return repositories;
  }

  private createArchivesRepository() {
    return {
      archiveSegmentsTableName: 'agent_archive_segments' as const,
      findArchiveSegment: () => undefined,
      findR2ObjectReference: (objectRef: string) => this.r2Objects.get(objectRef),
      insertArchiveSegment: unusedRepositoryMethod,
      listArchiveSegments: () => [],
      markR2ObjectDeleted: unusedRepositoryMethod,
      r2ObjectReferencesTableName: 'agent_r2_object_references' as const,
      recordR2ObjectReference: (input: RecordAgentR2ObjectReferenceInput) => {
        const row: AgentR2ObjectReferenceRow = {
          bucketBinding: input.bucketBinding,
          byteSize: input.byteSize,
          contentType: input.contentType,
          createdAtMs: input.createdAtMs,
          deletedAtMs: null,
          objectKey: input.objectKey,
          objectRef: input.objectRef,
          ownerId: input.ownerId,
          ownerKind: input.ownerKind,
          provenanceRef: input.provenanceRef ?? null,
          retentionStatus: input.retentionStatus,
          sha256: input.sha256,
          status: input.status,
          storageClass: input.storageClass,
          threadId: input.threadId ?? null,
        };
        this.r2Objects.set(row.objectRef, row);
        return row;
      },
    };
  }

  private createEventsRepository() {
    return {
      appendEvent: (input: {
        readonly causationId?: string;
        readonly correlationId?: string;
        readonly createdAtMs: number;
        readonly eventId: string;
        readonly eventType: string;
        readonly idempotencyKey: string;
        readonly normalizedThreadKey: string;
        readonly occurredAtMs: number;
        readonly payloadByteSize?: number;
        readonly payloadContentType?: string;
        readonly payloadInlineBase64?: string;
        readonly payloadRef?: string;
        readonly payloadSha256?: string;
        readonly payloadStorageClass?: string;
        readonly policyOverrideSource?: string;
        readonly requestDigest?: string;
        readonly requestedModelPolicyDigest?: string;
        readonly requestedModelPolicyRef?: string;
        readonly requestedModelPolicyValidationStatus?: string;
        readonly requestedModelPolicyVersion?: number;
        readonly runId?: string;
        readonly sectionId: string;
        readonly sequences: AgentEventSequencePair;
        readonly source: string;
        readonly threadId: string;
        readonly threadKey: string;
      }) => {
        this.events.push({
          agentSequence: input.sequences.agentSequence,
          causationId: input.causationId ?? null,
          correlationId: input.correlationId ?? null,
          createdAtMs: input.createdAtMs,
          eventId: input.eventId,
          eventType: input.eventType,
          idempotencyKey: input.idempotencyKey,
          normalizedThreadKey: input.normalizedThreadKey,
          occurredAtMs: input.occurredAtMs,
          payloadByteSize: input.payloadByteSize ?? null,
          payloadContentType: input.payloadContentType ?? null,
          payloadInlineBase64: input.payloadInlineBase64 ?? null,
          payloadRef: input.payloadRef ?? null,
          payloadSha256: input.payloadSha256 ?? null,
          payloadStorageClass: input.payloadStorageClass ?? null,
          policyOverrideSource: input.policyOverrideSource ?? null,
          requestDigest: input.requestDigest ?? null,
          requestedModelPolicyDigest: input.requestedModelPolicyDigest ?? null,
          requestedModelPolicyRef: input.requestedModelPolicyRef ?? null,
          requestedModelPolicyValidationStatus: input.requestedModelPolicyValidationStatus ?? null,
          requestedModelPolicyVersion: input.requestedModelPolicyVersion ?? null,
          runId: input.runId ?? null,
          sectionId: input.sectionId,
          source: input.source,
          threadId: input.threadId,
          threadKey: input.threadKey,
          threadSequence: input.sequences.threadSequence,
        });
      },
      findByEventId: (eventId: string) => this.events.find((event) => event.eventId === eventId),
      findByIdempotencyKey: (key: string) =>
        this.events.find((event) => event.idempotencyKey === key),
      findLatestForThread: () => undefined,
      getNextSequences: (threadId: string) => ({
        agentSequence: (this.agentSequence += 1),
        threadSequence: this.events.filter((event) => event.threadId === threadId).length + 1,
      }),
      listEvents: () => [...this.events],
      tableName: 'agent_events' as const,
    };
  }

  private createModelPoliciesRepository() {
    return {
      getActivePolicy: (policyRef: string) => createModelPolicyRow(policyRef),
      tableName: 'agent_model_policies' as const,
      validatePolicy: (policy: AgentModelPolicyInputRecord, checkedAtMs: number) =>
        validateAgentModelPolicy(policy, checkedAtMs),
    };
  }

  private createPendingRunsRepository() {
    const runs = new Map<string, AgentRunRow>();
    return {
      countPendingRuns: () => runs.size,
      findActiveRun: () => undefined,
      findCurrentRun: () => undefined,
      findLatestRunForThread: () => undefined,
      findPendingRunForThread: () => undefined,
      findRunForEvent: (eventId: string) =>
        [...runs.values()].find((run) => run.triggerEventId === eventId),
      inputTableName: 'agent_run_inputs' as const,
      insertPendingRun: unusedRepositoryMethod,
      listRuns: () => [...runs.values()],
      runTableName: 'agent_runs' as const,
      upsertPendingRunForThread: (input: {
        readonly nowMs: number;
        readonly priority: number;
        readonly runId: string;
        readonly threadId: string;
        readonly triggerEventId: string;
      }) => {
        const row: AgentRunRow = {
          createdAtMs: input.nowMs,
          lastServedAtMs: null,
          pendingSinceMs: input.nowMs,
          priority: input.priority,
          runId: input.runId,
          status: 'pending',
          threadId: input.threadId,
          triggerEventId: input.triggerEventId,
          updatedAtMs: input.nowMs,
        };
        runs.set(row.runId, row);
        return row;
      },
    };
  }

  private createSectionsRepository() {
    return {
      findBySectionId: (_threadId: string, sectionId: string) => this.sections.get(sectionId),
      findOpenSection: (threadId: string) =>
        [...this.sections.values()].find(
          (section) => section.threadId === threadId && section.status === 'active'
        ),
      freezeSection: unusedRepositoryMethod,
      incrementEventCount: (_threadId: string, sectionId: string) => {
        const current = this.sections.get(sectionId);
        if (current !== undefined) {
          this.sections.set(sectionId, { ...current, eventCount: current.eventCount + 1 });
        }
      },
      insertSection: (input: {
        readonly createdAtMs: number;
        readonly sectionId: string;
        readonly sequence: number;
        readonly startThreadSequence: number;
        readonly status: string;
        readonly threadId: string;
      }) => {
        this.sections.set(input.sectionId, {
          createdAtMs: input.createdAtMs,
          endThreadSequence: null,
          eventCount: 0,
          frozenAtMs: null,
          openedAtMs: input.createdAtMs,
          sectionId: input.sectionId,
          sequence: input.sequence,
          startThreadSequence: input.startThreadSequence,
          status: input.status,
          threadId: input.threadId,
        });
      },
      listSections: () => [...this.sections.values()],
      tableName: 'agent_thread_sections' as const,
    };
  }

  private createThreadsRepository() {
    return {
      findByNormalizedThreadKey: (key: string) =>
        [...this.threads.values()].find((thread) => thread.normalizedThreadKey === key),
      findByThreadId: (threadId: string) => this.threads.get(threadId),
      insertThread: (input: {
        readonly normalizedThreadKey: string;
        readonly nowMs: number;
        readonly threadId: string;
        readonly threadKey: string;
      }) => {
        this.threads.set(input.threadId, {
          createdAtMs: input.nowMs,
          currentSectionId: null,
          lastServedAtMs: null,
          normalizedThreadKey: input.normalizedThreadKey,
          priority: 0,
          status: 'active',
          threadId: input.threadId,
          threadKey: input.threadKey,
          updatedAtMs: input.nowMs,
        });
      },
      listThreads: () => [...this.threads.values()],
      tableName: 'agent_threads' as const,
      updateCurrentSection: (input: {
        readonly currentSectionId: string;
        readonly threadId: string;
      }) => {
        const current = this.threads.get(input.threadId);
        if (current !== undefined) {
          this.threads.set(input.threadId, {
            ...current,
            currentSectionId: input.currentSectionId,
          });
        }
      },
    };
  }
}

function createContext(
  method: string,
  digestHex: string,
  options?: {
    readonly idempotencyKey?: string;
    readonly nonce?: string;
    readonly principalId?: string;
    readonly principalType?: 'CLIENT_SERVICE' | 'INTEGRATION_INSTALLATION';
    readonly scopes?: readonly string[];
  }
): AgentCoreRequestContext {
  return {
    agentId,
    bodyDigest: { algorithm: 'sha-256', byteLength: 10, digestHex },
    idempotencyKey: options?.idempotencyKey ?? `idem-${method}`,
    method,
    nonce: options?.nonce,
    principal: {
      agentId,
      principalId: options?.principalId ?? principalId,
      principalType: options?.principalType ?? 'CLIENT_SERVICE',
      scopes: options?.scopes ?? ['agent.rpc', 'agent.event'],
    },
    requestedAtMs: nowMs,
    service: 'cftamac.agent.v1.AgentEventService',
  };
}

function createModelPolicyRow(policyRef: string): AgentModelPolicyRow {
  return {
    archivedAtMs: null,
    budgetMetadataRef: 'policy-metadata://budget/default',
    budgetMetadataSha256: 'b'.repeat(64),
    createdAtMs: nowMs,
    createdByPrincipalId: principalId,
    credentialRef: null,
    decisionSchemaVersion: 'v1',
    generationMaxOutputTokens: null,
    generationParametersRef: 'policy-metadata://generation/default',
    generationParametersSha256: 'a'.repeat(64),
    generationTemperature: null,
    generationTopP: null,
    modelId: '@cf/meta/llama-3.1-8b-instruct',
    policyDigest: policyRef === 'policy-fast' ? 'f'.repeat(64) : 'e'.repeat(64),
    policyRef,
    provider: 'workers-ai',
    safeMetadataRef: 'policy-metadata://safe/default',
    safeMetadataSha256: 'c'.repeat(64),
    safetyMetadataRef: 'policy-metadata://safety/default',
    safetyMetadataSha256: 'd'.repeat(64),
    status: 'active',
    updatedAtMs: nowMs,
    updatedByPrincipalId: principalId,
    validatedAtMs: nowMs,
    version: 1,
  };
}

function createGrantRows(): AgentGrantRow[] {
  return ['agent.rpc', 'agent.event'].map((capability, index) => ({
    capability,
    createdAtMs: nowMs + index,
    grantId: `${principalId}:${capability}`,
    principalId,
    scopeRef: null,
    status: 'active',
    updatedAtMs: nowMs + index,
  }));
}

function unusedRepositoryMethod(): never {
  throw new Error('Unused repository method was called in an R2 offload test.');
}
