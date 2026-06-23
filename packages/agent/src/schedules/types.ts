import type { AgentAuditView, AgentCoreRequestContext, AgentPageView } from '../domain';
import type { ScheduleOverlapPolicy, ScheduleStatus } from './foundation';

/**
 * Agent-owned Schedule の安全な domain view です。
 *
 * public RPC へ返す値だけを含み、runtime schedule id などの内部 callback 管理値は含めません。
 */
export interface AgentScheduleView {
  readonly agentId: string;
  readonly auditEventId?: string;
  readonly callbackIdentity?: string;
  readonly cancelledAtMs?: number;
  readonly createdAtMs: number;
  readonly createdByPrincipalId?: string;
  readonly installationId?: string;
  readonly lastFireAtMs?: number;
  readonly nextFireAtMs?: number;
  readonly overlapPolicy: ScheduleOverlapPolicy;
  readonly scheduleId: string;
  readonly scheduleSpec: string;
  readonly status: ScheduleStatus;
  readonly threadId: string;
  readonly threadKey?: string;
}

/**
 * RPC CreateSchedule が AIAgent Durable Object へ渡す command です。
 */
export interface CreateAgentScheduleCommand {
  readonly callbackIdentity?: string;
  readonly context: AgentCoreRequestContext;
  readonly installationId?: string;
  readonly overlapPolicy?: string;
  readonly scheduleSpec: string;
  readonly threadId?: string;
  readonly threadKey?: string;
}

/**
 * Schedule を一件取得する query です。
 */
export interface GetAgentScheduleQuery {
  readonly context: AgentCoreRequestContext;
  readonly scheduleId: string;
}

/**
 * Schedule 一覧 query です。
 */
export interface ListAgentSchedulesQuery {
  readonly context: AgentCoreRequestContext;
  readonly installationId?: string;
  readonly pageCursorScope?: string;
  readonly pageSize?: number;
  readonly pageToken?: string;
  readonly status?: string;
  readonly threadId?: string;
}

/**
 * RPC CancelSchedule が AIAgent Durable Object へ渡す command です。
 */
export interface CancelAgentScheduleCommand {
  readonly context: AgentCoreRequestContext;
  readonly reason?: string;
  readonly scheduleId: string;
}

/**
 * Integration uninstall/disable から呼ばれる Schedule cleanup command です。
 */
export interface CleanupInstallationSchedulesCommand {
  readonly context: AgentCoreRequestContext;
  readonly installationId: string;
  readonly reason?: string;
  readonly status: 'cancelled' | 'disabled';
}

/**
 * Agents SDK callback から呼ばれる internal fire command です。
 */
export interface FireAgentScheduleCommand {
  readonly fireAtMs: number;
  readonly scheduleId: string;
}

/**
 * Agents SDK に登録する runtime schedule plan です。
 */
export type AgentScheduleRuntimePlan =
  | {
      readonly intervalSeconds: number;
      readonly kind: 'interval';
      readonly nextFireAtMs: number;
    }
  | {
      readonly kind: 'one_shot';
      readonly nextFireAtMs: number;
      readonly when: Date | number;
    };

/**
 * CreateSchedule の domain result です。
 */
export interface CreateAgentScheduleResult {
  readonly audit: AgentAuditView;
  readonly replayed: boolean;
  readonly runtimePlan?: AgentScheduleRuntimePlan;
  readonly runtimeScheduleId?: string;
  readonly schedule: AgentScheduleView;
}

/**
 * GetSchedule の domain result です。
 */
export interface GetAgentScheduleResult {
  readonly schedule: AgentScheduleView;
}

/**
 * ListSchedules の domain result です。
 */
export interface ListAgentSchedulesResult {
  readonly page: AgentPageView;
  readonly schedules: readonly AgentScheduleView[];
}

/**
 * CancelSchedule の domain result です。
 */
export interface CancelAgentScheduleResult {
  readonly audit: AgentAuditView;
  readonly replayed: boolean;
  readonly runtimeScheduleId?: string;
  readonly schedule: AgentScheduleView;
}

/**
 * Integration cleanup の domain result です。
 */
export interface CleanupInstallationSchedulesResult {
  readonly audit: AgentAuditView;
  readonly cancelledSchedules: readonly AgentScheduleView[];
  readonly runtimeScheduleIds: readonly string[];
}

/**
 * Schedule callback fire の domain result です。
 */
export interface FireAgentScheduleResult {
  readonly eventAppended: boolean;
  readonly fireStatus: string;
  readonly replayed: boolean;
  readonly runId?: string;
  readonly schedule?: AgentScheduleView;
  readonly tickId: string;
}
