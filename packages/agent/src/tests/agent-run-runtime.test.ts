import { describe, expect, it } from 'vitest';

import {
  assertAgentRunStatusTransition,
  canTransitionAgentRunStatus,
  compareAgentRunsForScheduling,
  hasReleasedActiveRunSlot,
  isActiveRunStatus,
  isTerminalRunStatus,
  processAgentRunSchedulerBatch,
  runStatuses,
} from '../runs';

import type {
  AgentConfigRow,
  AgentEventRow,
  AgentProfileRow,
  AgentRunInputSnapshotRow,
  AgentRunRow,
  AgentSchedulerWakeStateRow,
  AgentStorageRepositories,
  AgentThreadRow,
} from '../storage';

const agentId = 'agent-alpha';

describe('Agent Stage 3 Run runtime core', () => {
  it('[AGENT-RUNTIME-S002] AgentRun state machine validates active slot release transitions', () => {
    expect(runStatuses).toEqual([
      'pending',
      'running',
      'waiting',
      'completed',
      'failed',
      'cancelled',
      'interrupted',
    ]);
    expect(canTransitionAgentRunStatus({ from: 'pending', to: 'running' })).toBe(true);
    expect(canTransitionAgentRunStatus({ from: 'pending', to: 'cancelled' })).toBe(true);
    expect(canTransitionAgentRunStatus({ from: 'running', to: 'waiting' })).toBe(true);
    expect(canTransitionAgentRunStatus({ from: 'waiting', to: 'running' })).toBe(true);
    expect(canTransitionAgentRunStatus({ from: 'running', to: 'completed' })).toBe(true);
    expect(canTransitionAgentRunStatus({ from: 'running', to: 'failed' })).toBe(true);
    expect(canTransitionAgentRunStatus({ from: 'running', to: 'interrupted' })).toBe(true);
    expect(canTransitionAgentRunStatus({ from: 'completed', to: 'running' })).toBe(false);
    expect(() => {
      assertAgentRunStatusTransition({ from: 'pending', to: 'completed' });
    }).toThrow(/Invalid AgentRun transition/);
    expect(isActiveRunStatus('running')).toBe(true);
    expect(isActiveRunStatus('waiting')).toBe(false);
    expect(hasReleasedActiveRunSlot('waiting')).toBe(true);
    expect(isTerminalRunStatus('cancelled')).toBe(true);
    expect(isTerminalRunStatus('interrupted')).toBe(true);
  });

  it('[AGENT-RUNTIME-S003] Scheduler selects by priority last served time and pending time', () => {
    const ordered = [
      createRun('run-low-old', 'thread-a', 'event-a', 'pending', 1, 10, null),
      createRun('run-high-new', 'thread-b', 'event-b', 'pending', 3, 30, 500),
      createRun('run-high-old-served', 'thread-c', 'event-c', 'pending', 3, 20, 100),
      createRun('run-high-old-pending', 'thread-d', 'event-d', 'pending', 3, 10, 100),
    ].sort(compareAgentRunsForScheduling);

    expect(ordered.map((run) => run.runId)).toEqual([
      'run-high-old-pending',
      'run-high-old-served',
      'run-high-new',
      'run-low-old',
    ]);
  });

  it('[AGENT-RUNTIME-S001] [AGENT-RUNTIME-S003] processes a bounded batch and re-enqueues remaining work', () => {
    const runtime = createRuntimeHarness();
    runtime.addThread('thread-a', 1, null);
    runtime.addThread('thread-b', 5, 900);
    runtime.addEvent('event-a1', 'thread-a', 1);
    runtime.addEvent('event-b1', 'thread-b', 1);
    runtime.addRun(createRun('run-a1', 'thread-a', 'event-a1', 'pending', 1, 10, null));
    runtime.addRun(createRun('run-b1', 'thread-b', 'event-b1', 'pending', 5, 20, 900));

    const result = processAgentRunSchedulerBatch({
      agentId,
      maxRuns: 1,
      nowMs: 1_000,
      repositories: runtime.repositories,
    });

    expect(result).toMatchObject({
      pendingCount: 2,
      processedCount: 1,
      reenqueue: true,
      remainingPendingCount: 1,
      requestedMaxRuns: 1,
      status: 'processed',
    });
    expect(result.startedRuns[0]?.runId).toBe('run-b1');
    expect(runtime.findRun('run-b1')?.status).toBe('running');
    expect(runtime.findRun('run-a1')?.status).toBe('pending');
    expect(runtime.wake).toMatchObject({ pendingCount: 1, wakeStatus: 'pending' });
  });

  it('[AGENT-RUNTIME-S002] [AGENT-RUNTIME-S004] waits for slot release and keeps snapshots immutable', () => {
    const runtime = createRuntimeHarness();
    runtime.addThread('thread-a', 0, null);
    runtime.addEvent('event-a1', 'thread-a', 1);
    runtime.addRun(createRun('run-a1', 'thread-a', 'event-a1', 'pending', 0, 10, null));

    const first = processAgentRunSchedulerBatch({
      agentId,
      maxRuns: 2,
      nowMs: 100,
      repositories: runtime.repositories,
    });
    expect(first.startedRuns[0]?.snapshot).toMatchObject({
      configVersion: 4,
      integrationVersion: 0,
      latestReadyCompactionRef: null,
      threadMemoryRef: null,
      threadMemoryVersion: 0,
      toolSetVersion: 0,
      triggerEventEndSequence: 1,
      triggerEventStartSequence: 1,
      uncompactedUpperSequence: 1,
    });

    runtime.addEvent('event-a2', 'thread-a', 2);
    runtime.addRun(createRun('run-a2', 'thread-a', 'event-a2', 'pending', 0, 110, 100));
    const blocked = processAgentRunSchedulerBatch({
      agentId,
      maxRuns: 2,
      nowMs: 120,
      repositories: runtime.repositories,
    });
    expect(blocked).toMatchObject({
      activeRunId: 'run-a1',
      processedCount: 0,
      reenqueue: true,
      status: 'active_blocked',
    });
    expect(runtime.findRun('run-a2')?.status).toBe('pending');
    expect(runtime.findSnapshot('run-a1')).toMatchObject({ uncompactedUpperSequence: 1 });

    runtime.setRunStatus('run-a1', 'waiting');
    const second = processAgentRunSchedulerBatch({
      agentId,
      maxRuns: 2,
      nowMs: 130,
      repositories: runtime.repositories,
    });
    expect(second.startedRuns[0]?.runId).toBe('run-a2');
    expect(second.startedRuns[0]?.snapshot).toMatchObject({
      triggerEventEndSequence: 2,
      triggerEventStartSequence: 2,
      uncompactedUpperSequence: 2,
    });
    expect(runtime.findSnapshot('run-a1')).toMatchObject({ uncompactedUpperSequence: 1 });
  });

  it('[AGENT-RUNTIME-S005] keeps different Thread Events isolated until the active slot releases', () => {
    const runtime = createRuntimeHarness();
    runtime.addThread('thread-a', 1, null);
    runtime.addThread('thread-b', 1, null);
    runtime.addEvent('event-a1', 'thread-a', 1);
    runtime.addRun(createRun('run-a1', 'thread-a', 'event-a1', 'pending', 1, 10, null));

    const first = processAgentRunSchedulerBatch({
      agentId,
      maxRuns: 1,
      nowMs: 100,
      repositories: runtime.repositories,
    });
    expect(first.startedRuns[0]?.runId).toBe('run-a1');

    runtime.addEvent('event-b1', 'thread-b', 1);
    runtime.addRun(createRun('run-b1', 'thread-b', 'event-b1', 'pending', 1, 110, null));
    const blocked = processAgentRunSchedulerBatch({
      agentId,
      maxRuns: 1,
      nowMs: 120,
      repositories: runtime.repositories,
    });
    expect(blocked).toMatchObject({ activeRunId: 'run-a1', status: 'active_blocked' });
    expect(runtime.findSnapshot('run-a1')).toMatchObject({ threadId: 'thread-a' });
    expect(runtime.findRun('run-b1')?.status).toBe('pending');

    runtime.setRunStatus('run-a1', 'waiting');
    const next = processAgentRunSchedulerBatch({
      agentId,
      maxRuns: 1,
      nowMs: 130,
      repositories: runtime.repositories,
    });
    expect(next.startedRuns[0]).toMatchObject({ runId: 'run-b1', threadId: 'thread-b' });
    expect(next.startedRuns[0]?.snapshot).toMatchObject({
      threadId: 'thread-b',
      triggerEventId: 'event-b1',
      uncompactedUpperSequence: 1,
    });
  });
});

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function createRuntimeHarness() {
  const events: AgentEventRow[] = [];
  const runs: Mutable<AgentRunRow>[] = [];
  const snapshots: AgentRunInputSnapshotRow[] = [];
  const threads: Mutable<AgentThreadRow>[] = [];
  const wake: Mutable<AgentSchedulerWakeStateRow> = { pendingCount: 0, wakeStatus: 'idle' };
  const repositories = {
    compactions: {
      findLatestReadyCompaction: () => undefined,
    },
    config: { getLatestConfig: () => createConfig() },
    events: {
      findByEventId: (eventId: string) => events.find((event) => event.eventId === eventId),
      findLatestForThread(threadId: string) {
        return events
          .filter((event) => event.threadId === threadId)
          .sort((left, right) => right.threadSequence - left.threadSequence)[0];
      },
    },
    pendingRuns: {
      countPendingRuns: () => runs.filter((run) => run.status === 'pending').length,
      createRunInputSnapshot(input: AgentRunInputSnapshotRow) {
        const existing = snapshots.find((snapshot) => snapshot.runId === input.runId);
        if (existing !== undefined) return existing;
        snapshots.push(input);
        return input;
      },
      findActiveRun: () => runs.find((run) => run.status === 'running'),
      findLatestRunInputSnapshotForThread(threadId: string) {
        return snapshots
          .filter((snapshot) => snapshot.threadId === threadId)
          .sort((left, right) => right.createdAtMs - left.createdAtMs)[0];
      },
      findRunInputSnapshot: (runId: string) =>
        snapshots.find((snapshot) => snapshot.runId === runId),
      selectNextPendingRun() {
        return runs
          .filter((run) => run.status === 'pending')
          .sort(compareAgentRunsForScheduling)[0];
      },
      transitionRunStatus(input: {
        readonly fromStatus?: string;
        readonly lastServedAtMs?: number;
        readonly nowMs: number;
        readonly runId: string;
        readonly toStatus: string;
      }) {
        const run = runs.find((candidate) => candidate.runId === input.runId);
        if (
          run === undefined ||
          (input.fromStatus !== undefined && run.status !== input.fromStatus)
        )
          return;
        run.status = input.toStatus;
        run.updatedAtMs = input.nowMs;
        run.lastServedAtMs = input.lastServedAtMs ?? run.lastServedAtMs;
      },
    },
    memory: {
      findActiveThreadMemoryVersion: () => undefined,
    },
    profile: { getProfile: () => createProfile() },
    schedulerWakes: {
      markIdle() {
        wake.pendingCount = 0;
        wake.wakeStatus = 'idle';
      },
      markPending(_nowMs: number, pendingCount: number) {
        wake.pendingCount = pendingCount;
        wake.wakeStatus = 'pending';
      },
      markRunning() {
        wake.wakeStatus = 'running';
      },
    },
    threads: {
      markThreadServed(input: { readonly nowMs: number; readonly threadId: string }) {
        const thread = threads.find((candidate) => candidate.threadId === input.threadId);
        if (thread === undefined) return;
        thread.lastServedAtMs = input.nowMs;
        thread.updatedAtMs = input.nowMs;
      },
    },
  } as unknown as AgentStorageRepositories;
  return {
    addEvent(eventId: string, threadId: string, threadSequence: number) {
      events.push(createEvent(eventId, threadId, threadSequence));
    },
    addRun(run: AgentRunRow) {
      runs.push({ ...run });
    },
    addThread(threadId: string, priority: number, lastServedAtMs: number | null) {
      threads.push(createThread(threadId, priority, lastServedAtMs));
    },
    findRun: (runId: string) => runs.find((run) => run.runId === runId),
    findSnapshot: (runId: string) => snapshots.find((snapshot) => snapshot.runId === runId),
    repositories,
    setRunStatus(runId: string, status: string) {
      const run = runs.find((candidate) => candidate.runId === runId);
      if (run !== undefined) run.status = status;
    },
    wake,
  };
}

