import { describe, expect, it } from 'vitest';

import { publishEventInStore } from '../events';
import {
  agentBlobBucketBindingName,
  agentImmutableBlobOwnerKinds,
  agentInlineBodyLimitBytes,
  decideAgentBodyStorage,
  writeAgentImmutableBlob,
} from '../storage';

import type { AgentCoreRequestContext } from '../domain';
import type {
  AgentEventRow,
  AgentEventSequencePair,
  AgentGrantRow,
  AgentImmutableBlobWriteInput,
  AgentImmutableBlobWriteResult,
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
  private readonly idempotencyResponses = new Map<string, string>();
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
          const responseRef = this.idempotencyResponses.get(idempotencyKey);
          return responseRef === undefined
            ? undefined
            : {
                createdAtMs: nowMs,
                expiresAtMs: nowMs + 1_000,
                idempotencyKey,
                operationName: 'AgentEventService.PublishEvent',
                principalId,
                requestDigest: 'event-large-digest',
                responseRef,
                status: 'succeeded',
              };
        },
        insertRecord: (input: {
          readonly idempotencyKey: string;
          readonly responseRef?: string;
        }) => {
          this.idempotencyResponses.set(input.idempotencyKey, input.responseRef ?? '{}');
        },
        tableName: 'agent_idempotency_records',
      },
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
        reserveNonce: () => ({ status: 'reserved' as const }),
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
        readonly requestDigest?: string;
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
          requestDigest: input.requestDigest ?? null,
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

function createContext(method: string, digestHex: string): AgentCoreRequestContext {
  return {
    agentId,
    bodyDigest: { algorithm: 'sha-256', byteLength: 10, digestHex },
    idempotencyKey: `idem-${method}`,
    method,
    principal: {
      agentId,
      principalId,
      principalType: 'CLIENT_SERVICE',
      scopes: ['agent.rpc', 'agent.event'],
    },
    requestedAtMs: nowMs,
    service: 'cftamac.agent.v1.AgentEventService',
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
