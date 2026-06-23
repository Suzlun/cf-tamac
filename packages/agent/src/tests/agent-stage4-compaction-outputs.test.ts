import { describe, expect, it } from 'vitest';

import { commitSuccessfulThreadCompaction } from '../compactions';
import { decodeBase64UrlBytes } from '../domain/security/base64url';

import type {
  AgentHistoryIndexRow,
  AgentImmutableBlobWriteInput,
  AgentImmutableBlobWriteResult,
  AgentR2ObjectReferenceRow,
  AgentStorageRepositories,
  AgentThreadCompactionRow,
  AgentThreadMemoryItemRow,
  AgentThreadMemoryVersionRow,
  CreateAgentThreadMemoryVersionInput,
  InsertAgentHistoryIndexInput,
  InsertAgentThreadMemoryItemInput,
  RecordAgentR2ObjectReferenceInput,
  UpdateAgentThreadCompactionOutputInput,
  UpdateAgentThreadMemoryVersionStatusInput,
} from '../storage';

const nowMs = 1_700_000_100_000;
const threadId = 'thread-alpha';
const compactionId = 'compaction-1';

describe('Agent Stage 4 Compaction successful outputs', () => {
  it('[AGENT-MEMORY-S003] [AGENT-MEMORY-S005] Compaction creates Handoff History and provenance-preserving MemoryDelta', async () => {
    const harness = createOutputHarness();

    const result = await commitSuccessfulThreadCompaction({
      agentId: 'agent-alpha',
      compactionId,
      handoff: {
        activeIntentions: ['respond with evidence-backed operational guidance'],
        constraints: ['do not expose credentials', 'keep Agent RPC protobuf-only'],
        currentGoals: ['complete Stage 4 memory persistence'],
        decisionsAndRationale: [
          {
            consideredOptions: ['store only summary', 'store handoff plus detailed history'],
            decision: 'store handoff plus detailed history',
            rationale: 'operators need a short restart object and a verifiable decision trace',
          },
        ],
        expectedNextActions: [
          'resume from latest ready compaction',
          'continue with open Section events',
        ],
        historyReferences: [],
        openLoops: ['confirm memory lineage in query handlers later'],
        pendingQuestions: ['which history entries should be retrieved for the next Run?'],
        situation: 'Section 1 captured customer and tool activity for Stage 4 implementation.',
      },
      history: {
        actorIntentions: ['client requested Stage 4 tasks 6.3 through 6.5'],
        artifacts: ['packages/agent/src/compactions/outputs.ts'],
        assumptions: ['R2 offload is exercised by the dedicated large History scenario'],
        chronology: [
          'event-1 user requested implementation',
          'event-2 tool activity produced tests',
        ],
        consideredOptions: ['split tasks', 'commit outputs atomically'],
        decisions: [
          {
            actor: 'agent',
            decision: 'commit Handoff History and MemoryDelta in one transaction',
            rationale: 'ready Compaction must not point at partially written memory artifacts',
          },
        ],
        explicitRationale: ['atomic commit prevents restart context drift'],
        replayManifest: ['event:event-1', 'event:event-2', 'run:run-1'],
        summary: 'Compaction output records for Stage 4 memory persistence.',
        toolActivity: ['inspected storage repositories', 'ran Stage 4 tests'],
        unresolvedIssues: ['Memory rebase lineage belongs to later Stage 4 tasks'],
      },
      historyId: 'history-1',
      memoryDelta: {
        operations: [
          {
            contentText: 'Reports to this operator must be in Japanese.',
            kind: 'add',
            memoryItemId: 'memory-added-language',
            provenanceRef: 'event:event-1',
            sourceEventId: 'event-1',
          },
          {
            kind: 'confirm',
            memoryItemId: 'memory-confirm-goal',
            provenanceRef: 'history:history-1#goal-confirmed',
            targetMemoryItemId: 'memory-goal',
          },
          {
            contentText: 'Do not hand-edit Agent generated protobuf or RPC outputs.',
            kind: 'revise',
            memoryItemId: 'memory-revised-generated-policy',
            provenanceRef: 'history:history-1#generated-policy',
            targetMemoryItemId: 'memory-generated-policy',
          },
          {
            contentText:
              'Compaction output commit owns Handoff, History, and MemoryDelta together.',
            kind: 'supersede',
            memoryItemId: 'memory-supersede-output-boundary',
            provenanceRef: 'history:history-1#output-boundary',
            targetMemoryItemId: 'memory-output-boundary',
          },
          {
            kind: 'invalidate',
            memoryItemId: 'memory-invalidated-rest-route',
            provenanceRef: 'history:history-1#rest-route-invalid',
            targetMemoryItemId: 'memory-rest-route',
          },
        ],
        provenanceRef: 'compaction:compaction-1/memory-delta',
      },
      nowMs,
      provenanceRef: 'compaction:compaction-1/provenance',
      repositories: harness.repositories,
    });

    const handoff = parseInlineJsonRef(result.compaction.handoffRef);
    const historyBody = parseInlineJsonRef(result.historyIndex.bodyRef);
    const memoryDelta = parseInlineJsonRef(result.compaction.memoryDeltaRef);

    expect(result.compaction).toMatchObject({
      completedAtMs: nowMs,
      historyRef: 'history://history-1',
      provenanceRef: 'compaction:compaction-1/provenance',
      status: 'ready',
    });
    expect(result.compaction.digestSha256).toMatch(/^[\da-f]{64}$/);
    expect(handoff).toMatchObject({
      constraints: ['do not expose credentials', 'keep Agent RPC protobuf-only'],
      currentGoals: ['complete Stage 4 memory persistence'],
      historyReferences: ['history://history-1'],
      schema: 'cftamac.agent.handoff.v1',
      situation: 'Section 1 captured customer and tool activity for Stage 4 implementation.',
    });
    expect(historyBody).toMatchObject({
      artifacts: ['packages/agent/src/compactions/outputs.ts'],
      chronology: ['event-1 user requested implementation', 'event-2 tool activity produced tests'],
      replayManifest: ['event:event-1', 'event:event-2', 'run:run-1'],
      schema: 'cftamac.agent.thread-history.v1',
      toolActivity: ['inspected storage repositories', 'ran Stage 4 tests'],
    });
    expect(result.historyIndex).toMatchObject({
      bodyContentType: 'application/json',
      bodyStorageClass: 'inline',
      compactionId,
      endThreadSequence: 25,
      provenanceRef: 'compaction:compaction-1/provenance',
      sectionId: 'section-1',
      startThreadSequence: 1,
      threadId,
    });
    expect(result.historyIndex.bodySha256).toMatch(/^[\da-f]{64}$/);
    expect(memoryDelta).toMatchObject({
      operations: expect.arrayContaining([
        expect.objectContaining({ kind: 'add', memoryItemId: 'memory-added-language' }),
        expect.objectContaining({ kind: 'confirm', memoryItemId: 'memory-confirm-goal' }),
        expect.objectContaining({
          kind: 'revise',
          memoryItemId: 'memory-revised-generated-policy',
        }),
        expect.objectContaining({
          kind: 'supersede',
          memoryItemId: 'memory-supersede-output-boundary',
        }),
        expect.objectContaining({
          kind: 'invalidate',
          memoryItemId: 'memory-invalidated-rest-route',
        }),
      ]),
      provenanceRef: 'compaction:compaction-1/memory-delta',
      schema: 'cftamac.agent.thread-memory-delta.v1',
    });
    expect(harness.memoryVersions.get('memory-v1')).toMatchObject({ status: 'superseded' });
    expect(result.memoryVersion).toMatchObject({
      itemCount: 5,
      latestCompactionId: compactionId,
      memoryId: 'thread-memory://thread-alpha/v2',
      provenanceRef: 'compaction:compaction-1/memory-delta',
      status: 'active',
      version: 2,
    });
    expect(result.memoryItems.map((item) => item.memoryItemId).sort()).toEqual([
      'memory-added-language',
      'memory-confirm-goal',
      'memory-invalidated-rest-route',
      'memory-revised-generated-policy',
      'memory-supersede-output-boundary',
    ]);
    expect(
      harness.memoryItem('thread-memory://thread-alpha/v2', 'memory-confirm-goal')
    ).toMatchObject({
      provenanceRef: 'history:history-1#goal-confirmed',
      sourceCompactionId: compactionId,
      sourceHistoryId: 'history-1',
      status: 'confirmed',
      supersedesItemId: 'memory-goal',
    });
    expect(
      harness.memoryItem('thread-memory://thread-alpha/v2', 'memory-invalidated-rest-route')
    ).toMatchObject({ invalidatesItemId: 'memory-rest-route', status: 'invalidated' });
  });

  it('[AGENT-MEMORY-S006] Large History body is stored in R2 with index metadata', async () => {
    const harness = createOutputHarness();
    const largeHistoryLine = 'large-history-body-with-verifiable-digest-'.repeat(2_000);

    const result = await commitSuccessfulThreadCompaction({
      agentId: 'agent-alpha',
      blobWriter: (blob) => harness.writeBlob(blob),
      compactionId,
      handoff: {
        activeIntentions: ['preserve storage safety'],
        constraints: ['do not expose raw R2 body'],
        currentGoals: ['verify large History offload'],
        decisionsAndRationale: [],
        expectedNextActions: ['read digest metadata from SQLite index'],
        historyReferences: [],
        openLoops: [],
        pendingQuestions: [],
        situation: 'Large History body must leave DO SQLite as an authoritative index only.',
      },
      history: {
        actorIntentions: ['operator requested Stage 4 R2 offload'],
        artifacts: ['artifact://large-history-fixture'],
        assumptions: ['R2 object body is immutable after write'],
        chronology: [largeHistoryLine],
        consideredOptions: ['inline body', 'R2 body with digest index'],
        decisions: [
          {
            actor: 'agent',
            decision: 'store large History body in R2',
            rationale:
              'DO SQLite must remain the authoritative index without carrying raw body bytes',
          },
        ],
        explicitRationale: ['large body exceeds inline threshold'],
        replayManifest: ['event:event-1', 'section:section-1'],
        summary: 'Large History body offload coverage.',
        toolActivity: ['none'],
        unresolvedIssues: [],
      },
      historyId: 'history-large',
      memoryDelta: { operations: [], provenanceRef: 'compaction:compaction-1/memory-delta' },
      nowMs,
      provenanceRef: 'compaction:compaction-1/provenance',
      repositories: harness.repositories,
      storageUsagePercent: 90,
    });

    const objectRef = result.historyIndex.bodyRef;
    if (objectRef === null) throw new Error('Expected large History R2 object ref.');
    const object = harness.r2Object(objectRef);

    expect(result.historyIndex).toMatchObject({
      bodyContentType: 'application/json',
      bodyRef:
        'r2://agents/agent-alpha/threads/thread-alpha/compactions/compaction-1/history/history-large.json',
      bodyStorageClass: 'r2',
      compactionId,
      provenanceRef: 'compaction:compaction-1/provenance',
      retentionStatus: 'active',
      sectionId: 'section-1',
      startThreadSequence: 1,
      threadId,
    });
    expect(result.compaction.r2ObjectRef).toBe(objectRef);
    expect(result.historyIndex.bodySha256).toMatch(/^[\da-f]{64}$/);
    expect(object).toMatchObject({
      bucketBinding: 'AGENT_BLOBS',
      contentType: 'application/json',
      objectRef,
      ownerId: 'history-large',
      ownerKind: 'thread_history_body',
      provenanceRef: 'compaction:compaction-1/provenance',
      retentionStatus: 'active',
      sha256: result.historyIndex.bodySha256,
      status: 'active',
      storageClass: 'r2',
      threadId,
    });
    expect(harness.blobWrites).toHaveLength(1);
    expect(harness.blobWrites[0]).toMatchObject({
      contentType: 'application/json',
      key: object.objectKey,
      sha256: object.sha256,
    });
    expect(object.byteSize).toBe(result.historyIndex.bodyByteSize);
  });

  it('large History R2 index rolls back when compaction output commit fails', async () => {
    const harness = createOutputHarness();
    const largeHistoryLine = 'rollback-large-history-body-'.repeat(2_500);

    await expect(
      commitSuccessfulThreadCompaction({
        agentId: 'agent-alpha',
        blobWriter: (blob) => harness.writeBlob(blob),
        compactionId,
        handoff: {
          activeIntentions: ['verify rollback'],
          constraints: ['R2 index must share SQLite transaction boundary'],
          currentGoals: ['avoid orphan authoritative index rows'],
          decisionsAndRationale: [],
          expectedNextActions: [],
          historyReferences: [],
          openLoops: [],
          pendingQuestions: [],
          situation: 'Invalid MemoryDelta should abort the compaction commit.',
        },
        history: {
          actorIntentions: ['operator requested rollback safety'],
          artifacts: [],
          assumptions: [],
          chronology: [largeHistoryLine],
          consideredOptions: [
            'record R2 index before transaction',
            'record R2 index inside transaction',
          ],
          decisions: [],
          explicitRationale: ['authoritative index rows must rollback with History index rows'],
          replayManifest: ['event:event-rollback'],
          summary: 'Rollback coverage for large History offload.',
          toolActivity: [],
          unresolvedIssues: [],
        },
        historyId: 'history-rollback',
        memoryDelta: {
          operations: [
            {
              kind: 'confirm',
              memoryItemId: 'missing-target-confirmation',
              provenanceRef: 'history:history-rollback#missing-target',
              targetMemoryItemId: 'missing-target',
            },
          ],
          provenanceRef: 'compaction:compaction-1/memory-delta',
        },
        nowMs,
        provenanceRef: 'compaction:compaction-1/provenance',
        repositories: harness.repositories,
      })
    ).rejects.toThrow(/target Memory item/);

    expect(harness.blobWrites).toHaveLength(1);
    expect(harness.r2ObjectCount()).toBe(0);
  });
});

