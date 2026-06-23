import { describe, expect, it } from 'vitest';

import {
  buildThreadMemoryRebaseTriggerState,
  evaluateThreadMemoryRebaseTriggerPolicy,
  executeThreadMemoryRebase,
} from '../compactions';
import { createImmutableRunSnapshot } from '../runs';

import type {
  AgentConfigRow,
  AgentEventRow,
  AgentHistoryIndexRow,
  AgentRunInputSnapshotRow,
  AgentRunRow,
  AgentStorageRepositories,
  AgentThreadCompactionRow,
  AgentThreadMemoryItemRow,
  AgentThreadMemoryVersionRow,
  CreateAgentThreadMemoryVersionInput,
  InsertAgentThreadMemoryItemInput,
  UpdateAgentThreadMemoryVersionStatusInput,
} from '../storage';

const agentId = 'agent-alpha';
const threadId = 'thread-rebase';
const nowMs = 1_700_000_200_000;

describe('Agent Stage 4 Memory rebase', () => {
  it('[AGENT-MEMORY-S007] Memory rebase refreshes long-term Memory without losing lineage', () => {
    const explicitEvaluation = evaluateThreadMemoryRebaseTriggerPolicy(
      {},
      {
        compactionCount: 0,
        contradictionCount: 0,
        explicitRequest: true,
        memoryItemCount: 0,
        tokenEstimate: 0,
      }
    );
    expect(explicitEvaluation).toMatchObject({
      reasons: ['explicit_request'],
      shouldRebase: true,
    });

    const harness = createRebaseHarness();
    const observedState = buildThreadMemoryRebaseTriggerState({
      repositories: harness.repositories,
      threadId,
    });

    expect(observedState).toMatchObject({
      compactionCount: 3,
      contradictionCount: 1,
      explicitRequest: false,
      memoryItemCount: 4,
    });
    expect(observedState.tokenEstimate).toBeGreaterThan(0);

    const result = executeThreadMemoryRebase({
      nowMs,
      policy: {
        compactionCountThreshold: 3,
        contradictionCountThreshold: 1,
        memoryItemCountThreshold: 4,
        tokenEstimateThreshold: 1,
      },
      repositories: harness.repositories,
      requestProvenanceRef: 'operator:memory-rebase-request-1',
      threadId,
    });

    expect(result.status).toBe('rebased');
    expect(result.trigger.reasons).toEqual([
      'compaction_count',
      'memory_item_count',
      'token_estimate',
      'contradiction_count',
    ]);

    const version = readRequiredResultVersion(result.version);
    const provenance = parseRebaseProvenance(version.provenanceRef);

    expect(harness.memoryVersion('memory-v3')).toMatchObject({ status: 'superseded' });
    expect(harness.activeVersion()).toMatchObject({
      memoryId: version.memoryId,
      rebaseStatus: 'rebased',
      status: 'active',
      version: 4,
    });
    expect(version).toMatchObject({
      itemCount: 4,
      latestCompactionId: 'compaction-3',
      memoryRef: 'thread-memory://thread-rebase/v4',
      snapshotRef: 'thread-memory-rebase://thread-rebase/from/v3/to/v4',
    });
    expect(provenance).toMatchObject({
      priorMemoryId: 'memory-v3',
      priorVersion: 3,
      requestProvenanceRef: 'operator:memory-rebase-request-1',
      schema: 'cftamac.agent.thread-memory-rebase.v1',
      triggerReasons: [
        'compaction_count',
        'memory_item_count',
        'token_estimate',
        'contradiction_count',
      ],
    });
    expect(provenance.retainedHistoryRefs.map((history) => history.historyRef)).toEqual([
      'history://history-1',
      'history://history-2',
    ]);
    expect(harness.historyCount()).toBe(2);

    expect(harness.memoryItem(version.memoryId, 'memory-confirmed')).toMatchObject({
      status: 'confirmed',
      supersedesItemId: 'memory-original-fact',
    });
    expect(harness.memoryItem(version.memoryId, 'memory-revised')).toMatchObject({
      status: 'active',
      supersedesItemId: 'memory-old-policy',
    });
    expect(harness.memoryItem(version.memoryId, 'memory-invalidated')).toMatchObject({
      invalidatesItemId: 'memory-legacy-rest-api',
      status: 'invalidated',
    });
    expect(harness.memoryItem('memory-v3', 'memory-invalidated')).toMatchObject({
      status: 'invalidated',
    });

    harness.addEvent(createEvent('event-run-1', 42));
    const snapshot = createImmutableRunSnapshot({
      agentId,
      nowMs: nowMs + 1,
      repositories: harness.repositories,
      run: createRun('run-after-rebase', 'event-run-1'),
    });

    expect(snapshot).toMatchObject({
      latestReadyCompactionRef: 'output://compaction-3',
      threadMemoryRef: 'thread-memory://thread-rebase/v4',
      threadMemoryVersion: 4,
    });
  });
});

