import { describe, expect, it } from 'vitest';

import {
  beginThreadCompaction,
  canTransitionCompactionStatus,
  compactionStatuses,
  isTerminalCompactionStatus,
  isUnfinishedCompactionStatus,
  transitionThreadCompactionStatus,
} from '../compactions';

import type {
  AppendAgentEventInput,
  FreezeAgentSectionInput,
  AgentEventRow,
  AgentSectionRow,
  AgentStorageRepositories,
  AgentThreadCompactionRow,
  AgentThreadRow,
  InsertAgentSectionInput,
  InsertAgentThreadCompactionInput,
  InsertAgentThreadInput,
  ListAgentEventsInput,
  ListAgentThreadCompactionsInput,
  MarkAgentThreadServedInput,
  UpdateAgentThreadCompactionOutputInput,
  UpdateAgentThreadCompactionStatusInput,
  UpdateAgentThreadSectionInput,
} from '../storage';

const threadId = 'thread-alpha';
const nowMs = 1_700_000_000_000;
const readyDigest = 'a'.repeat(64);

describe('Agent Stage 4 Compaction state machine', () => {
  it('[AGENT-MEMORY-S001] Compaction freezes one Section and opens the next', () => {
    const harness = createCompactionHarnessWithOpenSection(25);

    const result = beginThreadCompaction({
      compactionId: 'compaction-1',
      nextSectionId: 'section-2',
      nowMs,
      provenanceRef: 'policy://compaction/default',
      repositories: harness.repositories,
      threadId,
    });

    expect(result.frozenSection).toMatchObject({
      endThreadSequence: 25,
      sectionId: 'section-1',
      sequence: 1,
      status: 'frozen',
    });
    expect(result.openSection).toMatchObject({
      sectionId: 'section-2',
      sequence: 2,
      startThreadSequence: 26,
      status: 'active',
    });
    expect(harness.thread?.currentSectionId).toBe('section-2');
    expect(result.compaction).toMatchObject({
      compactionId: 'compaction-1',
      compactionOrdinal: 1,
      endThreadSequence: 25,
      provenanceRef: 'policy://compaction/default',
      sectionId: 'section-1',
      sectionOrdinal: 1,
      startThreadSequence: 1,
      startedAtMs: nowMs,
      status: 'running',
      threadId,
    });
  });

  it('[AGENT-MEMORY-S002] Event arriving during compaction enters the open Section', () => {
    const harness = createCompactionHarnessWithOpenSection(25);
    const started = beginThreadCompaction({
      compactionId: 'compaction-1',
      nextSectionId: 'section-2',
      nowMs,
      repositories: harness.repositories,
      threadId,
    });

    const event = harness.appendEventToCurrentOpenSection('event-26', nowMs + 1);

    expect(started.compaction).toMatchObject({
      endThreadSequence: 25,
      sectionId: 'section-1',
      status: 'running',
    });
    expect(event).toMatchObject({
      eventId: 'event-26',
      sectionId: 'section-2',
      threadSequence: 26,
    });
    expect(harness.section('section-1')).toMatchObject({ eventCount: 25, status: 'frozen' });
    expect(harness.section('section-2')).toMatchObject({ eventCount: 1, status: 'active' });
  });

  it('handles pending running ready failed and cancelled Compaction outputs', () => {
    const pendingStartHarness = createCompactionHarnessWithOpenSection(1);
    const pendingStart = beginThreadCompaction({
      compactionId: 'compaction-start-pending',
      initialStatus: 'pending',
      nextSectionId: 'section-2',
      nowMs,
      provenanceRef: 'policy://compaction/pending-start',
      repositories: pendingStartHarness.repositories,
      threadId,
    });
    expect(pendingStart.compaction).toMatchObject({
      provenanceRef: 'policy://compaction/pending-start',
      startedAtMs: null,
      status: 'pending',
    });
    const startedLater = transitionThreadCompactionStatus({
      compactionId: 'compaction-start-pending',
      nowMs: nowMs + 5,
      repositories: pendingStartHarness.repositories,
      toStatus: 'running',
    });
    expect(startedLater).toMatchObject({
      provenanceRef: 'policy://compaction/pending-start',
      startedAtMs: nowMs + 5,
      status: 'running',
    });

    const harness = createCompactionHarnessWithOpenSection(1);
    harness.addCompaction(
      createCompactionRow(
        'compaction-pending',
        'pending',
        1,
        1,
        1,
        1,
        null,
        'policy://compaction/pending'
      )
    );
    harness.addCompaction(
      createCompactionRow(
        'compaction-running',
        'running',
        2,
        1,
        1,
        1,
        nowMs,
        'policy://compaction/running'
      )
    );
    harness.addCompaction(
      createCompactionRow(
        'compaction-cancel',
        'pending',
        3,
        1,
        1,
        1,
        null,
        'policy://compaction/cancel'
      )
    );

    expect(compactionStatuses).toEqual(['pending', 'running', 'ready', 'failed', 'cancelled']);
    expect(canTransitionCompactionStatus({ from: 'pending', to: 'running' })).toBe(true);
    expect(canTransitionCompactionStatus({ from: 'running', to: 'ready' })).toBe(true);
    expect(canTransitionCompactionStatus({ from: 'ready', to: 'failed' })).toBe(false);
    expect(isUnfinishedCompactionStatus('pending')).toBe(true);
    expect(isTerminalCompactionStatus('cancelled')).toBe(true);

    const running = transitionThreadCompactionStatus({
      compactionId: 'compaction-pending',
      nowMs: nowMs + 10,
      repositories: harness.repositories,
      toStatus: 'running',
    });
    expect(running).toMatchObject({ startedAtMs: nowMs + 10, status: 'running' });

    const ready = transitionThreadCompactionStatus({
      compactionId: 'compaction-pending',
      digestSha256: readyDigest,
      nowMs: nowMs + 20,
      outputRef: 'r2://agents/agent-alpha/compactions/compaction-pending/output.json',
      repositories: harness.repositories,
      toStatus: 'ready',
    });
    expect(ready).toMatchObject({
      completedAtMs: nowMs + 20,
      digestSha256: readyDigest,
      outputRef: 'r2://agents/agent-alpha/compactions/compaction-pending/output.json',
      provenanceRef: 'policy://compaction/pending',
      status: 'ready',
    });

    const failed = transitionThreadCompactionStatus({
      compactionId: 'compaction-running',
      errorCode: 'model_error',
      errorMessage: 'safe failure detail',
      nowMs: nowMs + 30,
      repositories: harness.repositories,
      toStatus: 'failed',
    });
    expect(failed).toMatchObject({
      completedAtMs: nowMs + 30,
      errorCode: 'model_error',
      errorMessage: 'safe failure detail',
      outputRef: null,
      provenanceRef: 'policy://compaction/running',
      status: 'failed',
    });

    const cancelled = transitionThreadCompactionStatus({
      compactionId: 'compaction-cancel',
      errorCode: 'operator_cancelled',
      nowMs: nowMs + 40,
      repositories: harness.repositories,
      toStatus: 'cancelled',
    });
    expect(cancelled).toMatchObject({
      completedAtMs: nowMs + 40,
      provenanceRef: 'policy://compaction/cancel',
      status: 'cancelled',
    });

    expect(harness.repositories.compactions.findLatestReadyCompaction(threadId)).toMatchObject({
      compactionId: 'compaction-pending',
      status: 'ready',
    });
    expect(() =>
      transitionThreadCompactionStatus({
        compactionId: 'compaction-running',
        digestSha256: readyDigest,
        nowMs: nowMs + 50,
        outputRef: 'r2://agents/agent-alpha/compactions/failed/output.json',
        repositories: harness.repositories,
        toStatus: 'ready',
      })
    ).toThrow(/Invalid Compaction transition/);
  });
});