function createOutputHarness(): OutputHarness {
  const harness = new OutputHarness();
  harness.addCompaction(createCompactionRow());
  harness.addMemoryVersion({
    createdAtMs: nowMs - 10_000,
    itemCount: 4,
    latestCompactionId: 'compaction-0',
    memoryId: 'memory-v1',
    memoryRef: 'thread-memory://thread-alpha/v1',
    provenanceRef: 'compaction:compaction-0/provenance',
    rebaseStatus: null,
    snapshotRef: null,
    status: 'active',
    threadId,
    updatedAtMs: nowMs - 10_000,
    version: 1,
  });
  for (const memoryItemId of [
    'memory-goal',
    'memory-generated-policy',
    'memory-output-boundary',
    'memory-rest-route',
  ]) {
    harness.addMemoryItem(createMemoryItem('memory-v1', memoryItemId, `previous ${memoryItemId}`));
  }
  return harness;
}

class OutputHarness {
  private readonly compactions = new Map<string, AgentThreadCompactionRow>();
  private readonly histories = new Map<string, AgentHistoryIndexRow>();
  private readonly memoryItems = new Map<string, AgentThreadMemoryItemRow>();
  private readonly r2Objects = new Map<string, AgentR2ObjectReferenceRow>();
  readonly blobWrites: AgentImmutableBlobWriteInput[] = [];
  readonly memoryVersions = new Map<string, AgentThreadMemoryVersionRow>();
  readonly repositories: AgentStorageRepositories;

