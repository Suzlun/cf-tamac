/**
 * Agent-owned Schedule の永続 lifecycle status です。
 *
 * @remarks
 * `active` は runtime callback を受け入れ、`completed` は one-shot が発火済み、
 * `cancelled` と `disabled` は以後の side effect を必ず止めます。
 */
export const scheduleStatuses = ['active', 'completed', 'cancelled', 'disabled'] as const;

/**
 * Schedule status value です。
 *
 * @remarks
 * `scheduleStatuses` から導出し、runtime callback と repository row の lifecycle status を同じ集合へ固定します。
 */
export type ScheduleStatus = (typeof scheduleStatuses)[number];

/**
 * Interval Schedule の overlap policy です。
 *
 * @remarks
 * active Run がある tick を skip、coalesce、queue-next のどれで処理するかを表します。
 */
export const scheduleOverlapPolicies = ['skip', 'coalesce', 'queue-next'] as const;

/**
 * Schedule overlap policy value です。
 *
 * @remarks
 * `scheduleOverlapPolicies` から導出し、RPC 入力正規化と fire decision が同じ policy 値だけを扱うようにします。
 */
export type ScheduleOverlapPolicy = (typeof scheduleOverlapPolicies)[number];

/**
 * Schedule callback が Thread に追加する AgentEvent type です。
 *
 * @remarks
 * Agents SDK runtime callback を Agent Event mailbox へ変換するときの固定 Event type です。
 */
export const scheduleTriggeredEventType = 'schedule.triggered';

/**
 * Agents SDK runtime callback が受け取る小さな payload です。
 *
 * @remarks
 * public Durable Object の HTTP surface を増やさず、SDK callback から対象 Agent/Schedule/runtime schedule だけを
 * 復元するために必要な最小 metadata です。
 */
export interface AgentScheduleCallbackPayload {
  readonly agentId: string;
  readonly scheduleId: string;
  readonly runtimeScheduleId?: string;
}