function createCompactionHarnessWithOpenSection(eventCount: number): CompactionHarness {
  const harness = new CompactionHarness();
  harness.addThread({
    createdAtMs: nowMs - 1_000,
    currentSectionId: 'section-1',
    lastServedAtMs: null,
    normalizedThreadKey: 'customer:alpha',
    priority: 0,
    status: 'active',
    threadId,
    threadKey: 'customer:alpha',
    updatedAtMs: nowMs - 1_000,
  });
  harness.addSection({
    createdAtMs: nowMs - 900,
    endThreadSequence: null,
    eventCount,
    frozenAtMs: null,
    openedAtMs: nowMs - 900,
    sectionId: 'section-1',
    sequence: 1,
    startThreadSequence: 1,
    status: 'active',
    threadId,
  });
  for (let sequence = 1; sequence <= eventCount; sequence += 1) {
    harness.addEvent(
      createEventRow(`event-${String(sequence)}`, 'section-1', sequence, nowMs - 800 + sequence)
    );
  }
  return harness;
}

class CompactionHarness {
  private readonly compactions = new Map<string, AgentThreadCompactionRow>();
  private readonly events = new Map<string, AgentEventRow>();
  private readonly sections = new Map<string, AgentSectionRow>();
  private readonly threads = new Map<string, AgentThreadRow>();
  readonly repositories: AgentStorageRepositories;

