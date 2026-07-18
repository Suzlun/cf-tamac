import { enforceHarnessBudgets } from './budget';

import type {
  HarnessBudgetDecision,
  HarnessBudgetPolicy,
  HarnessBudgetRequest,
  HarnessBudgetUsage,
} from './budget';
import type { HarnessCommitGuardResult } from './commit-guard';

/**
 * Harness decision types accepted from a model/runtime harness step.
 */
export const harnessDecisionTypes = [
  'stop',
  'update_state',
  'write_memory',
  'create_schedule',
  'invoke_tool',
  'respond',
  'request_human_approval',
  'emit_event',
] as const;

/**
 * Harness decision type value.
 */
export type HarnessDecisionType = (typeof harnessDecisionTypes)[number];

/**
 * Harness decision returned by the model seam.
 */
export type HarnessDecision =
  | HarnessStopDecision
  | HarnessUpdateStateDecision
  | HarnessWriteMemoryDecision
  | HarnessCreateScheduleDecision
  | HarnessInvokeToolDecision
  | HarnessRespondDecision
  | HarnessHumanApprovalDecision
  | HarnessEmitEventDecision;

/**
 * Common harness decision fields.
 */
export interface HarnessDecisionBase {
  readonly decisionId: string;
  readonly rationale?: string;
}

/**
 * Stop the current Run safely.
 */
export interface HarnessStopDecision extends HarnessDecisionBase {
  readonly reason: string;
  readonly terminalStatus?: 'completed' | 'failed' | 'interrupted';
  readonly type: 'stop';
}

/**
 * Record an Agent-owned state update decision.
 */
export interface HarnessUpdateStateDecision extends HarnessDecisionBase {
  readonly statePatchRef: string;
  readonly type: 'update_state';
}

/**
 * Record a Stage 4 memory write seam.
 */
export interface HarnessWriteMemoryDecision extends HarnessDecisionBase {
  readonly memoryScope: 'agent' | 'thread';
  readonly operationRef: string;
  readonly type: 'write_memory';
}

/**
 * Record a Stage 5 schedule creation seam.
 */
export interface HarnessCreateScheduleDecision extends HarnessDecisionBase {
  readonly scheduleRequestRef: string;
  readonly type: 'create_schedule';
}

/**
 * Record a Stage 6 Tool invocation seam.
 */
export interface HarnessInvokeToolDecision extends HarnessDecisionBase {
  readonly integrationId?: string;
  readonly toolId: string;
  readonly toolInputRef: string;
  readonly type: 'invoke_tool';
}

/**
 * Record a Stage 7 Delivery response seam.
 */
export interface HarnessRespondDecision extends HarnessDecisionBase {
  readonly deliveryContextId: string;
  readonly responseRef: string;
  readonly type: 'respond';
}

/**
 * Record a Stage 6 human approval request seam.
 */
export interface HarnessHumanApprovalDecision extends HarnessDecisionBase {
  readonly approvalRef: string;
  readonly type: 'request_human_approval';
}

/**
 * Record an AgentEvent emit seam for the same Thread.
 */
export interface HarnessEmitEventDecision extends HarnessDecisionBase {
  readonly eventPayloadRef?: string;
  readonly eventType: string;
  readonly type: 'emit_event';
}

/**
 * Decision interpreter record status.
 */
export type HarnessDecisionRecordStatus = 'applied' | 'pending' | 'blocked';

/**
 * Decision interpreter record emitted for storage or tests.
 */
export interface HarnessDecisionRecord {
  readonly decisionId: string;
  readonly decisionRecordId: string;
  readonly decisionType: HarnessDecisionType;
  readonly reason?: string;
  readonly runId: string;
  readonly seam: string;
  readonly status: HarnessDecisionRecordStatus;
  readonly threadId: string;
}

/**
 * Result returned by the harness decision interpreter.
 */
export interface HarnessDecisionInterpreterResult {
  readonly budgetDecision?: HarnessBudgetDecision;
  readonly records: readonly HarnessDecisionRecord[];
  readonly status: 'committed' | 'stopped' | 'blocked';
  readonly terminalStatus?: 'completed' | 'failed' | 'interrupted';
}

/**
 * Persist or observe a harness decision record.
 */
export type HarnessDecisionRecordSink = (record: HarnessDecisionRecord) => void;

/**
 * Interpret harness decisions after commit guard and budget checks.
 */
