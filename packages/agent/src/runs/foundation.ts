/**
 * Minimal AgentRun statuses used by the foundation scheduler.
 */
export const runStatuses = ['pending', 'running', 'completed', 'failed', 'cancelled'] as const;

/**
 * AgentRun status value.
 */
export type RunStatus = (typeof runStatuses)[number];

/**
 * Pending run input snapshot reference.
 */
export interface RunInputSnapshot {
  readonly runId: string;
  readonly agentId: string;
  readonly threadId: string;
  readonly triggerEventId: string;
  readonly snapshotRef?: string;
}
