import type {
  CancelScheduleResponseSchema,
  CreateScheduleResponseSchema,
  GetScheduleResponseSchema,
  ListSchedulesResponseSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import type { AgentAuditView } from '../../domain';
import type {
  AgentScheduleView,
  CancelAgentScheduleResult,
  CreateAgentScheduleResult,
  GetAgentScheduleResult,
  ListAgentSchedulesResult,
} from '../../schedules';
import type { MessageInitShape } from '@bufbuild/protobuf';

/**
 * CreateSchedule の domain result を generated response 初期化値に変換します。
 *
 * @param result 作成済み Schedule、audit、runtime registration、replay 状態を含む domain result です。
 * @returns `CreateScheduleResponseSchema` に渡せる plain object です。
 * @throws この関数は domain result の純粋変換だけを行うため例外を投げません。
 * @example
 * ```ts
 * const response = mapCreateScheduleResponse(result);
 * ```
 */
export function mapCreateScheduleResponse(
  result: CreateAgentScheduleResult
): MessageInitShape<typeof CreateScheduleResponseSchema> {
  return mapScheduleMutationResponse(result);
}

/**
 * GetSchedule の domain result を generated response 初期化値に変換します。
 *
 * @param result 取得した Agent-owned Schedule view を含む domain result です。
 * @returns `GetScheduleResponseSchema` に渡せる plain object です。
 * @throws この関数は Schedule view の写像だけを行うため例外を投げません。
 * @example
 * ```ts
 * const response = mapGetScheduleResponse(result);
 * ```
 */
export function mapGetScheduleResponse(
  result: GetAgentScheduleResult
): MessageInitShape<typeof GetScheduleResponseSchema> {
  return { schedule: mapSchedule(result.schedule) };
}

/**
 * ListSchedules の domain result を generated response 初期化値に変換します。
 *
 * @param result Agent-scoped Schedule 配列と page metadata を含む domain result です。
 * @returns `ListSchedulesResponseSchema` に渡せる plain object です。
 * @throws この関数は list result の純粋変換だけを行うため例外を投げません。
 * @example
 * ```ts
 * const response = mapListSchedulesResponse(result);
 * ```
 */
export function mapListSchedulesResponse(
  result: ListAgentSchedulesResult
): MessageInitShape<typeof ListSchedulesResponseSchema> {
  return {
    page: result.page,
    schedules: result.schedules.map(mapSchedule),
  };
}

/**
 * CancelSchedule の domain result を generated response 初期化値に変換します。
 *
 * @param result 取消後 Schedule、audit、runtime schedule ID、replay 状態を含む domain result です。
 * @returns `CancelScheduleResponseSchema` に渡せる plain object です。
 * @throws この関数は mutation 結果の写像だけを行うため例外を投げません。
 * @example
 * ```ts
 * const response = mapCancelScheduleResponse(result);
 * ```
 */
export function mapCancelScheduleResponse(
  result: CancelAgentScheduleResult
): MessageInitShape<typeof CancelScheduleResponseSchema> {
  const response = mapScheduleMutationResponse(result);
  return response;
}

function mapScheduleMutationResponse(
  result: CreateAgentScheduleResult | CancelAgentScheduleResult
) {
  return {
    audit: mapScheduleAudit(result.audit),
    replayed: result.replayed,
    schedule: mapSchedule(result.schedule),
  };
}

function mapSchedule(schedule: AgentScheduleView) {
  return {
    agentId: schedule.agentId,
    auditEventId: schedule.auditEventId,
    callbackIdentity: schedule.callbackIdentity,
    cancelledAtUnixMs: optionalBigInt(schedule.cancelledAtMs),
    createdAtUnixMs: BigInt(schedule.createdAtMs),
    createdByPrincipalId: schedule.createdByPrincipalId,
    installationId: schedule.installationId,
    lastFireAtUnixMs: optionalBigInt(schedule.lastFireAtMs),
    nextFireAtUnixMs: optionalBigInt(schedule.nextFireAtMs),
    overlapPolicy: schedule.overlapPolicy,
    scheduleId: schedule.scheduleId,
    scheduleSpec: schedule.scheduleSpec,
    status: schedule.status,
    threadId: schedule.threadId,
    threadKey: schedule.threadKey,
  };
}

function mapScheduleAudit(audit: AgentAuditView | undefined) {
  if (audit === undefined) return undefined;
  return {
    agentId: audit.agentId,
    auditEventId: audit.auditEventId,
    correlationId: audit.correlationId,
    occurredAtUnixMs: BigInt(audit.occurredAtMs),
    operation: audit.operation,
    principalId: audit.principalId,
    result: audit.result,
    safeDetailRef: audit.safeDetailRef,
    systemThreadId: audit.systemThreadId,
  };
}

function optionalBigInt(value: number | undefined): bigint | undefined {
  return value === undefined ? undefined : BigInt(value);
}
