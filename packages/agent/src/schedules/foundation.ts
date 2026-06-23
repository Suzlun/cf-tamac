/**
 * Agent-owned Schedule の永続 lifecycle status です。
 *
 * `active` は runtime callback を受け入れ、`completed` は one-shot が発火済み、
 * `cancelled` と `disabled` は以後の side effect を必ず止めます。
 */
export const scheduleStatuses = ['active', 'completed', 'cancelled', 'disabled'] as const;

/**
 * Schedule status value です。
 */
export type ScheduleStatus = (typeof scheduleStatuses)[number];

/**
 * Interval Schedule の overlap policy です。
 */
export const scheduleOverlapPolicies = ['skip', 'coalesce', 'queue-next'] as const;

/**
 * Schedule overlap policy value です。
 */
export type ScheduleOverlapPolicy = (typeof scheduleOverlapPolicies)[number];

/**
 * Schedule callback が Thread に追加する AgentEvent type です。
 */
export const scheduleTriggeredEventType = 'schedule.triggered';

/**
 * Agents SDK runtime callback が受け取る小さな payload です。
 */
export interface AgentScheduleCallbackPayload {
  readonly agentId: string;
  readonly scheduleId: string;
  readonly runtimeScheduleId?: string;
}
