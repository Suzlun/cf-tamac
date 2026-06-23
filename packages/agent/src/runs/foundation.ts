/**
 * AgentRun statuses used by the runtime scheduler state machine.
 */
export const runStatuses = [
  'pending',
  'running',
  'waiting',
  'completed',
  'failed',
  'cancelled',
  'interrupted',
] as const;

/**
 * AgentRun status value.
 */
export type RunStatus = (typeof runStatuses)[number];

/**
 * AgentRun statuses that occupy the one active Run slot.
 */
export const activeRunStatuses = ['running'] as const satisfies readonly RunStatus[];

/**
 * Pending run input snapshot reference.
 */
export interface RunInputSnapshot {
  readonly runId: string;
  readonly agentId: string;
  readonly threadId: string;
  readonly triggerEventId: string;
  readonly triggerEventEndSequence: number;
  readonly triggerEventStartSequence: number;
  readonly configVersion: number;
  readonly integrationVersion: number;
  readonly toolSetVersion: number;
  readonly uncompactedUpperSequence: number;
  readonly latestReadyCompactionRef?: string;
  readonly snapshotRef?: string;
  readonly threadMemoryRef?: string;
  readonly threadMemoryVersion: number;
}

/**
 * AgentRun statuses that still represent unfinished work.
 */
export const unfinishedRunStatuses = ['pending', 'running', 'waiting'] as const;

/**
 * AgentRun statuses that reject stale result commits.
 */
export const terminalRunStatuses = ['completed', 'failed', 'cancelled', 'interrupted'] as const;

/**
 * AgentRun state transition request.
 */
export interface AgentRunStateTransition {
  readonly from: RunStatus;
  readonly to: RunStatus;
}

/**
 * Minimal fields used by the scheduler fairness comparator.
 */
export interface AgentRunSchedulingCandidate {
  readonly lastServedAtMs: number | null;
  readonly pendingSinceMs: number;
  readonly priority: number;
  readonly runId: string;
}

/**
 * Return whether a Run status is terminal.
 */
export function isTerminalRunStatus(status: RunStatus): boolean {
  return terminalRunStatuses.includes(status as (typeof terminalRunStatuses)[number]);
}

/**
 * Return whether a Run status occupies the active Run slot.
 */
export function isActiveRunStatus(status: RunStatus): boolean {
  return activeRunStatuses.includes(status as (typeof activeRunStatuses)[number]);
}

/**
 * Return whether a Run status has released the Agent active slot.
 */
export function hasReleasedActiveRunSlot(status: RunStatus): boolean {
  return status === 'waiting' || isTerminalRunStatus(status);
}

/**
 * Compare pending Runs by scheduler fairness rules.
 */
export function compareAgentRunsForScheduling(
  left: AgentRunSchedulingCandidate,
  right: AgentRunSchedulingCandidate
): number {
  const priorityDiff = right.priority - left.priority;
  if (priorityDiff !== 0) return priorityDiff;
  const lastServedDiff =
    normalizeLastServedAt(left.lastServedAtMs) - normalizeLastServedAt(right.lastServedAtMs);
  if (lastServedDiff !== 0) return lastServedDiff;
  const pendingDiff = left.pendingSinceMs - right.pendingSinceMs;
  if (pendingDiff !== 0) return pendingDiff;
  return left.runId.localeCompare(right.runId);
}

/**
 * Return whether the requested AgentRun state transition is allowed.
 */
export function canTransitionAgentRunStatus(transition: AgentRunStateTransition): boolean {
  if (transition.from === transition.to) {
    return true;
  }
  if (isTerminalRunStatus(transition.from)) {
    return false;
  }
  if (transition.from === 'pending') {
    return transition.to === 'running' || transition.to === 'cancelled';
  }
  if (transition.from === 'running' || transition.from === 'waiting') {
    return transition.to !== 'pending';
  }
  return false;
}

/**
 * Assert that a persisted value is a known AgentRun status.
 */
export function assertRunStatus(value: string): asserts value is RunStatus {
  if (!runStatuses.includes(value as RunStatus)) {
    throw new TypeError(`Unsupported AgentRun status: ${value}`);
  }
}

/**
 * Assert that the AgentRun state machine permits the transition.
 */
export function assertAgentRunStatusTransition(transition: AgentRunStateTransition): void {
  if (!canTransitionAgentRunStatus(transition)) {
    throw new TypeError(`Invalid AgentRun transition: ${transition.from} -> ${transition.to}`);
  }
}

function normalizeLastServedAt(value: number | null): number {
  return value ?? Number.NEGATIVE_INFINITY;
}
