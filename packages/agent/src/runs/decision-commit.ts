import type { HarnessDecision, HarnessDecisionRecord } from '../harness';
import type {
  AgentEventRow,
  AgentRunInputSnapshotRow,
  AgentStorageRepositories,
  AgentToolDefinitionRow,
} from '../storage';

/**
 * Run decision commit が実際に確定した side effect の概要です。
 *
 * @remarks
 * raw prompt、raw completion、hidden reasoning、credential は含めず、Run の状態遷移判定と
 * test evidence に必要な安全な識別子だけを保持します。
 */
export interface AgentRunDecisionCommitSideEffect {
  readonly decisionId: string;
  readonly kind:
    | 'event'
    | 'memory'
    | 'schedule'
    | 'tool'
    | 'delivery'
    | 'approval'
    | 'state'
    | 'stop';
  readonly ref: string;
  readonly waitsForExternalResult: boolean;
}

/**
 * HarnessDecision の side effect commit 入力です。
 *
 * @remarks
 * 呼び出し元は commit guard と budget check を済ませた decision record だけを渡します。
 * この関数は Agent-owned repositories だけへ書き込み、外部 Provider 呼び出しや public network I/O は行いません。
 */
export interface CommitHarnessDecisionSideEffectsInput {
  readonly agentId: string;
  readonly decisions: readonly HarnessDecision[];
  readonly nowMs: number;
  readonly records: readonly HarnessDecisionRecord[];
  readonly repositories: AgentStorageRepositories;
  readonly snapshot: AgentRunInputSnapshotRow;
}

/**
 * HarnessDecision の side effect commit 結果です。
 *
 * @remarks
 * `waiting` は Tool/Delivery/Human approval のように外部結果待ちが必要な decision がある場合に
 * `true` になり、Run active slot を解放する status 判定に使います。
 */
export interface CommitHarnessDecisionSideEffectsResult {
  readonly sideEffects: readonly AgentRunDecisionCommitSideEffect[];
  readonly waiting: boolean;
}

/**
 * budget/guard 通過済み HarnessDecision を Agent-owned side effect として確定します。
 *
 * @param input Agent ID、Run snapshot、decision record、repository set を含む commit 入力です。
 * @returns 確定した side effect の安全な参照と、Run を waiting にすべきかを返します。
 * @throws Error 必須の trigger Event、ToolDefinition、DeliveryContext が存在しない場合に発生します。
 */
export function commitHarnessDecisionSideEffects(
  input: CommitHarnessDecisionSideEffectsInput
): CommitHarnessDecisionSideEffectsResult {
  const sideEffects: AgentRunDecisionCommitSideEffect[] = [];
  const recordByDecisionId = new Map(input.records.map((record) => [record.decisionId, record]));
  for (const decision of input.decisions) {
    const record = recordByDecisionId.get(decision.decisionId);
    if (record === undefined || record.status === 'blocked') continue;
    sideEffects.push(commitDecisionSideEffect(input, decision));
    if (decision.type === 'stop') break;
  }
  return {
    sideEffects,
    waiting: sideEffects.some((effect) => effect.waitsForExternalResult),
  };
}

function commitDecisionSideEffect(
  input: CommitHarnessDecisionSideEffectsInput,
  decision: HarnessDecision
): AgentRunDecisionCommitSideEffect {
  switch (decision.type) {
    case 'create_schedule':
      return commitScheduleDecision(input, decision);
    case 'emit_event':
      return commitEventDecision(input, decision);
    case 'invoke_tool':
      return commitToolDecision(input, decision);
    case 'request_human_approval':
      return commitPendingApprovalDecision(input, decision.decisionId, decision.approvalRef);
    case 'respond':
      return commitDeliveryDecision(input, decision);
    case 'stop':
      return commitLocalDecision(decision.decisionId, 'stop', `run:${input.snapshot.runId}:stop`);
    case 'update_state':
      return commitLocalDecision(decision.decisionId, 'state', decision.statePatchRef);
    case 'write_memory':
      return commitMemoryDecision(input, decision);
  }
}

