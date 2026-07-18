import type { AgentAuditView, AgentCoreRequestContext, AgentPageView } from '../domain';
import type { ScheduleOverlapPolicy, ScheduleStatus } from './schedule-status';

/**
 * Agent-owned Schedule の安全な domain view です。
 *
 * @remarks
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
 *
 * @remarks
 * request context、schedule spec、Thread 指定、Integration callback identity を domain 層へ渡す入力です。
 * runtime schedule ID は SDK 登録後に storage へ bind するため、この command には含めません。
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
 *
 * @remarks
 * Agent context と schedule ID だけを受け取り、Agent-cross 検索や Client ledger 参照を許しません。
 */
export interface GetAgentScheduleQuery {
  readonly context: AgentCoreRequestContext;
  readonly scheduleId: string;
}

/**
 * Schedule 一覧 query です。
 *
 * @remarks
 * status、Thread、installation、page 条件はすべて Agent scope 内で適用します。
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
 *
 * @remarks
 * schedule ID、request context、任意 reason だけを持ち、runtime cancel は Durable Object helper が
 * result の runtimeScheduleId を使って実行します。
 */
export interface CancelAgentScheduleCommand {
  readonly context: AgentCoreRequestContext;
  readonly reason?: string;
  readonly scheduleId: string;
}

/**
 * Integration uninstall/disable から呼ばれる Schedule cleanup command です。
 *
 * @remarks
 * 対象 installation の schedule を cancelled または disabled に収束させ、runtime callback の追加発火を止めます。
 */
export interface CleanupInstallationSchedulesCommand {
  readonly context: AgentCoreRequestContext;
  readonly installationId: string;
  readonly reason?: string;
  readonly status: 'cancelled' | 'disabled';
}

/**
 * Agents SDK callback から呼ばれる internal fire command です。
 *
 * @remarks
 * runtime callback の fire 時刻と schedule ID だけを受け取り、Event append 可否は storage 状態で判定します。
 */
export interface FireAgentScheduleCommand {
  readonly fireAtMs: number;
  readonly scheduleId: string;
}

/**
 * Agents SDK に登録する runtime schedule plan です。
 *
 * @remarks
 * interval と one-shot の登録方法を分け、domain operation から SDK object そのものを返さないための境界型です。
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
 *
 * @remarks
 * 作成済み Schedule、audit、冪等 replay 状態に加え、未登録の場合だけ runtime plan を含めます。
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
 *
 * @remarks
 * Agent-owned Schedule view だけを返し、runtime schedule ID など内部 callback 管理値は公開しません。
 */
export interface GetAgentScheduleResult {
  readonly schedule: AgentScheduleView;
}

/**
 * ListSchedules の domain result です。
 *
 * @remarks
 * Agent-scoped cursor page と Schedule view 配列を返します。
 */
export interface ListAgentSchedulesResult {
  readonly page: AgentPageView;
  readonly schedules: readonly AgentScheduleView[];
}

/**
 * CancelSchedule の domain result です。
 *
 * @remarks
 * 取消後 Schedule view、audit、冪等 replay 状態、runtime cancel に必要な runtimeScheduleId を返します。
 */
export interface CancelAgentScheduleResult {
  readonly audit: AgentAuditView;
  readonly replayed: boolean;
  readonly runtimeScheduleId?: string;
  readonly schedule: AgentScheduleView;
}

/**
 * Integration cleanup の domain result です。
 *
 * @remarks
 * cleanup audit、対象 Schedule view、runtime cancel 対象 ID 一覧を返します。
 */
export interface CleanupInstallationSchedulesResult {
  readonly audit: AgentAuditView;
  readonly cancelledSchedules: readonly AgentScheduleView[];
  readonly runtimeScheduleIds: readonly string[];
}

/**
 * Schedule callback fire の domain result です。
 *
 * @remarks
 * callback tick の冪等性、Event append 有無、scheduler wake に使う Run ID、fire status を返します。
 */
export interface FireAgentScheduleResult {
  readonly eventAppended: boolean;
  readonly fireStatus: string;
  readonly replayed: boolean;
  readonly runId?: string;
  readonly schedule?: AgentScheduleView;
  readonly tickId: string;
}