  constructor() {
    this.repositories = this.createRepositories();
  }

  addCompaction(row: AgentThreadCompactionRow): void {
    // Compaction row は ready 遷移と output refs の永続化確認に使います。
    this.compactions.set(row.compactionId, row);
  }

  addHistory(row: AgentHistoryIndexRow): void {
    // History index row は body metadata と provenance の確認に使います。
    this.histories.set(row.historyId, row);
  }

  addMemoryItem(row: AgentThreadMemoryItemRow): void {
    // Memory item は version ID と item ID の組で保持し、lineage を検証できるようにします。
    this.memoryItems.set(createMemoryItemKey(row.memoryId, row.memoryItemId), row);
  }

  addMemoryVersion(row: AgentThreadMemoryVersionRow): void {
    // Memory version は active/superseded selection の検証に使います。
    this.memoryVersions.set(row.memoryId, row);
  }

  memoryItem(memoryId: string, memoryItemId: string): AgentThreadMemoryItemRow | undefined {
    return this.memoryItems.get(createMemoryItemKey(memoryId, memoryItemId));
  }

  r2Object(objectRef: string): AgentR2ObjectReferenceRow {
    const row = this.r2Objects.get(objectRef);
    if (row === undefined) throw new Error('R2 object reference missing in test harness.');
    return row;
  }

