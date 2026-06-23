import { describe, expect, it } from 'vitest';

import {
  buildHarnessContext,
  createEmptyHarnessBudgetUsage,
  enforceHarnessBudgets,
  guardHarnessRunResultCommit,
  interpretHarnessDecisions,
  recordHarnessRunInterrupt,
} from '../harness';

import type { HarnessBudgetDimension, HarnessBudgetPolicy, HarnessBudgetRequest } from '../harness';
import type {
  AgentConfigRow,
  AgentEventRow,
  AgentProfileRow,
  AgentRunInputSnapshotRow,
  AgentRunInterruptRow,
  AgentRunRow,
  AgentStorageRepositories,
} from '../storage';

const agentId = 'agent-alpha';

describe('Agent Stage 3 harness runtime', () => {
  it('[AGENT-RUNTIME-S004] builds context in spec order without cross-thread contamination', () => {
    const snapshot = createSnapshot('run-a1', 'thread-a', 'event-a3');
    const context = buildHarnessContext({
      agentId,
      events: [
        createEvent('event-a1', 'thread-a', 1),
        createEvent('event-b1', 'thread-b', 1),
        createEvent('event-a2', 'thread-a', 2),
        createEvent('event-a3', 'thread-a', 3),
      ],
      policy: {
        agentMemoryRefs: ['agent-memory://policy'],
        handoffRef: 'handoff://section-5',
        identity: 'Agent identity: agent-alpha',
        policy: 'Policy: obey Agent-local budget and safety boundaries.',
        retrievedHistoryRefs: ['history://thread-a/section-4'],
        threadMemoryText: 'ThreadMemory: active constraints for Thread A.',
      },
      snapshot,
      triggerEvent: createEvent('event-a3', 'thread-b', 3),
    });

    expect(context.parts.map((part) => part.kind)).toEqual([
      'identity_policy',
      'thread_memory',
      'handoff',
      'uncompacted_events',
      'retrieved_history',
      'agent_memory',
      'trigger_event',
    ]);
    expect(context.parts[3]?.events?.map((event) => event.eventId)).toEqual([
      'event-a1',
      'event-a2',
      'event-a3',
    ]);
    expect(context.parts[3]?.events?.some((event) => event.threadId === 'thread-b')).toBe(false);
    expect(context.parts[6]?.triggerEvent?.eventId).toBe('event-a3');
  });

  it('[AGENT-RUNTIME-S006] stores interrupts and blocks stale generation commits', () => {
    const runtime = createCommitGuardRuntime();
    const interrupted = recordHarnessRunInterrupt({
      interruptId: 'interrupt-1',
      interruptType: 'user_cancel',
      nowMs: 200,
      reason: 'user requested cancellation',
      repositories: runtime.repositories,
      runId: 'run-a1',
      snapshotRef: 'snapshot://run-a1',
    });

    expect(interrupted).toMatchObject({
      allowed: false,
      currentStatus: 'cancelled',
      reason: 'user_cancel',
      staleResultDiscarded: true,
    });
    expect(runtime.interrupts).toHaveLength(1);
    expect(runtime.audits).toHaveLength(1);
    expect(runtime.run.status).toBe('cancelled');

    const stale = guardHarnessRunResultCommit({
      currentCapabilityGeneration: createCurrentCapabilityGeneration(0, 0),
      expected: createExpectedGeneration('snapshot://run-a1', 4),
      nowMs: 210,
      repositories: runtime.repositories,
      runId: 'run-a1',
    });
    expect(stale).toMatchObject({
      allowed: false,
      currentStatus: 'cancelled',
      reason: 'user_cancel',
      staleResultDiscarded: true,
    });

    const generationRuntime = createCommitGuardRuntime();
    generationRuntime.setConfigVersion(5);
    const blocked = guardHarnessRunResultCommit({
      currentCapabilityGeneration: createCurrentCapabilityGeneration(0, 0),
      expected: createExpectedGeneration('snapshot://run-a1', 4),
      nowMs: 220,
      repositories: generationRuntime.repositories,
      runId: 'run-a1',
    });
    expect(blocked).toMatchObject({
      allowed: false,
      reason: 'generation_mismatch',
      staleResultDiscarded: true,
    });
    expect(generationRuntime.interrupts[0]).toMatchObject({
      interruptType: 'generation_mismatch',
      requestedStatus: 'interrupted',
    });
    expect(generationRuntime.audits[0]).toMatchObject({
      eventType: 'agent.run.interrupted',
      principalRef: 'agent-run:run-a1',
    });
    expect(generationRuntime.run.status).toBe('interrupted');

    const capabilityRuntime = createCommitGuardRuntime();
    const capabilityBlocked = guardHarnessRunResultCommit({
      currentCapabilityGeneration: createCurrentCapabilityGeneration(1, 0),
      expected: createExpectedGeneration('snapshot://run-a1', 4),
      nowMs: 230,
      repositories: capabilityRuntime.repositories,
      runId: 'run-a1',
    });
    expect(capabilityBlocked).toMatchObject({
      allowed: false,
      reason: 'capability_version_mismatch',
      staleResultDiscarded: true,
    });
    expect(capabilityRuntime.interrupts[0]).toMatchObject({
      interruptType: 'capability_version_mismatch',
      requestedStatus: 'interrupted',
    });
  });

  it('[AGENT-RUNTIME-S007] interprets supported decisions with typed downstream seams', () => {
    const records = [] as ReturnType<typeof interpretHarnessDecisions>['records'][number][];
    const result = interpretHarnessDecisions({
      budgetPolicy: {
        maxIntegrationCallsPerRun: 10,
        maxToolCallsPerRun: 10,
        maxToolCallsPerTool: 10,
      },
      budgetUsage: createEmptyHarnessBudgetUsage(100),
      commitGuard: createAllowedCommitGuard(),
      decisions: [
        { decisionId: 'state-1', statePatchRef: 'state://patch-1', type: 'update_state' },
        {
          decisionId: 'memory-1',
          memoryScope: 'thread',
          operationRef: 'memory://op-1',
          type: 'write_memory',
        },
        {
          decisionId: 'schedule-1',
          scheduleRequestRef: 'schedule://req-1',
          type: 'create_schedule',
        },
        {
          decisionId: 'tool-1',
          toolId: 'tool.echo',
          toolInputRef: 'tool-input://1',
          type: 'invoke_tool',
        },
        {
          decisionId: 'delivery-1',
          deliveryContextId: 'delivery-1',
          responseRef: 'response://1',
          type: 'respond',
        },
        { approvalRef: 'approval://1', decisionId: 'approval-1', type: 'request_human_approval' },
        { decisionId: 'event-1', eventType: 'agent.note', type: 'emit_event' },
        { decisionId: 'stop-1', reason: 'decision loop complete', type: 'stop' },
      ],
      nowMs: 150,
      recordSink: (record) => {
        records.push(record);
      },
      runId: 'run-a1',
      threadId: 'thread-a',
    });

    expect(result).toMatchObject({ status: 'stopped', terminalStatus: 'completed' });
    expect(records.map((record) => record.decisionType)).toEqual([
      'update_state',
      'write_memory',
      'create_schedule',
      'invoke_tool',
      'respond',
      'request_human_approval',
      'emit_event',
      'stop',
    ]);
    expect(records.map((record) => record.status)).toEqual([
      'applied',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
      'pending',
      'applied',
    ]);
    expect(records.map((record) => record.seam)).toEqual([
      'state_update:state://patch-1',
      'stage4_memory_write:memory://op-1',
      'stage5_schedule_create:schedule://req-1',
      'stage6_tool_invoke:tool.echo',
      'stage7_delivery_response:delivery-1',
      'stage6_human_approval:approval://1',
      'event_emit:agent.note',
      'run_stop',
    ]);
  });

  it('[AGENT-RUNTIME-S008] enforces all budget dimensions before committing actions', () => {
    const usage = createEmptyHarnessBudgetUsage(0);
    const cases: readonly {
      readonly dimension: HarnessBudgetDimension;
      readonly nowMs: number;
      readonly policy: HarnessBudgetPolicy;
      readonly request: HarnessBudgetRequest;
    }[] = [
      {
        dimension: 'model_calls',
        nowMs: 10,
        policy: { maxModelCallsPerRun: 0 },
        request: { modelCalls: 1 },
      },
      {
        dimension: 'tool_calls',
        nowMs: 10,
        policy: { maxToolCallsPerRun: 0 },
        request: { toolCalls: 1 },
      },
      { dimension: 'tokens', nowMs: 10, policy: { maxTokensPerRun: 0 }, request: { tokens: 1 } },
      { dimension: 'loops', nowMs: 10, policy: { maxLoopsPerRun: 0 }, request: { loops: 1 } },
      { dimension: 'timeout', nowMs: 101, policy: { timeoutMs: 100 }, request: {} },
      { dimension: 'cooldown', nowMs: 10, policy: { cooldownUntilMs: 20 }, request: {} },
      {
        dimension: 'daily_budget',
        nowMs: 10,
        policy: { maxDailyCostUnits: 0 },
        request: { costUnits: 1 },
      },
      {
        dimension: 'integration_budget',
        nowMs: 10,
        policy: { maxIntegrationCallsPerRun: 0 },
        request: { integrationCalls: 1, integrationId: 'integration-1' },
      },
      {
        dimension: 'tool_budget',
        nowMs: 10,
        policy: { maxToolCallsPerTool: 0 },
        request: { toolCalls: 1, toolId: 'tool.echo' },
      },
    ];

    for (const item of cases) {
      expect(
        enforceHarnessBudgets({
          nowMs: item.nowMs,
          policy: item.policy,
          request: item.request,
          usage,
        }).dimension
      ).toBe(item.dimension);
    }

    const records = [] as ReturnType<typeof interpretHarnessDecisions>['records'][number][];
    const result = interpretHarnessDecisions({
      budgetPolicy: { maxToolCallsPerRun: 0 },
      budgetUsage: usage,
      commitGuard: createAllowedCommitGuard(),
      decisions: [
        {
          decisionId: 'tool-overrun',
          toolId: 'tool.echo',
          toolInputRef: 'tool-input://1',
          type: 'invoke_tool',
        },
        { decisionId: 'state-after-overrun', statePatchRef: 'state://late', type: 'update_state' },
      ],
      nowMs: 10,
      recordSink: (record) => {
        records.push(record);
      },
      runId: 'run-a1',
      threadId: 'thread-a',
    });

    expect(result).toMatchObject({ status: 'stopped', terminalStatus: 'failed' });
    expect(result.budgetDecision).toMatchObject({ dimension: 'tool_calls', outcome: 'fail' });
    expect(records).toHaveLength(1);
    expect(records[0]).toMatchObject({
      decisionId: 'tool-overrun',
      seam: 'budget_exceeded',
      status: 'blocked',
    });
    expect(records.some((record) => record.decisionId === 'state-after-overrun')).toBe(false);
  });
});

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