function commitMemoryDecision(
  input: CommitHarnessDecisionSideEffectsInput,
  decision: Extract<HarnessDecision, { readonly type: 'write_memory' }>
): AgentRunDecisionCommitSideEffect {
  const provenanceRef = createDecisionProvenanceRef(input, decision.decisionId);
  if (decision.memoryScope === 'agent') {
    const active = input.repositories.memory.findActiveAgentMemoryVersion();
    const version = (active?.version ?? 0) + 1;
    const memoryId = createDecisionResourceId(
      'agent-memory',
      input.snapshot.runId,
      decision.decisionId
    );
    input.repositories.memory.createAgentMemoryVersion({
      createdAtMs: input.nowMs,
      itemCount: (active?.itemCount ?? 0) + 1,
      memoryId,
      memoryRef: `agent-memory://${encodeURIComponent(input.agentId)}/${String(version)}`,
      provenanceRef,
      snapshotRef: input.snapshot.snapshotRef,
      status: 'active',
      version,
    });
    input.repositories.memory.insertAgentMemoryItem({
      contentRef: decision.operationRef,
      createdAtMs: input.nowMs,
      memoryId,
      memoryItemId: createDecisionResourceId(
        'agent-memory-item',
        input.snapshot.runId,
        decision.decisionId
      ),
      provenanceRef,
      sourceEventId: input.snapshot.triggerEventId,
      status: 'active',
    });
    return commitLocalDecision(decision.decisionId, 'memory', memoryId);
  }
  const active = input.repositories.memory.findActiveThreadMemoryVersion(input.snapshot.threadId);
  if (active !== undefined) {
    input.repositories.memory.updateThreadMemoryVersionStatus({
      memoryId: active.memoryId,
      status: 'superseded',
      threadId: input.snapshot.threadId,
      updatedAtMs: input.nowMs,
    });
  }
  const version = (active?.version ?? input.snapshot.threadMemoryVersion) + 1;
  const memoryId = createDecisionResourceId(
    'thread-memory',
    input.snapshot.runId,
    decision.decisionId
  );
  input.repositories.memory.createThreadMemoryVersion({
    createdAtMs: input.nowMs,
    itemCount: (active?.itemCount ?? 0) + 1,
    memoryId,
    memoryRef: `thread-memory://${encodeURIComponent(input.agentId)}/${encodeURIComponent(input.snapshot.threadId)}/${String(version)}`,
    provenanceRef,
    snapshotRef: input.snapshot.snapshotRef,
    status: 'active',
    threadId: input.snapshot.threadId,
    version,
  });
  input.repositories.memory.insertThreadMemoryItem({
    contentRef: decision.operationRef,
    createdAtMs: input.nowMs,
    memoryId,
    memoryItemId: createDecisionResourceId(
      'thread-memory-item',
      input.snapshot.runId,
      decision.decisionId
    ),
    provenanceRef,
    sourceEventId: input.snapshot.triggerEventId,
    status: 'active',
    threadId: input.snapshot.threadId,
  });
  return commitLocalDecision(decision.decisionId, 'memory', memoryId);
}

function commitScheduleDecision(
  input: CommitHarnessDecisionSideEffectsInput,
  decision: Extract<HarnessDecision, { readonly type: 'create_schedule' }>
): AgentRunDecisionCommitSideEffect {
  const triggerEvent = requireTriggerEvent(input);
  const scheduleId = createDecisionResourceId(
    'schedule',
    input.snapshot.runId,
    decision.decisionId
  );
  input.repositories.schedules.insertSchedule({
    auditEventId: createDecisionProvenanceRef(input, decision.decisionId),
    callbackIdentity: 'agent-run-decision',
    createdAtMs: input.nowMs,
    createdByPrincipalId: `run:${input.snapshot.runId}`,
    idempotencyKey: createDecisionResourceId(
      'schedule-idempotency',
      input.snapshot.runId,
      decision.decisionId
    ),
    nextFireAtMs: input.nowMs,
    normalizedThreadKey: triggerEvent.normalizedThreadKey,
    overlapPolicy: 'coalesce',
    scheduleId,
    scheduleKind: 'run_decision',
    scheduleSpec: createDecisionScheduleSpec(input, decision),
    status: 'active',
    threadId: input.snapshot.threadId,
    threadKey: triggerEvent.threadKey,
    updatedAtMs: input.nowMs,
  });
  return commitLocalDecision(decision.decisionId, 'schedule', scheduleId);
}

function commitEventDecision(
  input: CommitHarnessDecisionSideEffectsInput,
  decision: Extract<HarnessDecision, { readonly type: 'emit_event' }>
): AgentRunDecisionCommitSideEffect {
  const triggerEvent = requireTriggerEvent(input);
  const eventId = createDecisionResourceId('event', input.snapshot.runId, decision.decisionId);
  const followUpRunId = createDecisionResourceId('run', input.snapshot.runId, decision.decisionId);
  const sequences = input.repositories.events.getNextSequences(input.snapshot.threadId);
  input.repositories.events.appendEvent({
    causationId: input.snapshot.triggerEventId,
    correlationId: triggerEvent.correlationId ?? input.snapshot.runId,
    createdAtMs: input.nowMs,
    eventId,
    eventType: decision.eventType,
    idempotencyKey: createDecisionResourceId(
      'event-idempotency',
      input.snapshot.runId,
      decision.decisionId
    ),
    normalizedThreadKey: triggerEvent.normalizedThreadKey,
    occurredAtMs: input.nowMs,
    payloadRef: decision.eventPayloadRef,
    policyOverrideSource: undefined,
    requestDigest: input.snapshot.resolvedModelPolicyDigest ?? undefined,
    runId: followUpRunId,
    sectionId: triggerEvent.sectionId,
    sequences,
    source: 'agent.run.decision',
    threadId: input.snapshot.threadId,
    threadKey: triggerEvent.threadKey,
  });
  input.repositories.pendingRuns.upsertPendingRunForThread({
    lastServedAtMs: input.nowMs,
    nowMs: input.nowMs,
    priority: 0,
    runId: followUpRunId,
    threadId: input.snapshot.threadId,
    triggerEventId: eventId,
  });
  input.repositories.schedulerWakes.markPending(
    input.nowMs,
    input.repositories.pendingRuns.countPendingRuns()
  );
  return commitLocalDecision(decision.decisionId, 'event', eventId);
}