export function interpretHarnessDecisions(input: {
  readonly budgetPolicy: HarnessBudgetPolicy;
  readonly budgetUsage: HarnessBudgetUsage;
  readonly commitGuard: HarnessCommitGuardResult;
  readonly decisions: readonly HarnessDecision[];
  readonly nowMs: number;
  readonly recordSink?: HarnessDecisionRecordSink;
  readonly runId: string;
  readonly threadId: string;
}): HarnessDecisionInterpreterResult {
  if (!input.commitGuard.allowed) {
    return { records: [], status: 'blocked', terminalStatus: 'interrupted' };
  }
  const records: HarnessDecisionRecord[] = [];
  let usage = input.budgetUsage;
  for (const decision of input.decisions) {
    const request = createBudgetRequest(decision);
    const budgetDecision = enforceHarnessBudgets({
      nowMs: input.nowMs,
      policy: input.budgetPolicy,
      request,
      usage,
    });
    if (!budgetDecision.allowed) {
      const blockedRecord = createDecisionRecord(input, decision, 'blocked', 'budget_exceeded');
      records.push(blockedRecord);
      input.recordSink?.(blockedRecord);
      return {
        budgetDecision,
        records,
        status: 'stopped',
        terminalStatus: budgetDecision.outcome === 'stop' ? 'completed' : 'failed',
      };
    }

    const record = createDecisionRecordForDecision(input, decision);
    records.push(record);
    input.recordSink?.(record);
    usage = applyBudgetRequest(usage, request);
    if (decision.type === 'stop') {
      return {
        records,
        status: 'stopped',
        terminalStatus: decision.terminalStatus ?? 'completed',
      };
    }
  }
  return { records, status: 'committed' };
}

function createBudgetRequest(decision: HarnessDecision): HarnessBudgetRequest {
  if (decision.type === 'invoke_tool') {
    return {
      integrationCalls: decision.integrationId === undefined ? 0 : 1,
      integrationId: decision.integrationId,
      toolCalls: 1,
      toolId: decision.toolId,
    };
  }
  if (decision.type === 'respond') {
    return { integrationCalls: 1, integrationId: decision.deliveryContextId };
  }
  return {};
}

function applyBudgetRequest(
  usage: HarnessBudgetUsage,
  request: HarnessBudgetRequest
): HarnessBudgetUsage {
  return {
    ...usage,
    dailyCostUnitsUsed: usage.dailyCostUnitsUsed + (request.costUnits ?? 0),
    integrationCallsUsed: incrementNamedUsage(
      usage.integrationCallsUsed,
      request.integrationId,
      request.integrationCalls ?? 0
    ),
    loopCount: usage.loopCount + (request.loops ?? 0),
    modelCalls: usage.modelCalls + (request.modelCalls ?? 0),
    tokens: usage.tokens + (request.tokens ?? 0),
    toolCalls: usage.toolCalls + (request.toolCalls ?? 0),
    toolCallsByTool: incrementNamedUsage(
      usage.toolCallsByTool,
      request.toolId,
      request.toolCalls ?? 0
    ),
  };
}

function createDecisionRecord(
  input: { readonly runId: string; readonly threadId: string },
  decision: HarnessDecision,
  status: HarnessDecisionRecordStatus,
  seam: string
): HarnessDecisionRecord {
  return {
    decisionId: decision.decisionId,
    decisionRecordId: `${input.runId}:${decision.decisionId}`,
    decisionType: decision.type,
    reason: decision.rationale,
    runId: input.runId,
    seam,
    status,
    threadId: input.threadId,
  };
}

function createDecisionRecordForDecision(
  input: { readonly runId: string; readonly threadId: string },
  decision: HarnessDecision
): HarnessDecisionRecord {
  if (decision.type === 'stop') return createDecisionRecord(input, decision, 'applied', 'run_stop');
  if (decision.type === 'update_state') {
    return createDecisionRecord(
      input,
      decision,
      'applied',
      `state_update:${decision.statePatchRef}`
    );
  }
  if (decision.type === 'emit_event')
    return createDecisionRecord(input, decision, 'applied', `event_emit:${decision.eventType}`);
  if (decision.type === 'write_memory')
    return createDecisionRecord(input, decision, 'applied', createDownstreamSeam(decision));
  if (decision.type === 'create_schedule')
    return createDecisionRecord(input, decision, 'applied', createDownstreamSeam(decision));
  return createDecisionRecord(input, decision, 'pending', createDownstreamSeam(decision));
}

function createDownstreamSeam(decision: HarnessDecision): string {
  switch (decision.type) {
    case 'create_schedule':
      return `stage5_schedule_create:${decision.scheduleRequestRef}`;
    case 'emit_event':
      return `event_emit:${decision.eventType}`;
    case 'invoke_tool':
      return `stage6_tool_invoke:${decision.toolId}`;
    case 'request_human_approval':
      return `stage6_human_approval:${decision.approvalRef}`;
    case 'respond':
      return `stage7_delivery_response:${decision.deliveryContextId}`;
    case 'stop':
      return 'run_stop';
    case 'update_state':
      return `state_update:${decision.statePatchRef}`;
    case 'write_memory':
      return `stage4_memory_write:${decision.operationRef}`;
  }
}

function incrementNamedUsage(
  values: Readonly<Record<string, number>>,
  name: string | undefined,
  increment: number
): Readonly<Record<string, number>> {
  if (name === undefined || increment === 0) return values;
  const existingEntries = Object.entries(values);
  const current = existingEntries.find(([key]) => key === name)?.[1] ?? 0;
  return Object.fromEntries([
    ...existingEntries.filter(([key]) => key !== name),
    [name, current + increment],
  ]);
}
