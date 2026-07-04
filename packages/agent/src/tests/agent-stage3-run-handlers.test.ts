import { describe, expect, it } from 'vitest';

import { guardHarnessRunResultCommit } from '../harness';
import { cancelRunInStore, getRunFromStore, listRunsFromStore } from '../runs';

import type { AgentCoreRequestContext } from '../domain';
import type {
  AgentAuditRepository,
  AgentConfigRow,
  AgentEventRow,
  AgentGrantRow,
  AgentIdempotencyRecordRow,
  AgentProfileRow,
  AgentRunBudgetLedgerRow,
  AgentRunInputSnapshotRow,
  AgentRunInterruptRow,
  AgentRunRow,
  AgentStorageRepositories,
  AgentThreadRow,
} from '../storage';

const agentId = 'agent-alpha';
const principalId = 'principal-1';

describe('Agent Stage 3 Run query and cancel handlers', () => {
  it('[AGENT-RUNTIME-S009] GetRun and ListRuns expose immutable Agent-scoped snapshots', async () => {
    const runtime = createRunHandlerRuntime();

    const completed = await getRunFromStore({
      agentId,
      query: { context: createContext('GetRun'), runId: 'run-completed' },
      repositories: runtime.repositories,
    });

    expect(completed.run).toMatchObject({
      agentId,
      configVersion: 7,
      runId: 'run-completed',
      runInputId: 'run-input:run-completed',
      sectionId: 'section-a',
      snapshotRef: 'snapshot://run-completed',
      status: 'completed',
      threadId: 'thread-a',
      triggerEventId: 'event-completed',
    });
    expect(completed.input).toMatchObject({
      configVersion: 7,
      latestReadyCompactionId: 'compaction://ready-a',
      triggerEndThreadSequence: 2,
      triggerStartThreadSequence: 1,
      uncompactedUpperThreadSequence: 2,
    });
    expect(completed.snapshot).toMatchObject({
      agentId,
      runId: 'run-completed',
      snapshotRef: 'snapshot://run-completed',
      threadId: 'thread-a',
    });
    expect(completed.snapshot?.digestSha256).toMatch(/^[\da-f]{64}$/);

    const failed = await getRunFromStore({
      agentId,
      query: { context: createContext('GetRun'), runId: 'run-failed' },
      repositories: runtime.repositories,
    });
    expect(failed.run.safeError).toMatchObject({
      code: 'failed_precondition',
      domainReason: 'tokens',
      message: 'tokens budget exceeded',
      retryable: false,
    });

    const listed = listRunsFromStore({
      agentId,
      query: {
        context: createContext('ListRuns'),
        endMs: 150,
        pageCursorScope: 'agent-alpha:runs:thread=thread-a:status=completed:start=100:end=150',
        pageSize: 1,
        startMs: 100,
        status: 'completed',
        threadId: 'thread-a',
      },
      repositories: runtime.repositories,
    });
    expect(listed.runs.map((run) => run.runId)).toEqual(['run-completed']);
    expect(listed.page).toMatchObject({
      cursorScope: 'agent-alpha:runs:thread=thread-a:status=completed:start=100:end=150',
      nextPageToken: '100:run-completed',
      resultCount: 1,
    });

    const secondPage = listRunsFromStore({
      agentId,
      query: {
        context: createContext('ListRuns'),
        endMs: 150,
        pageCursorScope: listed.page.cursorScope,
        pageSize: 1,
        pageToken: listed.page.nextPageToken,
        startMs: 100,
        status: 'completed',
        threadId: 'thread-a',
      },
      repositories: runtime.repositories,
    });
    expect(secondPage.runs.map((run) => run.runId)).toEqual(['run-completed-b']);
    expect(secondPage.page.nextPageToken).toBeUndefined();
    expect(JSON.stringify(listed)).not.toContain('agent-beta');

    expect(() =>
      listRunsFromStore({
        agentId,
        query: {
          context: createContext('ListRuns'),
          pageCursorScope: 'agent-beta:runs',
        },
        repositories: runtime.repositories,
      })
    ).toThrow(/Pagination cursor/);
  });

  it('[AGENT-RUNTIME-S010] CancelRun idempotently interrupts work and blocks stale commits', () => {
    const runtime = createRunHandlerRuntime();
    const first = cancelRunInStore({
      agentId,
      command: {
        context: createContext('CancelRun', 'cancel-1', 'digest-cancel-1'),
        reason: 'operator requested stop',
        runId: 'run-running',
      },
      repositories: runtime.repositories,
    });

    expect(first).toMatchObject({
      replayed: false,
      run: {
        interruptReason: 'operator requested stop',
        safeError: { code: 'aborted', domainReason: 'user_cancel' },
        status: 'interrupted',
      },
    });
    expect(runtime.interrupts).toHaveLength(1);
    expect(runtime.audits).toHaveLength(1);

    const stale = guardHarnessRunResultCommit({
      currentCapabilityGeneration: { integrationVersion: 3, toolSetVersion: 2 },
      expected: {
        configVersion: 7,
        integrationVersion: 3,
        snapshotRef: 'snapshot://run-running',
        toolSetVersion: 2,
      },
      nowMs: 260,
      repositories: runtime.repositories,
      runId: 'run-running',
    });
    expect(stale).toMatchObject({
      allowed: false,
      reason: 'user_cancel',
      staleResultDiscarded: true,
    });

    const replay = cancelRunInStore({
      agentId,
      command: {
        context: createContext('CancelRun', 'cancel-1', 'digest-cancel-1'),
        reason: 'operator requested stop',
        runId: 'run-running',
      },
      repositories: runtime.repositories,
    });
    expect(replay.replayed).toBe(true);
    expect(runtime.interrupts).toHaveLength(1);
    expect(runtime.audits).toHaveLength(1);

    expect(() =>
      cancelRunInStore({
        agentId,
        command: {
          context: createContext('CancelRun', 'cancel-1', 'digest-conflict'),
          reason: 'changed reason',
          runId: 'run-running',
        },
        repositories: runtime.repositories,
      })
    ).toThrow(/different request digest/);

    const pending = cancelRunInStore({
      agentId,
      command: {
        context: createContext('CancelRun', 'cancel-pending', 'digest-pending'),
        runId: 'run-pending',
      },
      repositories: runtime.repositories,
    });
    expect(pending.run).toMatchObject({
      safeError: { code: 'cancelled', domainReason: 'user_cancel' },
      status: 'cancelled',
    });

    const waiting = cancelRunInStore({
      agentId,
      command: {
        context: createContext('CancelRun', 'cancel-waiting', 'digest-waiting'),
        runId: 'run-waiting',
      },
      repositories: runtime.repositories,
    });
    expect(waiting.run).toMatchObject({
      safeError: { code: 'aborted', domainReason: 'user_cancel' },
      status: 'interrupted',
    });

    const terminal = cancelRunInStore({
      agentId,
      command: {
        context: createContext('CancelRun', 'cancel-terminal', 'digest-terminal'),
        runId: 'run-completed',
      },
      repositories: runtime.repositories,
    });
    expect(terminal.run.status).toBe('completed');
    expect(terminal.audit?.result).toContain('terminal_precondition');
  });
});

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function createContext(
  method: string,
  idempotencyKey?: string,
  digestHex = `${method}-digest`
): AgentCoreRequestContext {
  return {
    agentId,
    bodyDigest: { algorithm: 'sha-256', byteLength: 10, digestHex },
    correlationId: `corr-${method}`,
    idempotencyKey,
    method,
    principal: {
      agentId,
      principalId,
      principalType: 'CLIENT_SERVICE',
      scopes: ['agent.rpc', 'agent.read', 'agent.run'],
    },
    requestedAtMs: 250,
    service: 'cftamac.agent.v1.AgentRunService',
  };
}

