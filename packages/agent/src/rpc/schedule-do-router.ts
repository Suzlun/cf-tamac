import type {
  CancelScheduleRequest,
  CancelScheduleResponseSchema,
  CreateScheduleRequest,
  CreateScheduleResponseSchema,
  GetScheduleRequest,
  GetScheduleResponseSchema,
  ListSchedulesRequest,
  ListSchedulesResponseSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { getAIAgentDurableObjectStub } from '../agent-routing';

import { createAgentCoreContext } from './command-context';
import { requireAgentId } from './message-mappers';
import {
  mapCancelScheduleResponse,
  mapCreateScheduleResponse,
  mapGetScheduleResponse,
  mapListSchedulesResponse,
} from './schedule-message-mappers';

import type { AgentWorkerEnv } from '../env';
import type { MessageInitShape } from '@bufbuild/protobuf';

type CreateScheduleResponseInit = MessageInitShape<typeof CreateScheduleResponseSchema>;
type GetScheduleResponseInit = MessageInitShape<typeof GetScheduleResponseSchema>;
type ListSchedulesResponseInit = MessageInitShape<typeof ListSchedulesResponseSchema>;
type CancelScheduleResponseInit = MessageInitShape<typeof CancelScheduleResponseSchema>;

const scheduleServiceName = 'cftamac.agent.v1.AgentScheduleService';

/**
 * CreateSchedule RPC を Agent-owned Durable Object へ dispatch します。
 */
export async function dispatchCreateSchedule(
  env: AgentWorkerEnv,
  request: CreateScheduleRequest
): Promise<CreateScheduleResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    idempotencyKey: request.idempotencyKey,
    method: 'CreateSchedule',
    security: request.security,
    service: scheduleServiceName,
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).createAgentSchedule({
    callbackIdentity: request.callbackIdentity,
    context,
    installationId: request.installationId,
    overlapPolicy: request.overlapPolicy,
    scheduleSpec: request.scheduleSpec,
    threadId: request.threadId,
    threadKey: request.threadKey,
  });
  return mapCreateScheduleResponse(result);
}

/**
 * GetSchedule RPC を Agent-owned Durable Object へ dispatch します。
 */
export async function dispatchGetSchedule(
  env: AgentWorkerEnv,
  request: GetScheduleRequest
): Promise<GetScheduleResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'GetSchedule',
    service: scheduleServiceName,
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).getAgentSchedule({
    context,
    scheduleId: request.scheduleId,
  });
  return mapGetScheduleResponse(result);
}

/**
 * ListSchedules RPC を Agent-owned Durable Object へ dispatch します。
 */
export async function dispatchListSchedules(
  env: AgentWorkerEnv,
  request: ListSchedulesRequest
): Promise<ListSchedulesResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'ListSchedules',
    service: scheduleServiceName,
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).listAgentSchedules({
    context,
    installationId: request.installationId,
    pageCursorScope: request.page?.cursorScope,
    pageSize: request.page?.pageSize,
    pageToken: request.page?.pageToken,
    status: request.status,
    threadId: request.threadId,
  });
  return mapListSchedulesResponse(result);
}

/**
 * CancelSchedule RPC を Agent-owned Durable Object へ dispatch します。
 */
export async function dispatchCancelSchedule(
  env: AgentWorkerEnv,
  request: CancelScheduleRequest
): Promise<CancelScheduleResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    idempotencyKey: request.idempotencyKey,
    method: 'CancelSchedule',
    security: request.security,
    service: scheduleServiceName,
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).cancelAgentSchedule({
    context,
    reason: request.reason,
    scheduleId: request.scheduleId,
  });
  return mapCancelScheduleResponse(result);
}
