import { describe, expect, it } from 'vitest';

import {
  assertAgentRunStatusTransition,
  canTransitionAgentRunStatus,
  compareAgentRunsForScheduling,
  executeStartedAgentRun,
  hasReleasedActiveRunSlot,
  isActiveRunStatus,
  isTerminalRunStatus,
  processAgentRunSchedulerBatch,
  runStatuses,
} from '../runs';

import type { HarnessDecision, ModelProvider, ModelProviderRequest } from '../harness';
import type {
  AgentConfigRow,
  AgentEventRow,
  AgentEventSequencePair,
  AgentHarnessDecisionRecordRow,
  AgentMemoryItemRow,
  AgentMemoryVersionRow,
  AgentModelInvocationRow,
  AgentModelPolicyRow,
  AgentProfileRow,
  AgentRunBudgetLedgerRow,
  AgentRunInputSnapshotRow,
  AgentRunRow,
  AgentScheduleRow,
  AgentSchedulerWakeStateRow,
  AgentStorageRepositories,
  AgentThreadRow,
  AgentThreadMemoryItemRow,
  AgentThreadMemoryVersionRow,
  AgentToolDefinitionRow,
  AgentToolInvocationRow,
  AppendAgentEventInput,
  CreateAgentMemoryVersionInput,
  CreateAgentThreadMemoryVersionInput,
  InsertAgentMemoryItemInput,
  InsertAgentScheduleInput,
  InsertAgentThreadMemoryItemInput,
  InsertAgentToolInvocationInput,
  UpdateAgentThreadMemoryVersionStatusInput,
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

  it('[AGENT-RUNTIME-S012] Run snapshots capture event_override and agent_default policy sources', () => {
    const overrideRuntime = createRuntimeHarness({ defaultModelPolicyRef: 'policy-default' });
    overrideRuntime.addThread('thread-a', 0, null);
    overrideRuntime.addEvent('event-override', 'thread-a', 1, {
      requestedModelPolicyRef: 'policy-fast',
    });
    overrideRuntime.addRun(
      createRun('run-override', 'thread-a', 'event-override', 'pending', 0, 10, null)
    );

    const overrideStarted = processAgentRunSchedulerBatch({
      agentId,
      maxRuns: 1,
      nowMs: 200,
      repositories: overrideRuntime.repositories,
    }).startedRuns[0]?.snapshot;

    const defaultRuntime = createRuntimeHarness({ defaultModelPolicyRef: 'policy-default' });
    defaultRuntime.addThread('thread-b', 0, null);
    defaultRuntime.addEvent('event-default', 'thread-b', 1);
    defaultRuntime.addRun(
      createRun('run-default', 'thread-b', 'event-default', 'pending', 0, 10, null)
    );

    const defaultStarted = processAgentRunSchedulerBatch({
      agentId,
      maxRuns: 1,
      nowMs: 200,
      repositories: defaultRuntime.repositories,
    }).startedRuns[0]?.snapshot;

    expect(overrideStarted).toMatchObject({
      generationMaxOutputTokens: 256,
      generationTemperature: '0.35',
      generationTopP: '0.75',
      modelPolicySource: 'event_override',
      requestedModelPolicyRef: 'policy-fast',
      resolvedModelPolicyDigest: 'f'.repeat(64),
      resolvedModelPolicyRef: 'policy-fast',
    });
    expect(defaultStarted).toMatchObject({
      modelPolicySource: 'agent_default',
      requestedModelPolicyRef: undefined,
      resolvedModelPolicyDigest: 'd'.repeat(64),
      resolvedModelPolicyRef: 'policy-default',
    });
  });

  it('[AGENT-RUNTIME-S011] Pending Run advances through model execution to terminal success', async () => {
    const runtime = createRuntimeHarness({ defaultModelPolicyRef: 'policy-default' });
    runtime.addThread('thread-model', 0, null);
    runtime.addEvent('event-model', 'thread-model', 1);
    runtime.addRun(createRun('run-model', 'thread-model', 'event-model', 'pending', 0, 10, null));
    const startedRun = processAgentRunSchedulerBatch({
      agentId,
      maxRuns: 1,
      nowMs: 300,
      repositories: runtime.repositories,
    }).startedRuns[0];
    const modelRequests: ModelProviderRequest[] = [];
    const modelProvider = createDeterministicModelProvider(modelRequests);
    expect(startedRun).toBeDefined();
    if (startedRun === undefined) throw new Error('Expected scheduler to start a Run.');

    const result = await executeStartedAgentRun({
      agentId,
      modelProvider,
      nowMs: 350,
      repositories: runtime.repositories,
      startedRun,
    });

    expect(result).toMatchObject({
      invocationId: 'model:run-model:1',
      runId: 'run-model',
      status: 'completed',
    });
    expect(runtime.findRun('run-model')).toMatchObject({ status: 'completed' });
    expect(runtime.invocations[0]).toMatchObject({
      invocationId: 'model:run-model:1',
      policyRef: 'policy-default',
      requestDigest: expect.stringMatching(/^[\da-f]{64}$/),
      responseDigest: 'c'.repeat(64),
      status: 'succeeded',
    });
    expect(modelRequests[0]?.generationParameters).toEqual({
      maxOutputTokens: 1024,
      temperature: 0.2,
      topP: 0.9,
    });
    expect(runtime.decisionRecords[0]).toMatchObject({
      decisionId: 'stop-1',
      decisionType: 'stop',
      runId: 'run-model',
      status: 'applied',
    });
    expect(
      JSON.stringify({ decisionRecords: runtime.decisionRecords, invocations: runtime.invocations })
    ).not.toMatch(/raw prompt|raw completion|reasoning|credential|secret|bearer|sk-/i);
  });

  it('[AGENT-RUNTIME-S014] [AGENT-MEMORY-S010] [AGENT-SCHEDULE-S006] commits Memory Schedule Event and stop with causal links', async () => {
    const runtime = createRuntimeHarness({ defaultModelPolicyRef: 'policy-default' });
    runtime.addThread('thread-commit', 0, null);
    runtime.addEvent('event-commit', 'thread-commit', 1);
    runtime.addRun(
      createRun('run-commit', 'thread-commit', 'event-commit', 'pending', 0, 10, null)
    );
    const startedRun = processAgentRunSchedulerBatch({
      agentId,
      maxRuns: 1,
      nowMs: 500,
      repositories: runtime.repositories,
    }).startedRuns[0];
    expect(startedRun).toBeDefined();
    if (startedRun === undefined) throw new Error('Expected scheduler to start a Run.');

    const result = await executeStartedAgentRun({
      agentId,
      modelProvider: createDecisionModelProvider([
        {
          decisionId: 'memory-1',
          memoryScope: 'thread',
          operationRef: 'memory-operation://safe-summary-1',
          type: 'write_memory',
        },
        {
          decisionId: 'schedule-1',
          scheduleRequestRef: 'schedule-request://safe-plan-1',
          type: 'create_schedule',
        },
        {
          decisionId: 'event-1',
          eventPayloadRef: 'event-payload://safe-follow-up-1',
          eventType: 'agent.follow_up',
          type: 'emit_event',
        },
        { decisionId: 'stop-1', reason: 'done', type: 'stop' },
      ]),
      nowMs: 550,
      repositories: runtime.repositories,
      startedRun,
    });

    expect(result).toMatchObject({ runId: 'run-commit', status: 'completed' });
    expect(runtime.threadMemoryItems[0]).toMatchObject({
      contentRef: 'memory-operation://safe-summary-1',
      provenanceRef: expect.stringContaining('policy_digest='),
      sourceEventId: 'event-commit',
      status: 'active',
    });
    expect(runtime.schedules[0]).toMatchObject({
      scheduleId: 'schedule:run-commit:schedule-1',
      status: 'active',
      threadId: 'thread-commit',
    });
    expect(runtime.schedules[0]?.scheduleSpec).toContain('schedule-request://safe-plan-1');
    expect(
      runtime.events.find((event) => event.eventId === 'event:run-commit:event-1')
    ).toMatchObject({
      causationId: 'event-commit',
      eventType: 'agent.follow_up',
      payloadRef: 'event-payload://safe-follow-up-1',
      runId: 'run:run-commit:event-1',
      source: 'agent.run.decision',
    });
    expect(runtime.findRun('run:run-commit:event-1')).toMatchObject({ status: 'pending' });
    expect(runtime.decisionRecords.map((record) => record.status)).toEqual([
      'applied',
      'applied',
      'applied',
      'applied',
    ]);
    expect(
      JSON.stringify({
        events: runtime.events,
        memory: runtime.threadMemoryItems,
        schedules: runtime.schedules,
      })
    ).not.toMatch(/raw prompt|raw completion|reasoning|credential|secret|bearer|sk-/i);
  });

  it('[AGENT-RUNTIME-S015] [AGENT-TOOL-S009] invoke_tool creates ToolInvocation waiting state and releases active slot', async () => {
    const runtime = createRuntimeHarness({ defaultModelPolicyRef: 'policy-default' });
    runtime.addThread('thread-tool', 0, null);
    runtime.addEvent('event-tool', 'thread-tool', 1);
    runtime.addRun(createRun('run-tool', 'thread-tool', 'event-tool', 'pending', 0, 10, null));
    runtime.addToolDefinition(createToolDefinition('calendar.create_event', true));
    const startedRun = processAgentRunSchedulerBatch({
      agentId,
      maxRuns: 1,
      nowMs: 600,
      repositories: runtime.repositories,
    }).startedRuns[0];
    expect(startedRun).toBeDefined();
    if (startedRun === undefined) throw new Error('Expected scheduler to start a Run.');

    const result = await executeStartedAgentRun({
      agentId,
      modelProvider: createDecisionModelProvider([
        {
          decisionId: 'tool-1',
          integrationId: 'calendar-installation',
          toolId: 'calendar.create_event',
          toolInputRef: 'tool-input://safe-calendar-request',
          type: 'invoke_tool',
        },
      ]),
      nowMs: 650,
      repositories: runtime.repositories,
      startedRun,
    });

    expect(result).toMatchObject({ runId: 'run-tool', status: 'waiting' });
    expect(runtime.findRun('run-tool')).toMatchObject({ status: 'waiting' });
    expect(runtime.toolInvocations[0]).toMatchObject({
      causationEventId: 'event-tool',
      inputRef: 'tool-input://safe-calendar-request',
      invocationId: 'tool-invocation:run-tool:tool-1',
      runId: 'run-tool',
      status: 'pending_approval',
      threadId: 'thread-tool',
      toolId: 'calendar.create_event',
    });

    runtime.addThread('thread-next', 0, null);
    runtime.addEvent('event-next', 'thread-next', 1);
    runtime.addRun(createRun('run-next', 'thread-next', 'event-next', 'pending', 0, 700, 650));
    const next = processAgentRunSchedulerBatch({
      agentId,
      maxRuns: 1,
      nowMs: 710,
      repositories: runtime.repositories,
    });
    expect(next.startedRuns[0]).toMatchObject({ runId: 'run-next' });
  });

  it('[AGENT-MODEL-POLICY-S003] Disabled or archived policy is rejected before model call', async () => {
    const runtime = createRuntimeHarness({
      defaultModelPolicyRef: 'policy-disabled',
      inactivePolicyRefs: ['policy-disabled'],
    });
    runtime.addThread('thread-disabled-policy', 0, null);
    runtime.addEvent('event-disabled-policy', 'thread-disabled-policy', 1);
    runtime.addRun(
      createRun(
        'run-disabled-policy',
        'thread-disabled-policy',
        'event-disabled-policy',
        'pending',
        0,
        10,
        null
      )
    );
    const startedRun = processAgentRunSchedulerBatch({
      agentId,
      maxRuns: 1,
      nowMs: 400,
      repositories: runtime.repositories,
    }).startedRuns[0];
    let providerCalls = 0;
    const provider: ModelProvider = {
      invoke: () => {
        providerCalls += 1;
        return Promise.resolve({ outputText: '[]', status: 'ok' });
      },
    };
    expect(startedRun).toBeDefined();
    if (startedRun === undefined) throw new Error('Expected scheduler to start a Run.');

    const result = await executeStartedAgentRun({
      agentId,
      modelProvider: provider,
      nowMs: 450,
      repositories: runtime.repositories,
      startedRun,
    });

    expect(result).toMatchObject({ failureCategory: 'invalid_policy', status: 'failed' });
    expect(providerCalls).toBe(0);
    expect(runtime.findRun('run-disabled-policy')).toMatchObject({ status: 'failed' });
    expect(runtime.budgetLedger[0]).toMatchObject({
      budgetDimension: 'invalid_policy',
      status: 'failed',
    });
  });
});

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function createRuntimeHarness(options?: {
  readonly defaultModelPolicyRef?: string;
  readonly inactivePolicyRefs?: readonly string[];
}) {
  const events: AgentEventRow[] = [];
  const budgetLedger: AgentRunBudgetLedgerRow[] = [];
  const decisionRecords: AgentHarnessDecisionRecordRow[] = [];
  const invocations: Mutable<AgentModelInvocationRow>[] = [];
  const agentMemoryItems: AgentMemoryItemRow[] = [];
  const agentMemoryVersions: AgentMemoryVersionRow[] = [];
  const runs: Mutable<AgentRunRow>[] = [];
  const schedules: AgentScheduleRow[] = [];
  const snapshots: AgentRunInputSnapshotRow[] = [];
  const threadMemoryItems: AgentThreadMemoryItemRow[] = [];
  const threadMemoryVersions: Mutable<AgentThreadMemoryVersionRow>[] = [];
  const threads: Mutable<AgentThreadRow>[] = [];
  const toolDefinitions: AgentToolDefinitionRow[] = [];
  const toolInvocations: AgentToolInvocationRow[] = [];
  const wake: Mutable<AgentSchedulerWakeStateRow> = { pendingCount: 0, wakeStatus: 'idle' };
  const repositories = {
    compactions: {
      findLatestReadyCompaction: () => undefined,
    },
    config: { getLatestConfig: () => createConfig(options?.defaultModelPolicyRef) },
    events: {
      appendEvent(input: AppendAgentEventInput) {
        const row: AgentEventRow = {
          agentSequence: input.sequences.agentSequence,
          causationId: input.causationId ?? null,
          correlationId: input.correlationId ?? null,
          createdAtMs: input.createdAtMs,
          deliveryContextId: input.deliveryContextId ?? null,
          eventId: input.eventId,
          eventType: input.eventType,
          idempotencyKey: input.idempotencyKey ?? null,
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
        };
        events.push(row);
        return row;
      },
      findByEventId: (eventId: string) => events.find((event) => event.eventId === eventId),
      findLatestForThread(threadId: string) {
        return events
          .filter((event) => event.threadId === threadId)
          .sort((left, right) => right.threadSequence - left.threadSequence)[0];
      },
      listEvents: (input: {
        readonly afterThreadSequence?: number;
        readonly limit: number;
        readonly threadId: string;
      }) =>
        events
          .filter((event) => event.threadId === input.threadId)
          .filter((event) => event.threadSequence > (input.afterThreadSequence ?? 0))
          .sort((left, right) => left.threadSequence - right.threadSequence)
          .slice(0, input.limit),
      getNextSequences(threadId: string): AgentEventSequencePair {
        const agentSequence = events.length + 1;
        const threadSequence =
          events
            .filter((event) => event.threadId === threadId)
            .reduce((max, event) => Math.max(max, event.threadSequence), 0) + 1;
        return { agentSequence, threadSequence };
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
      findRunById: (runId: string) => runs.find((run) => run.runId === runId),
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
      upsertPendingRunForThread(input: {
        readonly lastServedAtMs?: number;
        readonly nowMs: number;
        readonly priority: number;
        readonly runId: string;
        readonly threadId: string;
        readonly triggerEventId: string;
      }) {
        const existing = runs.find(
          (candidate) => candidate.threadId === input.threadId && candidate.status === 'pending'
        );
        if (existing !== undefined) return existing;
        const row: Mutable<AgentRunRow> = {
          createdAtMs: input.nowMs,
          lastServedAtMs: input.lastServedAtMs ?? null,
          pendingSinceMs: input.nowMs,
          priority: input.priority,
          runId: input.runId,
          status: 'pending',
          threadId: input.threadId,
          triggerEventId: input.triggerEventId,
          updatedAtMs: input.nowMs,
        };
        runs.push(row);
        return row;
      },
    },
    memory: {
      createAgentMemoryVersion(input: CreateAgentMemoryVersionInput) {
        const row: AgentMemoryVersionRow = {
          createdAtMs: input.createdAtMs,
          itemCount: input.itemCount ?? 0,
          latestCompactionId: input.latestCompactionId ?? null,
          memoryId: input.memoryId,
          memoryRef: input.memoryRef ?? null,
          provenanceRef: input.provenanceRef ?? null,
          rebaseStatus: input.rebaseStatus ?? null,
          snapshotRef: input.snapshotRef ?? null,
          status: input.status,
          updatedAtMs: input.createdAtMs,
          version: input.version,
        };
        agentMemoryVersions.push(row);
        return row;
      },
      createThreadMemoryVersion(input: CreateAgentThreadMemoryVersionInput) {
        const row: Mutable<AgentThreadMemoryVersionRow> = {
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
        threadMemoryVersions.push(row);
        return row;
      },
      findActiveAgentMemoryVersion: () =>
        agentMemoryVersions
          .filter((version) => version.status === 'active')
          .sort((left, right) => right.version - left.version)[0],
      findActiveThreadMemoryVersion: (threadId: string) =>
        threadMemoryVersions
          .filter((version) => version.threadId === threadId && version.status === 'active')
          .sort((left, right) => right.version - left.version)[0],
      insertAgentMemoryItem(input: InsertAgentMemoryItemInput) {
        const row: AgentMemoryItemRow = {
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
          updatedAtMs: input.createdAtMs,
        };
        agentMemoryItems.push(row);
        return row;
      },
      insertThreadMemoryItem(input: InsertAgentThreadMemoryItemInput) {
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
        threadMemoryItems.push(row);
        return row;
      },
      updateThreadMemoryVersionStatus(input: UpdateAgentThreadMemoryVersionStatusInput) {
        const row = threadMemoryVersions.find(
          (version) => version.threadId === input.threadId && version.memoryId === input.memoryId
        );
        if (row === undefined) throw new Error('Expected ThreadMemory version.');
        row.status = input.status;
        row.updatedAtMs = input.updatedAtMs;
        return row;
      },
    },
    modelPolicies: {
      getActivePolicy: (policyRef: string) =>
        options?.inactivePolicyRefs?.includes(policyRef) === true
          ? undefined
          : createModelPolicy(policyRef),
      tableName: 'agent_model_policies',
    },
    modelInvocations: {
      completeInvocation(input: {
        readonly inputTokenCount?: number;
        readonly invocationId: string;
        readonly latencyMs?: number;
        readonly outputTokenCount?: number;
        readonly responseDigest?: string;
        readonly status: 'succeeded' | 'failed';
        readonly updatedAtMs: number;
      }) {
        const row = invocations.find((candidate) => candidate.invocationId === input.invocationId);
        if (row === undefined) return undefined;
        row.inputTokenCount = input.inputTokenCount ?? null;
        row.latencyMs = input.latencyMs ?? null;
        row.outputTokenCount = input.outputTokenCount ?? null;
        row.responseDigest = input.responseDigest ?? null;
        row.status = input.status;
        row.updatedAtMs = input.updatedAtMs;
        return row;
      },
      failInvocation(input: {
        readonly invocationId: string;
        readonly providerErrorCategory: string;
        readonly updatedAtMs: number;
      }) {
        const row = invocations.find((candidate) => candidate.invocationId === input.invocationId);
        if (row === undefined) return undefined;
        row.providerErrorCategory = input.providerErrorCategory;
        row.status = 'failed';
        row.updatedAtMs = input.updatedAtMs;
        return row;
      },
      findLatestForRun: (runId: string) =>
        invocations.filter((invocation) => invocation.runId === runId).at(-1),
      startInvocation(input: {
        readonly attempt: number;
        readonly createdAtMs: number;
        readonly decisionSchemaVersion: string;
        readonly invocationId: string;
        readonly leaseExpiresAtMs?: number;
        readonly leaseOwner?: string;
        readonly modelId: string;
        readonly policyDigest: string;
        readonly policyRef: string;
        readonly provider: string;
        readonly requestDigest?: string;
        readonly runId: string;
        readonly threadId: string;
      }) {
        const row: Mutable<AgentModelInvocationRow> = {
          attempt: input.attempt,
          createdAtMs: input.createdAtMs,
          decisionSchemaVersion: input.decisionSchemaVersion,
          heartbeatAtMs: input.createdAtMs,
          inputTokenCount: null,
          invocationId: input.invocationId,
          latencyMs: null,
          leaseExpiresAtMs: input.leaseExpiresAtMs ?? null,
          leaseOwner: input.leaseOwner ?? null,
          modelId: input.modelId,
          outputTokenCount: null,
          policyDigest: input.policyDigest,
          policyRef: input.policyRef,
          provider: input.provider,
          providerErrorCategory: null,
          requestDigest: input.requestDigest ?? null,
          responseDigest: null,
          runId: input.runId,
          safeMetadataRef: null,
          status: 'running',
          threadId: input.threadId,
          updatedAtMs: input.createdAtMs,
        };
        invocations.push(row);
        return row;
      },
      tableName: 'agent_model_invocations',
    },
    profile: { getProfile: () => createProfile() },
    runtime: {
      budgetLedgerTableName: 'agent_run_budget_ledger',
      decisionTableName: 'agent_harness_decision_records',
      findLatestRunInterrupt: () => undefined,
      interruptTableName: 'agent_run_interrupts',
      listBudgetLedgerEntries: (runId: string) =>
        budgetLedger.filter((entry) => entry.runId === runId),
      listHarnessDecisionRecords: (runId: string) =>
        decisionRecords.filter((record) => record.runId === runId),
      recordBudgetLedgerEntry(input: {
        readonly budgetDimension: string;
        readonly budgetRecordId: string;
        readonly budgetScope: string;
        readonly limitValue?: number;
        readonly reason?: string;
        readonly runId: string;
        readonly status: string;
        readonly usedValue: number;
        readonly createdAtMs: number;
      }) {
        const row: AgentRunBudgetLedgerRow = {
          budgetDimension: input.budgetDimension,
          budgetRecordId: input.budgetRecordId,
          budgetScope: input.budgetScope,
          createdAtMs: input.createdAtMs,
          limitValue: input.limitValue ?? null,
          reason: input.reason ?? null,
          runId: input.runId,
          status: input.status,
          usedValue: input.usedValue,
        };
        budgetLedger.push(row);
        return row;
      },
      recordHarnessDecision(input: {
        readonly createdAtMs: number;
        readonly decisionId: string;
        readonly decisionRecordId: string;
        readonly decisionType: string;
        readonly reason?: string;
        readonly runId: string;
        readonly seam: string;
        readonly status: string;
        readonly threadId: string;
      }) {
        const row: AgentHarnessDecisionRecordRow = {
          createdAtMs: input.createdAtMs,
          decisionId: input.decisionId,
          decisionRecordId: input.decisionRecordId,
          decisionType: input.decisionType,
          reason: input.reason ?? null,
          runId: input.runId,
          seam: input.seam,
          status: input.status,
          threadId: input.threadId,
        };
        decisionRecords.push(row);
        return row;
      },
    },
    schedules: {
      insertSchedule(input: InsertAgentScheduleInput) {
        const row: AgentScheduleRow = {
          activeFireStartedAtMs: null,
          auditEventId: input.auditEventId ?? null,
          callbackIdentity: input.callbackIdentity ?? null,
          cancelledAtMs: null,
          cancelledByPrincipalId: null,
          cancelReason: null,
          createdAtMs: input.createdAtMs,
          createdByPrincipalId: input.createdByPrincipalId ?? null,
          idempotencyKey: input.idempotencyKey,
          installationId: input.installationId ?? null,
          intervalSeconds: input.intervalSeconds ?? null,
          lastEventId: null,
          lastFireAtMs: null,
          lastFireStatus: null,
          lastFireTickId: null,
          lastRunId: null,
          nextFireAtMs: input.nextFireAtMs ?? null,
          normalizedThreadKey: input.normalizedThreadKey ?? null,
          overlapPolicy: input.overlapPolicy,
          queuedFireCount: 0,
          runtimeScheduleId: input.runtimeScheduleId ?? null,
          scheduleId: input.scheduleId,
          scheduleKind: input.scheduleKind,
          scheduleSpec: input.scheduleSpec,
          status: input.status,
          threadId: input.threadId,
          threadKey: input.threadKey ?? null,
          updatedAtMs: input.updatedAtMs,
        };
        schedules.push(row);
        return row;
      },
    },
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
    tools: {
      findDefinition: (toolId: string) =>
        toolDefinitions.find((definition) => definition.toolId === toolId),
      insertInvocation(input: InsertAgentToolInvocationInput) {
        const row: AgentToolInvocationRow = {
          agentId,
          approvalId: null,
          attemptCount: 0,
          auditEventId: input.auditEventId ?? null,
          causationEventId: input.causationEventId ?? null,
          createdAtMs: input.createdAtMs,
          failureReason: null,
          idempotencyKey: input.idempotencyKey,
          inputRef: input.inputRef ?? null,
          installationId: input.installationId ?? null,
          invocationId: input.invocationId,
          outputRef: null,
          providerOperationId: null,
          resultEventId: null,
          runId: input.runId,
          status: input.status,
          threadId: input.threadId,
          toolId: input.toolId,
          toolSetVersion: input.toolSetVersion,
          updatedAtMs: input.createdAtMs,
        };
        toolInvocations.push(row);
        return row;
      },
    },
  } as unknown as AgentStorageRepositories;
  return {
    addEvent(
      eventId: string,
      threadId: string,
      threadSequence: number,
      eventOptions?: { readonly requestedModelPolicyRef?: string }
    ) {
      events.push(createEvent(eventId, threadId, threadSequence, eventOptions));
    },
    addRun(run: AgentRunRow) {
      runs.push({ ...run });
    },
    addThread(threadId: string, priority: number, lastServedAtMs: number | null) {
      threads.push(createThread(threadId, priority, lastServedAtMs));
    },
    addToolDefinition(definition: AgentToolDefinitionRow) {
      toolDefinitions.push(definition);
    },
    agentMemoryItems,
    agentMemoryVersions,
    findRun: (runId: string) => runs.find((run) => run.runId === runId),
    findSnapshot: (runId: string) => snapshots.find((snapshot) => snapshot.runId === runId),
    budgetLedger,
    decisionRecords,
    events,
    invocations,
    repositories,
    schedules,
    setRunStatus(runId: string, status: string) {
      const run = runs.find((candidate) => candidate.runId === runId);
      if (run !== undefined) run.status = status;
    },
    threadMemoryItems,
    threadMemoryVersions,
    toolInvocations,
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

function createEvent(
  eventId: string,
  threadId: string,
  threadSequence: number,
  options?: { readonly requestedModelPolicyRef?: string }
): AgentEventRow {
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
    policyOverrideSource: options?.requestedModelPolicyRef === undefined ? null : 'client_override',
    requestDigest: null,
    requestedModelPolicyDigest:
      options?.requestedModelPolicyRef === undefined
        ? null
        : createModelPolicy(options.requestedModelPolicyRef).policyDigest,
    requestedModelPolicyRef: options?.requestedModelPolicyRef ?? null,
    requestedModelPolicyValidationStatus:
      options?.requestedModelPolicyRef === undefined ? null : 'active',
    requestedModelPolicyVersion: options?.requestedModelPolicyRef === undefined ? null : 1,
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

function createConfig(modelPolicyRef?: string): AgentConfigRow {
  return {
    budgetPolicyRef: null,
    configBodyRef: null,
    configVersion: 4,
    displayName: null,
    memoryPolicyRef: null,
    modelPolicyRef: modelPolicyRef ?? null,
    schedulePolicyRef: null,
    toolPolicyRef: null,
    updatedAtMs: 1,
    updatedByPrincipalId: null,
  };
}

function createModelPolicy(policyRef: string): AgentModelPolicyRow {
  return {
    archivedAtMs: null,
    budgetMetadataRef: null,
    budgetMetadataSha256: null,
    createdAtMs: 1,
    createdByPrincipalId: 'principal-1',
    credentialRef: null,
    decisionSchemaVersion: 'v1',
    generationMaxOutputTokens: policyRef === 'policy-fast' ? 256 : 1024,
    generationParametersRef: null,
    generationParametersSha256: null,
    generationTemperature: policyRef === 'policy-fast' ? '0.35' : '0.2',
    generationTopP: policyRef === 'policy-fast' ? '0.75' : '0.9',
    modelId: '@cf/meta/llama-3.1-8b-instruct',
    policyDigest: policyRef === 'policy-fast' ? 'f'.repeat(64) : 'd'.repeat(64),
    policyRef,
    provider: 'workers-ai',
    safeMetadataRef: null,
    safeMetadataSha256: null,
    safetyMetadataRef: null,
    safetyMetadataSha256: null,
    status: 'active',
    updatedAtMs: 1,
    updatedByPrincipalId: 'principal-1',
    validatedAtMs: 1,
    version: 1,
  };
}

function createDeterministicModelProvider(
  capturedRequests: ModelProviderRequest[] = []
): ModelProvider {
  return {
    invoke: (request) => {
      capturedRequests.push(request);
      return Promise.resolve({
        latencyMs: 15,
        outputText: JSON.stringify({
          decisions: [{ decisionId: 'stop-1', reason: 'done', type: 'stop' }],
        }),
        outputTokenCount: 7,
        responseDigest: {
          algorithm: 'sha-256',
          byteLength: 64,
          digestHex: 'c'.repeat(64),
        },
        status: 'ok',
      });
    },
  };
}

function createDecisionModelProvider(decisions: readonly HarnessDecision[]): ModelProvider {
  return {
    invoke: () =>
      Promise.resolve({
        latencyMs: 15,
        outputText: JSON.stringify({ decisions }),
        outputTokenCount: 9,
        responseDigest: {
          algorithm: 'sha-256',
          byteLength: 64,
          digestHex: 'e'.repeat(64),
        },
        status: 'ok',
      }),
  };
}

function createToolDefinition(toolId: string, approvalRequired: boolean): AgentToolDefinitionRow {
  return {
    agentId,
    approvalRequired: approvalRequired ? 1 : 0,
    cancellationSupported: 1,
    createdAtMs: 1,
    description: null,
    displayName: toolId,
    inputSchemaRef: 'schema://tool/input',
    installationId: 'calendar-installation',
    outputSchemaRef: 'schema://tool/output',
    providerTargetRef: 'provider://tool/calendar',
    status: 'available',
    toolId,
    toolSetVersion: 0,
    updatedAtMs: 1,
    version: 'v1',
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