function createRun(
  runId: string,
  threadId: string,
  triggerEventId: string,
  status: string,
  priority: number,
  pendingSinceMs: number,
  lastServedAtMs: number | null
): AgentRunRow {
  return {
    createdAtMs: pendingSinceMs,
    lastServedAtMs,
    pendingSinceMs,
    priority,
    runId,
    status,
    threadId,
    triggerEventId,
    updatedAtMs: pendingSinceMs,
  };
}

function createEvent(eventId: string, threadId: string, threadSequence: number): AgentEventRow {
  return {
    agentSequence: threadSequence,
    causationId: null,
    correlationId: null,
    createdAtMs: threadSequence,
    eventId,
    eventType: 'test.event',
    idempotencyKey: `idem-${eventId}`,
    normalizedThreadKey: threadId,
    occurredAtMs: threadSequence,
    payloadByteSize: null,
    payloadContentType: null,
    payloadInlineBase64: null,
    payloadRef: null,
    payloadSha256: null,
    payloadStorageClass: null,
    requestDigest: null,
    runId: null,
    sectionId: `section-${threadId}`,
    source: 'test',
    threadId,
    threadKey: threadId,
    threadSequence,
  };
}

function createThread(
  threadId: string,
  priority: number,
  lastServedAtMs: number | null
): Mutable<AgentThreadRow> {
  return {
    createdAtMs: 1,
    currentSectionId: `section-${threadId}`,
    lastServedAtMs,
    normalizedThreadKey: threadId,
    priority,
    status: 'active',
    threadId,
    threadKey: threadId,
    updatedAtMs: 1,
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
    updatedAtMs: 1,
    updatedByPrincipalId: null,
  };
}

function createProfile(): AgentProfileRow {
  return {
    agentId,
    configVersion: 4,
    createdAtMs: 1,
    credentialGeneration: 1,
    displayName: null,
    lifecycleStatus: 'active',
    systemThreadId: null,
    updatedAtMs: 1,
  };
}