function createRunHandlerRuntime() {
  const runs = createRunRows();
  const snapshots = createSnapshotRows();
  const events = createEventRows();
  const interrupts: Mutable<AgentRunInterruptRow>[] = [];
  const budgets = createBudgetRows();
  const audits: Parameters<AgentAuditRepository['insertAuditEvent']>[0][] = [];
  const idempotencyRecords = new Map<string, AgentIdempotencyRecordRow>();
  let repositories = undefined as unknown as AgentStorageRepositories;
  repositories = {
    audit: {
      insertAuditEvent(input: Parameters<AgentAuditRepository['insertAuditEvent']>[0]) {
        audits.push(input);
      },
      tableName: 'agent_audit_events',
    },
    config: { getLatestConfig: () => createConfig(), tableName: 'agent_config_versions' },
    credentials: { findCredential: () => undefined, tableName: 'agent_credentials' },
    events: createEventsRepository(events),
    grants: { listGrantsForPrincipal: () => createGrantRows(), tableName: 'agent_grants' },
    idempotency: createIdempotencyRepository(idempotencyRecords),
    modelInvocations: {
      findLatestForRun: () => undefined,
      tableName: 'agent_model_invocations',
    },
    pendingRuns: createRunsRepository(runs, snapshots),
    profile: { getProfile: () => createProfile(), tableName: 'agent_profile' },
    requestNonces: {
      reserveNonce: () => ({ status: 'reserved' as const }),
      tableName: 'agent_request_nonces',
    },
    runtime: createRuntimeRepository(interrupts, budgets),
    threads: createThreadsRepository(),
    transaction<T>(operation: (repositories: AgentStorageRepositories) => T): T {
      return operation(repositories);
    },
  } as unknown as AgentStorageRepositories;
  return { audits, interrupts, repositories, runs };
}