function createRebaseHarness(): RebaseHarness {
  const harness = new RebaseHarness();
  harness.addCompaction(createReadyCompaction('compaction-1', 1, 'output://compaction-1'));
  harness.addCompaction(createReadyCompaction('compaction-2', 2, 'output://compaction-2'));
  harness.addCompaction(createReadyCompaction('compaction-3', 3, 'output://compaction-3'));
  harness.addHistory(createHistory('history-1', 1, 'compaction-1'));
  harness.addHistory(createHistory('history-2', 2, 'compaction-3'));
  harness.addMemoryVersion(createMemoryVersion());
  harness.addMemoryItem(
    createMemoryItem({
      contentText: '現在の回答方針は、根拠を明示して日本語で報告すること。',
      memoryItemId: 'memory-stable',
      status: 'active',
    })
  );
  harness.addMemoryItem(
    createMemoryItem({
      contentText: '利用者の主要制約は Agent public API を Protobuf RPC-only に保つこと。',
      memoryItemId: 'memory-confirmed',
      status: 'confirmed',
      supersedesItemId: 'memory-original-fact',
    })
  );
  harness.addMemoryItem(
    createMemoryItem({
      contentText: 'generated proto/RPC は TypeSpec と generation command だけで更新する。',
      memoryItemId: 'memory-revised',
      status: 'active',
      supersedesItemId: 'memory-old-policy',
    })
  );
  harness.addMemoryItem(
    createMemoryItem({
      contentText: 'Agent REST route を提供するという古い判断は無効化された。',
      invalidatesItemId: 'memory-legacy-rest-api',
      memoryItemId: 'memory-invalidated',
      status: 'invalidated',
    })
  );
  return harness;
}

class RebaseHarness {
  private readonly compactions = new Map<string, AgentThreadCompactionRow>();
  private readonly events = new Map<string, AgentEventRow>();
  private readonly histories = new Map<string, AgentHistoryIndexRow>();
  private readonly memoryItems = new Map<string, AgentThreadMemoryItemRow>();
  private readonly memoryVersions = new Map<string, AgentThreadMemoryVersionRow>();
  private readonly snapshots = new Map<string, AgentRunInputSnapshotRow>();
  readonly repositories: AgentStorageRepositories;

  constructor() {
    this.repositories = this.createRepositories();
  }

  activeVersion(): AgentThreadMemoryVersionRow | undefined {
    // active selection は repository と同じ version 降順で確認します。
    return [...this.memoryVersions.values()]
      .filter((version) => version.threadId === threadId && version.status === 'active')
      .sort((left, right) => right.version - left.version)[0];
  }

  addCompaction(row: AgentThreadCompactionRow): void {
    // ready Compaction は rebase trigger と future Run snapshot の latest seam に使います。
    this.compactions.set(row.compactionId, row);
  }

  addEvent(row: AgentEventRow): void {
    // trigger Event は Run snapshot の Event 範囲を固定するために保存します。
    this.events.set(row.eventId, row);
  }

  addHistory(row: AgentHistoryIndexRow): void {
    // History index は rebase provenance が詳細履歴へ戻れることを検証するために保持します。
    this.histories.set(row.historyId, row);
  }

  addMemoryItem(row: AgentThreadMemoryItemRow): void {
    // Memory item は memoryId と itemId の組で保持し、旧版と新版の lineage を同時に確認します。
    this.memoryItems.set(createMemoryItemKey(row.memoryId, row.memoryItemId), row);
  }

  addMemoryVersion(row: AgentThreadMemoryVersionRow): void {
    // Memory version は active/superseded 遷移と Run snapshot selection を確認するために保持します。
    this.memoryVersions.set(row.memoryId, row);
  }

  historyCount(): number {
    return this.histories.size;
  }

  memoryItem(memoryId: string, memoryItemId: string): AgentThreadMemoryItemRow | undefined {
    return this.memoryItems.get(createMemoryItemKey(memoryId, memoryItemId));
  }