function createAllowedCommitGuard() {
  return {
    allowed: true,
    currentStatus: 'running',
    reason: 'commit_allowed',
    safeAuditReason: 'allowed',
    staleResultDiscarded: false,
  } as const;
}

function createCommitGuardRuntime() {
  const run = createRun('run-a1', 'thread-a', 'event-a3', 'running');
  const snapshot = createSnapshot('run-a1', 'thread-a', 'event-a3');
  const audits: { readonly eventType: string; readonly principalRef?: string }[] = [];
  const interrupts: Mutable<AgentRunInterruptRow>[] = [];
  let configVersion = 4;
  const repositories = {
    audit: {
      insertAuditEvent(input: { readonly eventType: string; readonly principalRef?: string }) {
        audits.push(input);
      },
    },
    config: { getLatestConfig: () => createConfig(configVersion) },
    pendingRuns: {
      findRunById: (runId: string) => (run.runId === runId ? run : undefined),
      findRunInputSnapshot: (runId: string) => (snapshot.runId === runId ? snapshot : undefined),
      transitionRunStatus(input: {
        readonly fromStatus?: string;
        readonly nowMs: number;
        readonly runId: string;
        readonly toStatus: string;
      }) {
        if (input.runId !== run.runId) return;
        if (input.fromStatus !== undefined && input.fromStatus !== run.status) return;
        run.status = input.toStatus;
        run.updatedAtMs = input.nowMs;
      },
    },
    profile: { getProfile: () => createProfile(configVersion) },
    runtime: {
      findLatestRunInterrupt(runId: string) {
        return interrupts
          .filter((interrupt) => interrupt.runId === runId)
          .sort((left, right) => right.createdAtMs - left.createdAtMs)[0];
      },
      recordRunInterrupt(input: AgentRunInterruptRow) {
        const row = { ...input };
        interrupts.push(row);
        return row;
      },
    },
  } as unknown as AgentStorageRepositories;
  return {
    audits,
    interrupts,
    repositories,
    run,
    setConfigVersion(value: number) {
      configVersion = value;
    },
  };
}

