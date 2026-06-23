import type {
  CancelScheduleResponseSchema,
  CreateScheduleResponseSchema,
  GetScheduleResponseSchema,
  ListSchedulesResponseSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import type { AgentAuditView } from '../domain';
import type {
  AgentScheduleView,
  CancelAgentScheduleResult,
  CreateAgentScheduleResult,
  GetAgentScheduleResult,
  ListAgentSchedulesResult,
} from '../schedules';
import type { MessageInitShape } from '@bufbuild/protobuf';

/**
 * CreateSchedule の domain result を generated response init shape に変換します。
 */
export function mapCreateScheduleResponse(
  result: CreateAgentScheduleResult
): MessageInitShape<typeof CreateScheduleResponseSchema> {
  return mapScheduleMutationResponse(result);
}

/**
 * GetSchedule の domain result を generated response init shape に変換します。
 */
export function mapGetScheduleResponse(
  result: GetAgentScheduleResult
): MessageInitShape<typeof GetScheduleResponseSchema> {
  return { schedule: mapSchedule(result.schedule) };
}

/**
 * ListSchedules の domain result を generated response init shape に変換します。
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
 * CancelSchedule の domain result を generated response init shape に変換します。
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