  memoryVersion(memoryId: string): AgentThreadMemoryVersionRow | undefined {
    return this.memoryVersions.get(memoryId);
  }

  private createRepositories(): AgentStorageRepositories {
    let repositories = undefined as unknown as AgentStorageRepositories;
    repositories = {
      compactions: {
        findLatestReadyCompaction: (targetThreadId: string) =>
          [...this.compactions.values()]
            .filter(
              (compaction) =>
                compaction.threadId === targetThreadId && compaction.status === 'ready'
            )
            .sort((left, right) => right.compactionOrdinal - left.compactionOrdinal)[0],
        getNextCompactionOrdinal: (targetThreadId: string) =>
          Math.max(
            0,
            ...[...this.compactions.values()]
              .filter((compaction) => compaction.threadId === targetThreadId)
              .map((compaction) => compaction.compactionOrdinal)
          ) + 1,
      },
      config: {
        getLatestConfig: () => createConfig(),
      },
      events: {
        findByEventId: (eventId: string) => this.events.get(eventId),
        findLatestForThread: (targetThreadId: string) =>
          [...this.events.values()]
            .filter((event) => event.threadId === targetThreadId)
            .sort((left, right) => right.threadSequence - left.threadSequence)[0],
      },
      history: {
        searchHistoryIndexes: (input: { readonly limit: number; readonly threadId: string }) =>
          [...this.histories.values()]
            .filter((history) => history.threadId === input.threadId)
            .sort((left, right) => left.createdAtMs - right.createdAtMs)
            .slice(0, input.limit),
      },
      memory: {
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
        findActiveThreadMemoryVersion: (targetThreadId: string) =>
          [...this.memoryVersions.values()]
            .filter((version) => version.threadId === targetThreadId && version.status === 'active')
            .sort((left, right) => right.version - left.version)[0],
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
        listThreadMemoryItems: (targetThreadId: string, memoryId: string) =>
          [...this.memoryItems.values()].filter(
            (item) => item.threadId === targetThreadId && item.memoryId === memoryId
          ),
        updateThreadMemoryVersionStatus: (input: UpdateAgentThreadMemoryVersionStatusInput) => {
          const current = this.memoryVersions.get(input.memoryId);
          if (current === undefined) throw new Error('Memory version missing in test harness.');
          const updated = { ...current, status: input.status, updatedAtMs: input.updatedAtMs };
          this.addMemoryVersion(updated);
          return updated;
        },
      },
      pendingRuns: {
        createRunInputSnapshot: (snapshot: AgentRunInputSnapshotRow) => {
          this.snapshots.set(snapshot.runId, snapshot);
          return snapshot;
        },
        findLatestRunInputSnapshotForThread: () => undefined,
        findRunInputSnapshot: (runId: string) => this.snapshots.get(runId),
      },
      transaction: <Result>(
        operation: (transactionRepositories: AgentStorageRepositories) => Result
      ) => operation(repositories),
    } as unknown as AgentStorageRepositories;
    return repositories;
  }
}

interface CreateMemoryItemInput {
  readonly contentText: string;
  readonly invalidatesItemId?: string;
  readonly memoryItemId: string;
  readonly status: string;
  readonly supersedesItemId?: string;
}

interface RebaseProvenancePayload {
  readonly priorMemoryId: string;
  readonly priorVersion: number;
  readonly requestProvenanceRef: string | null;
  readonly retainedHistoryRefs: readonly { readonly historyRef: string }[];
  readonly schema: string;
  readonly triggerReasons: readonly string[];
}

function createReadyCompaction(
  compactionId: string,
  compactionOrdinal: number,
  outputRef: string
): AgentThreadCompactionRow {
  return {
    archiveRef: null,
    completedAtMs: nowMs - 10_000 + compactionOrdinal,
    compactionId,
    compactionOrdinal,
    createdAtMs: nowMs - 20_000 + compactionOrdinal,
    digestSha256: `digest-${compactionId}`,
    endThreadSequence: compactionOrdinal * 10,
    errorCode: null,
    errorMessage: null,
    handoffRef: `handoff://${compactionId}`,
    historyRef: `history://history-${String(compactionOrdinal)}`,
    memoryDeltaRef: `memory-delta://${compactionId}`,
    outputRef,
    provenanceRef: `provenance://${compactionId}`,
    r2ObjectRef: null,
    sectionId: `section-${String(compactionOrdinal)}`,
    sectionOrdinal: compactionOrdinal,
    startedAtMs: nowMs - 15_000 + compactionOrdinal,
    startThreadSequence: (compactionOrdinal - 1) * 10 + 1,
    status: 'ready',
    threadId,
    updatedAtMs: nowMs - 10_000 + compactionOrdinal,
  };
}