function createRunRows(): Mutable<AgentRunRow>[] {
  return [
    createRun('run-completed', 'thread-a', 'event-completed', 'completed', 100),
    createRun('run-completed-b', 'thread-a', 'event-completed-b', 'completed', 100),
    createRun('run-running', 'thread-a', 'event-running', 'running', 200),
    createRun('run-failed', 'thread-b', 'event-failed', 'failed', 300),
    createRun('run-pending', 'thread-b', 'event-pending', 'pending', 400),
    createRun('run-waiting', 'thread-b', 'event-waiting', 'waiting', 500),
  ];
}

function createRun(
  runId: string,
  threadId: string,
  triggerEventId: string,
  status: string,
  createdAtMs: number
): Mutable<AgentRunRow> {
  return {
    createdAtMs,
    lastServedAtMs: status === 'pending' ? null : createdAtMs + 1,
    pendingSinceMs: createdAtMs,
    priority: 0,
    runId,
    status,
    threadId,
    triggerEventId,
    updatedAtMs: createdAtMs + 2,
  };
}

function createSnapshotRows(): AgentRunInputSnapshotRow[] {
  return [
    createSnapshot('run-completed', 'thread-a', 'event-completed', 1, 2),
    createSnapshot('run-completed-b', 'thread-a', 'event-completed-b', 3, 3),
    createSnapshot('run-running', 'thread-a', 'event-running', 4, 4),
    createSnapshot('run-failed', 'thread-b', 'event-failed', 1, 1),
    createSnapshot('run-pending', 'thread-b', 'event-pending', 2, 2),
    createSnapshot('run-waiting', 'thread-b', 'event-waiting', 3, 3),
  ];
}

function createSnapshot(
  runId: string,
  threadId: string,
  triggerEventId: string,
  start: number,
  end: number
): AgentRunInputSnapshotRow {
  return {
    configVersion: 7,
    createdAtMs: start * 100,
    integrationVersion: 3,
    latestReadyCompactionRef: threadId === 'thread-a' ? 'compaction://ready-a' : null,
    runId,
    snapshotRef: `snapshot://${runId}`,
    threadId,
    threadMemoryRef: `thread-memory://${threadId}/v7`,
    threadMemoryVersion: 7,
    toolSetVersion: 2,
    triggerEventEndSequence: end,
    triggerEventId,
    triggerEventStartSequence: start,
    uncompactedUpperSequence: end,
  };
}

function createEventRows(): AgentEventRow[] {
  return [
    createEvent('event-completed', 'thread-a', 'section-a', 2),
    createEvent('event-completed-b', 'thread-a', 'section-a', 3),
    createEvent('event-running', 'thread-a', 'section-a', 4),
    createEvent('event-failed', 'thread-b', 'section-b', 1),
    createEvent('event-pending', 'thread-b', 'section-b', 2),
    createEvent('event-waiting', 'thread-b', 'section-b', 3),
  ];
}

function createEvent(
  eventId: string,
  threadId: string,
  sectionId: string,
  threadSequence: number
): AgentEventRow {
  return {
    agentSequence: threadSequence,
    causationId: `cause-${eventId}`,
    correlationId: `corr-${eventId}`,
    createdAtMs: threadSequence * 100,
    eventId,
    eventType: 'test.event',
    idempotencyKey: `idem-${eventId}`,
    normalizedThreadKey: threadId,
    occurredAtMs: threadSequence * 100,
    payloadByteSize: null,
    payloadContentType: null,
    payloadInlineBase64: null,
    payloadRef: null,
    payloadSha256: null,
    payloadStorageClass: null,
    requestDigest: 'digest',
    runId: eventId.replace('event', 'run'),
    sectionId,
    source: 'test',
    threadId,
    threadKey: threadId,
    threadSequence,
  };
}

function createEventsRepository(events: readonly AgentEventRow[]) {
  return {
    findByEventId: (eventId: string) => events.find((event) => event.eventId === eventId),
    tableName: 'agent_events',
  };
}