function commitToolDecision(
  input: CommitHarnessDecisionSideEffectsInput,
  decision: Extract<HarnessDecision, { readonly type: 'invoke_tool' }>
): AgentRunDecisionCommitSideEffect {
  const definition = requireToolDefinition(input.repositories, decision.toolId);
  const invocationId = createDecisionResourceId(
    'tool-invocation',
    input.snapshot.runId,
    decision.decisionId
  );
  input.repositories.tools.insertInvocation({
    causationEventId: input.snapshot.triggerEventId,
    createdAtMs: input.nowMs,
    idempotencyKey: createDecisionResourceId(
      'tool-idempotency',
      input.snapshot.runId,
      decision.decisionId
    ),
    inputRef: decision.toolInputRef,
    installationId: decision.integrationId ?? definition.installationId ?? undefined,
    invocationId,
    runId: input.snapshot.runId,
    status: definition.approvalRequired === 1 ? 'pending_approval' : 'running',
    threadId: input.snapshot.threadId,
    toolId: decision.toolId,
    toolSetVersion: input.snapshot.toolSetVersion,
  });
  return {
    decisionId: decision.decisionId,
    kind: 'tool',
    ref: invocationId,
    waitsForExternalResult: true,
  };
}

function commitDeliveryDecision(
  input: CommitHarnessDecisionSideEffectsInput,
  decision: Extract<HarnessDecision, { readonly type: 'respond' }>
): AgentRunDecisionCommitSideEffect {
  const context = input.repositories.integrations.findDeliveryContext(decision.deliveryContextId);
  if (context === undefined) throw new Error('DeliveryContext is required before respond commit.');
  const deliveryId = createDecisionResourceId(
    'delivery',
    input.snapshot.runId,
    decision.decisionId
  );
  input.repositories.integrations.createAdapterDelivery({
    connectionId: context.connectionId,
    createdAtMs: input.nowMs,
    deliveryContextId: decision.deliveryContextId,
    deliveryId,
    eventId: context.eventId,
    idempotencyKey: createDecisionResourceId(
      'delivery-idempotency',
      input.snapshot.runId,
      decision.decisionId
    ),
    installationId: context.installationId,
    requestPayloadRef: decision.responseRef,
    runId: input.snapshot.runId,
    status: 'waiting_provider_result',
    updatedAtMs: input.nowMs,
  });
  return {
    decisionId: decision.decisionId,
    kind: 'delivery',
    ref: deliveryId,
    waitsForExternalResult: true,
  };
}

function commitPendingApprovalDecision(
  _input: CommitHarnessDecisionSideEffectsInput,
  decisionId: string,
  approvalRef: string
): AgentRunDecisionCommitSideEffect {
  return {
    decisionId,
    kind: 'approval',
    ref: approvalRef,
    waitsForExternalResult: true,
  };
}

function commitLocalDecision(
  decisionId: string,
  kind: AgentRunDecisionCommitSideEffect['kind'],
  ref: string
): AgentRunDecisionCommitSideEffect {
  return { decisionId, kind, ref, waitsForExternalResult: false };
}

function requireTriggerEvent(input: CommitHarnessDecisionSideEffectsInput): AgentEventRow {
  const event = input.repositories.events.findByEventId(input.snapshot.triggerEventId);
  if (event === undefined) throw new Error('Trigger Event is required before decision commit.');
  return event;
}

function requireToolDefinition(
  repositories: AgentStorageRepositories,
  toolId: string
): AgentToolDefinitionRow {
  const definition = repositories.tools.findDefinition(toolId);
  if (definition?.status !== 'available') {
    throw new Error('Available ToolDefinition is required before invoke_tool commit.');
  }
  return definition;
}

function createDecisionScheduleSpec(
  input: CommitHarnessDecisionSideEffectsInput,
  decision: Extract<HarnessDecision, { readonly type: 'create_schedule' }>
): string {
  return JSON.stringify({
    causationEventId: input.snapshot.triggerEventId,
    decisionId: decision.decisionId,
    modelPolicyDigest: input.snapshot.resolvedModelPolicyDigest,
    requestRef: decision.scheduleRequestRef,
    runId: input.snapshot.runId,
    threadId: input.snapshot.threadId,
  });
}

function createDecisionProvenanceRef(
  input: CommitHarnessDecisionSideEffectsInput,
  decisionId: string
): string {
  return [
    'agent-run-decision://',
    encodeURIComponent(input.agentId),
    '/',
    encodeURIComponent(input.snapshot.runId),
    '/',
    encodeURIComponent(decisionId),
    '?source_event=',
    encodeURIComponent(input.snapshot.triggerEventId),
    '&policy_digest=',
    encodeURIComponent(input.snapshot.resolvedModelPolicyDigest ?? 'missing'),
  ].join('');
}

function createDecisionResourceId(prefix: string, runId: string, decisionId: string): string {
  return `${prefix}:${runId}:${decisionId}`;
}