  r2ObjectCount(): number {
    return this.r2Objects.size;
  }

  writeBlob(input: AgentImmutableBlobWriteInput): Promise<AgentImmutableBlobWriteResult> {
    // R2 body は test harness 内だけに保持し、実装と同じ digest/size metadata を返します。
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
      archives: {
        archiveSegmentsTableName: 'agent_archive_segments',
        findArchiveSegment: () => undefined,
        findR2ObjectReference: (objectRef: string) => this.r2Objects.get(objectRef),
        insertArchiveSegment: () => {
          throw new Error('Archive segments are not used by this test harness.');
        },
        listArchiveSegments: () => [],
        markR2ObjectDeleted: () => {
          throw new Error('R2 delete is not used by this test harness.');
        },
        r2ObjectReferencesTableName: 'agent_r2_object_references',
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
      },
      compactions: {
        findByCompactionId: (targetCompactionId: string) =>
          this.compactions.get(targetCompactionId),
        findBySectionId: () => undefined,
        findLatestReadyCompaction: () =>
          [...this.compactions.values()].find((row) => row.status === 'ready'),
        getNextCompactionOrdinal: () => 2,
        insertCompaction: () => {
          throw new Error('insertCompaction is not used by this test harness.');
        },
        listCompactions: () => [...this.compactions.values()],
        tableName: 'agent_thread_compactions',
        updateCompactionOutput: (input: UpdateAgentThreadCompactionOutputInput) => {
          const current = this.compactions.get(input.compactionId);
          if (current === undefined) throw new Error('Compaction missing in test harness.');
          const updated: AgentThreadCompactionRow = {
            ...current,
            archiveRef: input.archiveRef ?? null,
            completedAtMs: input.completedAtMs ?? null,
            digestSha256: input.digestSha256 ?? null,
            errorCode: input.errorCode ?? null,
            errorMessage: input.errorMessage ?? null,
            handoffRef: input.handoffRef ?? null,
            historyRef: input.historyRef ?? null,
            memoryDeltaRef: input.memoryDeltaRef ?? null,
            outputRef: input.outputRef ?? null,
            provenanceRef: input.provenanceRef ?? current.provenanceRef,
            r2ObjectRef: input.r2ObjectRef ?? null,
            status: input.status,
            updatedAtMs: input.updatedAtMs,
          };
          this.addCompaction(updated);
          return updated;
        },
        updateCompactionStatus: () => {
          throw new Error('updateCompactionStatus is not used by this test harness.');
        },
      },
      history: {
        findByHistoryId: (historyId: string) => this.histories.get(historyId),
        insertHistoryIndex: (input: InsertAgentHistoryIndexInput) => {
          const row: AgentHistoryIndexRow = {
            bodyByteSize: input.bodyByteSize ?? null,
            bodyContentType: input.bodyContentType ?? null,
            bodyRef: input.bodyRef ?? null,
            bodySha256: input.bodySha256 ?? null,
            bodyStorageClass: input.bodyStorageClass ?? null,
            compactionId: input.compactionId ?? null,
            createdAtMs: input.createdAtMs,
            endThreadSequence: input.endThreadSequence,
            historyId: input.historyId,
            historyRef: input.historyRef,
            provenanceRef: input.provenanceRef ?? null,
            queryText: input.queryText ?? null,
            retentionStatus: input.retentionStatus ?? 'active',
            sectionId: input.sectionId ?? null,
            startThreadSequence: input.startThreadSequence,
            summary: input.summary ?? null,
            threadId: input.threadId,
          };
          this.addHistory(row);
          return row;
        },
        listForCompaction: (targetCompactionId: string) =>
          [...this.histories.values()].filter((row) => row.compactionId === targetCompactionId),
        searchHistoryIndexes: () => [...this.histories.values()],
        tableName: 'agent_history_indexes',
      },
      memory: {
        agentMemoryItemsTableName: 'agent_memory_items',
        agentMemoryVersionsTableName: 'agent_memory_versions',
        createAgentMemoryVersion: () => {
          throw new Error('AgentMemory is not used by this test harness.');
        },
        createThreadMemoryVersion: (input: CreateAgentThreadMemoryVersionInput) => {
          const row: AgentThreadMemoryVersionRow = {
            createdAtMs: input.createdAtMs,
            itemCount: input.itemCount ?? 0,
            latestCompactionId: input.latestCompactionId ?? null,
            memoryId: input.memoryId,
            memoryRef: input.memoryRef ?? null,
            provenanceRef: input.provenanceRef ?? null,
            rebaseStatus: input.rebaseStatus ?? null,
            snapshotRef: input.snapshotRef ?? null,
            status: input.status,
            threadId: input.threadId,
            updatedAtMs: input.createdAtMs,
            version: input.version,
          };
          this.addMemoryVersion(row);
          return row;
        },
        findActiveAgentMemoryVersion: () => undefined,
        findActiveThreadMemoryVersion: (targetThreadId: string) =>
          [...this.memoryVersions.values()]
            .filter((row) => row.threadId === targetThreadId && row.status === 'active')
            .sort((left, right) => right.version - left.version)[0],
        findAgentMemoryVersion: () => undefined,
        findThreadMemoryVersion: (_targetThreadId: string, memoryId: string) =>
          this.memoryVersions.get(memoryId),
        insertAgentMemoryItem: () => {
          throw new Error('AgentMemory item is not used by this test harness.');
        },
        insertThreadMemoryItem: (input: InsertAgentThreadMemoryItemInput) => {
          const row: AgentThreadMemoryItemRow = {
            contentRef: input.contentRef ?? null,
            contentSha256: input.contentSha256 ?? null,
            contentText: input.contentText ?? null,
            createdAtMs: input.createdAtMs,
            invalidatesItemId: input.invalidatesItemId ?? null,
            memoryId: input.memoryId,
            memoryItemId: input.memoryItemId,
            provenanceRef: input.provenanceRef ?? null,
            sourceCompactionId: input.sourceCompactionId ?? null,
            sourceEventId: input.sourceEventId ?? null,
            sourceHistoryId: input.sourceHistoryId ?? null,
            status: input.status,
            supersedesItemId: input.supersedesItemId ?? null,
            threadId: input.threadId,
            updatedAtMs: input.createdAtMs,
          };
          this.addMemoryItem(row);
          return row;
        },
        listAgentMemoryItems: () => [],
        listThreadMemoryItems: (targetThreadId: string, memoryId: string) =>
          [...this.memoryItems.values()].filter(
            (row) => row.threadId === targetThreadId && row.memoryId === memoryId
          ),
        threadMemoryItemsTableName: 'agent_thread_memory_items',
        threadMemoryVersionsTableName: 'agent_thread_memory_versions',
        updateThreadMemoryVersionStatus: (input: UpdateAgentThreadMemoryVersionStatusInput) => {
          const current = this.memoryVersions.get(input.memoryId);
          if (current === undefined) throw new Error('Memory version missing in test harness.');
          const updated = { ...current, status: input.status, updatedAtMs: input.updatedAtMs };
          this.addMemoryVersion(updated);
          return updated;
        },
      },
      transaction: <T>(operation: (repositories: AgentStorageRepositories) => T): T => {
        const snapshot = this.createRollbackSnapshot();
        try {
          return operation(repositories);
        } catch (error) {
          this.restoreRollbackSnapshot(snapshot);
          throw error;
        }
      },
    } as unknown as AgentStorageRepositories;
    return repositories;
  }

  private createRollbackSnapshot(): OutputHarnessSnapshot {
    return {
      compactions: new Map(this.compactions),
      histories: new Map(this.histories),
      memoryItems: new Map(this.memoryItems),
      memoryVersions: new Map(this.memoryVersions),
      r2Objects: new Map(this.r2Objects),
    };
  }

  private restoreRollbackSnapshot(snapshot: OutputHarnessSnapshot): void {
    restoreMap(this.compactions, snapshot.compactions);
    restoreMap(this.histories, snapshot.histories);
    restoreMap(this.memoryItems, snapshot.memoryItems);
    restoreMap(this.memoryVersions, snapshot.memoryVersions);
    restoreMap(this.r2Objects, snapshot.r2Objects);
  }
}