function createRunsRepository(
  runs: Mutable<AgentRunRow>[],
  snapshots: readonly AgentRunInputSnapshotRow[]
) {
  return {
    findRunById: (runId: string) => runs.find((run) => run.runId === runId),
    findRunInputSnapshot: (runId: string) => snapshots.find((snapshot) => snapshot.runId === runId),
    listRuns(input: {
      readonly afterCreatedAtMs?: number;
      readonly afterRunId?: string;
      readonly endCreatedAtMs?: number;
      readonly limit: number;
      readonly startCreatedAtMs?: number;
      readonly status?: string;
      readonly threadId?: string;
    }) {
      return runs
        .filter((run) => isRunAfterCursor(run, input.afterCreatedAtMs, input.afterRunId))
        .filter((run) => input.threadId === undefined || run.threadId === input.threadId)
        .filter((run) => input.status === undefined || run.status === input.status)
        .filter((run) => run.createdAtMs >= (input.startCreatedAtMs ?? 0))
        .filter((run) => run.createdAtMs <= (input.endCreatedAtMs ?? Number.MAX_SAFE_INTEGER))
        .sort((left, right) => left.createdAtMs - right.createdAtMs)
        .slice(0, input.limit);
    },
    transitionRunStatus(input: {
      readonly fromStatus?: string;
      readonly nowMs: number;
      readonly runId: string;
      readonly toStatus: string;
    }) {
      const run = runs.find((candidate) => candidate.runId === input.runId);
      if (run === undefined) return;
      if (input.fromStatus !== undefined && run.status !== input.fromStatus) return;
      run.status = input.toStatus;
      run.updatedAtMs = input.nowMs;
    },
  };
}

function createRuntimeRepository(
  interrupts: Mutable<AgentRunInterruptRow>[],
  budgets: readonly AgentRunBudgetLedgerRow[]
) {
  return {
    findLatestRunInterrupt(runId: string) {
      return interrupts
        .filter((interrupt) => interrupt.runId === runId)
        .sort((left, right) => right.createdAtMs - left.createdAtMs)[0];
    },
    listBudgetLedgerEntries: (runId: string) => budgets.filter((budget) => budget.runId === runId),
    recordRunInterrupt(input: AgentRunInterruptRow) {
      const row = { ...input };
      interrupts.push(row);
      return row;
    },
  };
}

function isRunAfterCursor(
  run: AgentRunRow,
  afterCreatedAtMs: number | undefined,
  afterRunId: string | undefined
): boolean {
  if (afterCreatedAtMs === undefined) return true;
  return (
    run.createdAtMs > afterCreatedAtMs ||
    (run.createdAtMs === afterCreatedAtMs && run.runId > (afterRunId ?? ''))
  );
}

function createIdempotencyRepository(records: Map<string, AgentIdempotencyRecordRow>) {
  return {
    findRecord: (_principalId: string, idempotencyKey: string) => records.get(idempotencyKey),
    insertRecord(input: AgentIdempotencyRecordRow) {
      records.set(input.idempotencyKey, input);
    },
    tableName: 'agent_idempotency_records',
  };
}

function createThreadsRepository() {
  const threads: readonly AgentThreadRow[] = [createThread('thread-a'), createThread('thread-b')];
  return {
    findByThreadId: (threadId: string) => threads.find((thread) => thread.threadId === threadId),
    tableName: 'agent_threads',
  };
}

function createThread(threadId: string): AgentThreadRow {
  return {
    createdAtMs: 1,
    currentSectionId: `section-${threadId}`,
    lastServedAtMs: null,
    normalizedThreadKey: threadId,
    priority: 0,
    status: 'active',
    threadId,
    threadKey: threadId,
    updatedAtMs: 1,
  };
}

function createBudgetRows(): AgentRunBudgetLedgerRow[] {
  return [
    {
      budgetDimension: 'tokens',
      budgetRecordId: 'budget-run-failed',
      budgetScope: 'run',
      createdAtMs: 305,
      limitValue: 100,
      reason: 'tokens budget exceeded',
      runId: 'run-failed',
      status: 'blocked',
      usedValue: 101,
    },
  ];
}

function createConfig(): AgentConfigRow {
  return {
    budgetPolicyRef: null,
    configBodyRef: null,
    configVersion: 7,
    displayName: null,
    memoryPolicyRef: null,
    modelPolicyRef: null,
    schedulePolicyRef: null,
    toolPolicyRef: null,
    updatedAtMs: 1,
    updatedByPrincipalId: null,
  };
}

function createProfile(): AgentProfileRow {
  return {
    agentId,
    configVersion: 7,
    createdAtMs: 1,
    credentialGeneration: 1,
    displayName: null,
    lifecycleStatus: 'active',
    systemThreadId: 'thread-system',
    updatedAtMs: 1,
  };
}

function createGrantRows(): AgentGrantRow[] {
  return ['agent.rpc', 'agent.read', 'agent.run'].map((capability, index) => ({
    capability,
    createdAtMs: index,
    grantId: `${principalId}:${capability}`,
    principalId,
    scopeRef: null,
    status: 'active',
    updatedAtMs: index,
  }));
}