function createHistory(
  historyId: string,
  order: number,
  compactionId: string
): AgentHistoryIndexRow {
  return {
    bodyByteSize: 512,
    bodyContentType: 'application/json',
    bodyRef: `history-body://${historyId}`,
    bodySha256: `history-digest-${historyId}`,
    bodyStorageClass: 'inline',
    compactionId,
    createdAtMs: nowMs - 5_000 + order,
    endThreadSequence: order * 10,
    historyId,
    historyRef: `history://${historyId}`,
    provenanceRef: `history-provenance://${historyId}`,
    queryText: `history query ${String(order)}`,
    retentionStatus: 'active',
    sectionId: `section-${String(order)}`,
    startThreadSequence: (order - 1) * 10 + 1,
    summary: `history summary ${String(order)}`,
    threadId,
  };
}

function createMemoryVersion(): AgentThreadMemoryVersionRow {
  return {
    createdAtMs: nowMs - 1_000,
    itemCount: 4,
    latestCompactionId: 'compaction-3',
    memoryId: 'memory-v3',
    memoryRef: 'thread-memory://thread-rebase/v3',
    provenanceRef: 'compaction:compaction-3/memory-delta',
    rebaseStatus: null,
    snapshotRef: 'memory-delta://compaction-3',
    status: 'active',
    threadId,
    updatedAtMs: nowMs - 1_000,
    version: 3,
  };
}

function createMemoryItem(input: CreateMemoryItemInput): AgentThreadMemoryItemRow {
  return {
    contentRef: null,
    contentSha256: null,
    contentText: input.contentText,
    createdAtMs: nowMs - 1_000,
    invalidatesItemId: input.invalidatesItemId ?? null,
    memoryId: 'memory-v3',
    memoryItemId: input.memoryItemId,
    provenanceRef: `history:${input.memoryItemId}`,
    sourceCompactionId: 'compaction-3',
    sourceEventId: null,
    sourceHistoryId: 'history-2',
    status: input.status,
    supersedesItemId: input.supersedesItemId ?? null,
    threadId,
    updatedAtMs: nowMs - 1_000,
  };
}

function createEvent(eventId: string, threadSequence: number): AgentEventRow {
  return {
    agentSequence: threadSequence,
    causationId: null,
    correlationId: null,
    createdAtMs: nowMs,
    eventId,
    eventType: 'test.memory-rebase-run',
    idempotencyKey: `idem-${eventId}`,
    normalizedThreadKey: threadId,
    occurredAtMs: nowMs,
    payloadByteSize: null,
    payloadContentType: null,
    payloadInlineBase64: null,
    payloadRef: null,
    payloadSha256: null,
    payloadStorageClass: null,
    requestDigest: null,
    runId: null,
    sectionId: 'section-open',
    source: 'test',
    threadId,
    threadKey: threadId,
    threadSequence,
  };
}

function createRun(runId: string, triggerEventId: string): AgentRunRow {
  return {
    createdAtMs: nowMs,
    lastServedAtMs: null,
    pendingSinceMs: nowMs,
    priority: 0,
    runId,
    status: 'pending',
    threadId,
    triggerEventId,
    updatedAtMs: nowMs,
  };
}

function createConfig(): AgentConfigRow {
  return {
    budgetPolicyRef: null,
    configBodyRef: null,
    configVersion: 4,
    displayName: null,
    memoryPolicyRef: null,
    modelPolicyRef: null,
    schedulePolicyRef: null,
    toolPolicyRef: null,
    updatedAtMs: nowMs,
    updatedByPrincipalId: null,
  };
}

function readRequiredResultVersion(
  version: AgentThreadMemoryVersionRow | undefined
): AgentThreadMemoryVersionRow {
  if (version === undefined) throw new Error('Expected Memory rebase to create a version.');
  return version;
}

function parseRebaseProvenance(value: string | null): RebaseProvenancePayload {
  if (value === null) throw new Error('Expected rebase provenance ref.');
  const parsed: unknown = JSON.parse(value);
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new TypeError('Rebase provenance must be a JSON object.');
  }
  return parsed as RebaseProvenancePayload;
}

function createMemoryItemKey(memoryId: string, memoryItemId: string): string {
  return `${memoryId}#${memoryItemId}`;
}