  constructor() {
    this.repositories = this.createRepositories();
  }

  get thread(): AgentThreadRow | undefined {
    return this.threads.get(threadId);
  }

  addCompaction(row: AgentThreadCompactionRow): void {
    // Compaction repository が返す row と同じ形で保存し、状態遷移の副作用を観察できるようにします。
    this.compactions.set(row.compactionId, row);
  }

  addEvent(row: AgentEventRow): void {
    // Event index は threadSequence 順の latest 判定と Section 別確認に使います。
    this.events.set(row.eventId, row);
  }

  addSection(row: AgentSectionRow): void {
    // Section row は freeze/open transaction の対象として Thread-scoped に保存します。
    this.sections.set(row.sectionId, row);
  }

  addThread(row: AgentThreadRow): void {
    // Thread row は currentSectionId 更新の検証対象として保存します。
    this.threads.set(row.threadId, row);
  }

  appendEventToCurrentOpenSection(eventId: string, createdAtMs: number): AgentEventRow {
    // PublishEvent path と同じく open Section を解決し、新 Event を現在 Section へ割り当てます。
    const section = this.repositories.sections.findOpenSection(threadId);
    if (section === undefined) throw new Error('Open Section not found in test harness.');
    const sequences = this.repositories.events.getNextSequences(threadId);
    const event = createEventRow(eventId, section.sectionId, sequences.threadSequence, createdAtMs);
    this.repositories.events.appendEvent({
      createdAtMs,
      eventId,
      eventType: 'message.created',
      idempotencyKey: `idem-${eventId}`,
      normalizedThreadKey: 'customer:alpha',
      occurredAtMs: createdAtMs,
      sectionId: section.sectionId,
      sequences,
      source: 'client',
      threadId,
      threadKey: 'customer:alpha',
    });
    this.repositories.sections.incrementEventCount(threadId, section.sectionId);
    return event;
  }

  section(sectionId: string): AgentSectionRow | undefined {
    return this.sections.get(sectionId);
  }