interface OutputHarnessSnapshot {
  readonly compactions: Map<string, AgentThreadCompactionRow>;
  readonly histories: Map<string, AgentHistoryIndexRow>;
  readonly memoryItems: Map<string, AgentThreadMemoryItemRow>;
  readonly memoryVersions: Map<string, AgentThreadMemoryVersionRow>;
  readonly r2Objects: Map<string, AgentR2ObjectReferenceRow>;
}

function restoreMap<Key, Value>(target: Map<Key, Value>, snapshot: Map<Key, Value>): void {
  target.clear();
  for (const [key, value] of snapshot) target.set(key, value);
}

function createCompactionRow(): AgentThreadCompactionRow {
  return {
    archiveRef: null,
    completedAtMs: null,
    compactionId,
    compactionOrdinal: 1,
    createdAtMs: nowMs - 1_000,
    digestSha256: null,
    endThreadSequence: 25,
    errorCode: null,
    errorMessage: null,
    handoffRef: null,
    historyRef: null,
    memoryDeltaRef: null,
    outputRef: null,
    provenanceRef: 'compaction:compaction-1/start',
    r2ObjectRef: null,
    sectionId: 'section-1',
    sectionOrdinal: 1,
    startedAtMs: nowMs - 500,
    startThreadSequence: 1,
    status: 'running',
    threadId,
    updatedAtMs: nowMs - 500,
  };
}

function createMemoryItem(
  memoryId: string,
  memoryItemId: string,
  contentText: string
): AgentThreadMemoryItemRow {
  return {
    contentRef: null,
    contentSha256: null,
    contentText,
    createdAtMs: nowMs - 10_000,
    invalidatesItemId: null,
    memoryId,
    memoryItemId,
    provenanceRef: `seed:${memoryItemId}`,
    sourceCompactionId: 'compaction-0',
    sourceEventId: null,
    sourceHistoryId: 'history-0',
    status: 'active',
    supersedesItemId: null,
    threadId,
    updatedAtMs: nowMs - 10_000,
  };
}

function parseInlineJsonRef(ref: string | null): Record<string, unknown> {
  if (ref === null) throw new Error('Inline ref is missing.');
  const encoded = ref.split('/').slice(-1)[0];
  if (encoded === undefined || encoded === '') throw new Error('Inline ref payload is missing.');
  const text = new TextDecoder().decode(decodeBase64UrlBytes(encoded));
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError('Inline ref JSON payload must be an object.');
  }
  return parsed as Record<string, unknown>;
}

function createMemoryItemKey(memoryId: string, memoryItemId: string): string {
  return `${memoryId}#${memoryItemId}`;
}