function createCurrentCapabilityGeneration(toolSetVersion: number, integrationVersion: number) {
  return { integrationVersion, toolSetVersion };
}

function createConfig(configVersion: number): AgentConfigRow {
  return {
    budgetPolicyRef: null,
    configBodyRef: null,
    configVersion,
    displayName: null,
    memoryPolicyRef: null,
    modelPolicyRef: null,
    schedulePolicyRef: null,
    toolPolicyRef: null,
    updatedAtMs: 1,
    updatedByPrincipalId: null,
  };
}

function createEvent(eventId: string, threadId: string, threadSequence: number): AgentEventRow {
  return {
    agentSequence: threadSequence,
    causationId: null,
    correlationId: null,
    createdAtMs: threadSequence,
    eventId,
    eventType: 'user.message',
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

function createExpectedGeneration(snapshotRef: string, configVersion: number) {
  return { configVersion, integrationVersion: 0, snapshotRef, toolSetVersion: 0 };
}

function createProfile(configVersion: number): AgentProfileRow {
  return {
    agentId,
    configVersion,
    createdAtMs: 1,
    credentialGeneration: 1,
    displayName: null,
    lifecycleStatus: 'active',
    systemThreadId: null,
    updatedAtMs: 1,
  };
}

function createRun(
  runId: string,
  threadId: string,
  triggerEventId: string,
  status: string
): Mutable<AgentRunRow> {
  return {
    createdAtMs: 1,
    lastServedAtMs: 1,
    pendingSinceMs: 1,
    priority: 0,
    runId,
    status,
    threadId,
    triggerEventId,
    updatedAtMs: 1,
  };
}

function createSnapshot(
  runId: string,
  threadId: string,
  triggerEventId: string
): AgentRunInputSnapshotRow {
  return {
    configVersion: 4,
    createdAtMs: 1,
    integrationVersion: 0,
    latestReadyCompactionRef: 'compaction://ready-5',
    runId,
    snapshotRef: `snapshot://${runId}`,
    threadId,
    threadMemoryRef: 'thread-memory://v4',
    threadMemoryVersion: 4,
    toolSetVersion: 0,
    triggerEventEndSequence: 3,
    triggerEventId,
    triggerEventStartSequence: 1,
    uncompactedUpperSequence: 3,
  };
}