  private createRepositories(): AgentStorageRepositories {
    let repositories = undefined as unknown as AgentStorageRepositories;
    repositories = {
      compactions: {
        findByCompactionId: (compactionId: string) => this.compactions.get(compactionId),
        findBySectionId: (targetThreadId: string, sectionId: string) =>
          [...this.compactions.values()].find(
            (row) => row.threadId === targetThreadId && row.sectionId === sectionId
          ),
        findLatestReadyCompaction: (targetThreadId: string) =>
          [...this.compactions.values()]
            .filter((row) => row.threadId === targetThreadId && row.status === 'ready')
            .sort(compareCompactionsByLatestReady)[0],
        getNextCompactionOrdinal: (targetThreadId: string) =>
          Math.max(
            0,
            ...[...this.compactions.values()]
              .filter((row) => row.threadId === targetThreadId)
              .map((row) => row.compactionOrdinal)
          ) + 1,
        insertCompaction: (input: InsertAgentThreadCompactionInput) => {
          const row = createCompactionRow(
            input.compactionId,
            input.status,
            input.compactionOrdinal,
            input.sectionOrdinal,
            input.startThreadSequence,
            input.endThreadSequence,
            input.startedAtMs ?? null,
            input.provenanceRef ?? null
          );
          this.addCompaction(row);
          return row;
        },
        listCompactions: (input: ListAgentThreadCompactionsInput) =>
          [...this.compactions.values()].filter(
            (row) =>
              row.threadId === input.threadId &&
              row.compactionOrdinal > (input.afterCompactionOrdinal ?? 0) &&
              (input.status === undefined || row.status === input.status)
          ),
        tableName: 'agent_thread_compactions',
        updateCompactionOutput: (input: UpdateAgentThreadCompactionOutputInput) => {
          const current = requireCompaction(this.compactions, input.compactionId);
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
        updateCompactionStatus: (input: UpdateAgentThreadCompactionStatusInput) => {
          const current = requireCompaction(this.compactions, input.compactionId);
          const updated: AgentThreadCompactionRow = {
            ...current,
            completedAtMs: input.completedAtMs ?? current.completedAtMs,
            startedAtMs: input.startedAtMs ?? current.startedAtMs,
            status: input.status,
            updatedAtMs: input.updatedAtMs,
          };
          this.addCompaction(updated);
          return updated;
        },
      },
      events: {
        appendEvent: (input: AppendAgentEventInput) => {
          this.addEvent(
            createEventRow(
              input.eventId,
              input.sectionId,
              input.sequences.threadSequence,
              input.createdAtMs
            )
          );
        },
        findByEventId: (eventId: string) => this.events.get(eventId),
        findByIdempotencyKey: () => undefined,
        findLatestForThread: (targetThreadId: string) =>
          [...this.events.values()]
            .filter((row) => row.threadId === targetThreadId)
            .sort((left, right) => right.threadSequence - left.threadSequence)[0],
        getNextSequences: (targetThreadId: string) => {
          const agentSequence =
            Math.max(0, ...[...this.events.values()].map((row) => row.agentSequence)) + 1;
          const threadSequence =
            Math.max(
              0,
              ...[...this.events.values()]
                .filter((row) => row.threadId === targetThreadId)
                .map((row) => row.threadSequence)
            ) + 1;
          return { agentSequence, threadSequence };
        },
        listEvents: (input: ListAgentEventsInput) =>
          [...this.events.values()].filter(
            (row) =>
              row.threadId === input.threadId &&
              row.threadSequence > (input.afterThreadSequence ?? 0) &&
              (input.sectionId === undefined || row.sectionId === input.sectionId)
          ),
        tableName: 'agent_events',
      },
      sections: {
        findBySectionId: (_targetThreadId: string, sectionId: string) =>
          this.sections.get(sectionId),
        findOpenSection: (targetThreadId: string) =>
          [...this.sections.values()]
            .filter((row) => row.threadId === targetThreadId && row.status === 'active')
            .sort((left, right) => left.sequence - right.sequence)[0],
        freezeSection: (input: FreezeAgentSectionInput) => {
          const current = this.sections.get(input.sectionId);
          if (current === undefined) throw new Error('Section not found in test harness.');
          this.addSection({
            ...current,
            endThreadSequence: input.endThreadSequence,
            frozenAtMs: input.frozenAtMs,
            status: 'frozen',
          });
        },
        incrementEventCount: (_targetThreadId: string, sectionId: string) => {
          const current = this.sections.get(sectionId);
          if (current === undefined) throw new Error('Section not found in test harness.');
          this.addSection({ ...current, eventCount: current.eventCount + 1 });
        },
        insertSection: (input: InsertAgentSectionInput) => {
          this.addSection({
            createdAtMs: input.createdAtMs,
            endThreadSequence: null,
            eventCount: 0,
            frozenAtMs: null,
            openedAtMs: input.createdAtMs,
            sectionId: input.sectionId,
            sequence: input.sequence,
            startThreadSequence: input.startThreadSequence ?? 1,
            status: input.status,
            threadId: input.threadId,
          });
        },
        listSections: (
          input: Parameters<AgentStorageRepositories['sections']['listSections']>[0]
        ) => [...this.sections.values()].filter((row) => row.threadId === input.threadId),
        tableName: 'agent_thread_sections',
      },
      threads: {
        findByNormalizedThreadKey: (normalizedThreadKey: string) =>
          [...this.threads.values()].find((row) => row.normalizedThreadKey === normalizedThreadKey),
        findByThreadId: (targetThreadId: string) => this.threads.get(targetThreadId),
        insertThread: (input: InsertAgentThreadInput) => {
          this.addThread({
            createdAtMs: input.nowMs,
            currentSectionId: input.currentSectionId ?? null,
            lastServedAtMs: null,
            normalizedThreadKey: input.normalizedThreadKey,
            priority: input.priority ?? 0,
            status: input.status ?? 'active',
            threadId: input.threadId,
            threadKey: input.threadKey,
            updatedAtMs: input.nowMs,
          });
        },
        listThreads: () => [...this.threads.values()],
        markThreadServed: (input: MarkAgentThreadServedInput) => {
          const current = this.threads.get(input.threadId);
          if (current === undefined) throw new Error('Thread not found in test harness.');
          this.addThread({ ...current, lastServedAtMs: input.nowMs, updatedAtMs: input.nowMs });
        },
        tableName: 'agent_threads',
        updateCurrentSection: (input: UpdateAgentThreadSectionInput) => {
          const current = this.threads.get(input.threadId);
          if (current === undefined) throw new Error('Thread not found in test harness.');
          this.addThread({
            ...current,
            currentSectionId: input.currentSectionId,
            updatedAtMs: input.nowMs,
          });
        },
      },
      transaction: <T>(operation: (repositories: AgentStorageRepositories) => T): T =>
        operation(repositories),
    } as unknown as AgentStorageRepositories;
    return repositories;
  }
}

function createCompactionRow(
  compactionId: string,
  status: string,
  compactionOrdinal: number,
  sectionOrdinal: number,
  startThreadSequence: number,
  endThreadSequence: number,
  startedAtMs: number | null = null,
  provenanceRef: string | null = null
): AgentThreadCompactionRow {
  return {
    archiveRef: null,
    completedAtMs: null,
    compactionId,
    compactionOrdinal,
    createdAtMs: nowMs,
    digestSha256: null,
    endThreadSequence,
    errorCode: null,
    errorMessage: null,
    handoffRef: null,
    historyRef: null,
    memoryDeltaRef: null,
    outputRef: null,
    provenanceRef,
    r2ObjectRef: null,
    sectionId: `section-${String(sectionOrdinal)}`,
    sectionOrdinal,
    startedAtMs,
    startThreadSequence,
    status,
    threadId,
    updatedAtMs: nowMs,
  };
}

function createEventRow(
  eventId: string,
  sectionId: string,
  sequence: number,
  createdAtMs: number
): AgentEventRow {
  return {
    agentSequence: sequence,
    causationId: null,
    correlationId: null,
    createdAtMs,
    eventId,
    eventType: 'message.created',
    idempotencyKey: `idem-${eventId}`,
    normalizedThreadKey: 'customer:alpha',
    occurredAtMs: createdAtMs,
    payloadByteSize: null,
    payloadContentType: null,
    payloadInlineBase64: null,
    payloadRef: null,
    payloadSha256: null,
    payloadStorageClass: null,
    requestDigest: null,
    runId: null,
    sectionId,
    source: 'client',
    threadId,
    threadKey: 'customer:alpha',
    threadSequence: sequence,
  };
}

function compareCompactionsByLatestReady(
  left: AgentThreadCompactionRow,
  right: AgentThreadCompactionRow
): number {
  const ordinalDiff = right.compactionOrdinal - left.compactionOrdinal;
  if (ordinalDiff !== 0) return ordinalDiff;
  return (right.completedAtMs ?? 0) - (left.completedAtMs ?? 0);
}

function requireCompaction(
  compactions: ReadonlyMap<string, AgentThreadCompactionRow>,
  compactionId: string
): AgentThreadCompactionRow {
  const row = compactions.get(compactionId);
  if (row === undefined) throw new Error('Compaction not found in test harness.');
  return row;
}
