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

import { getAIAgentDurableObjectStub } from '../../agent-routing';
import { createAgentCoreContext } from '../command-context';
import { requireAgentId } from '../mappers/core';
import {
  mapCancelScheduleResponse,
  mapCreateScheduleResponse,
  mapGetScheduleResponse,
  mapListSchedulesResponse,
} from '../mappers/schedules';

import type { AgentWorkerEnv } from '../../env';
import type { MessageInitShape } from '@bufbuild/protobuf';

type CreateScheduleResponseInit = MessageInitShape<typeof CreateScheduleResponseSchema>;
type GetScheduleResponseInit = MessageInitShape<typeof GetScheduleResponseSchema>;
type ListSchedulesResponseInit = MessageInitShape<typeof ListSchedulesResponseSchema>;
type CancelScheduleResponseInit = MessageInitShape<typeof CancelScheduleResponseSchema>;

const scheduleServiceName = 'cftamac.agent.v1.AgentScheduleService';

/**
 * AgentScheduleService.CreateSchedule を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った Thread context、schedule spec、callback identity、idempotency key です。
 * @returns generated CreateScheduleResponse の初期化値です。
 * @throws Agent ID、Thread context、schedule spec、idempotency key、final authorization のいずれかが不正な場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchCreateSchedule(env, request);
 * ```
 */
export async function dispatchCreateSchedule(
  env: AgentWorkerEnv,
  request: CreateScheduleRequest
): Promise<CreateScheduleResponseInit> {
  // Schedule 作成は Agent ID scope を必須化し、scheduler state を AIAgent Durable Object 内へ閉じます。
  const agentId = requireAgentId(request.agentId);
  // mutation metadata と security metadata を context 化し、idempotency/replay 判定を Durable Object 側へ渡します。
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    idempotencyKey: request.idempotencyKey,
    method: 'CreateSchedule',
    security: request.security,
    service: scheduleServiceName,
  });
  // Durable Object public method の createAgentSchedule へ generated request の schedule 入力を橋渡しします。
  const result = await getAIAgentDurableObjectStub(env, agentId).createAgentSchedule({
    callbackIdentity: request.callbackIdentity,
    context,
    installationId: request.installationId,
    overlapPolicy: request.overlapPolicy,
    scheduleSpec: request.scheduleSpec,
    threadId: request.threadId,
    threadKey: request.threadKey,
  });
  // Schedule 作成結果を generated RPC response init へ変換します。
  return mapCreateScheduleResponse(result);
}

/**
 * AgentScheduleService.GetSchedule を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った Agent scope と Schedule ID です。
 * @returns generated GetScheduleResponse の初期化値です。
 * @throws Agent ID や Schedule ID が不正な場合、または AIAgent 側の参照・認可で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchGetSchedule(env, request);
 * ```
 */
export async function dispatchGetSchedule(
  env: AgentWorkerEnv,
  request: GetScheduleRequest
): Promise<GetScheduleResponseInit> {
  // Schedule 参照は Agent-owned scheduler storage に限定し、Agent 横断参照を作りません。
  const agentId = requireAgentId(request.agentId);
  // query でも service/method と request digest を context 化し、監査情報を揃えます。
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'GetSchedule',
    service: scheduleServiceName,
  });
  // Durable Object public method の getAgentSchedule で Schedule ID scope を検証します。
  const result = await getAIAgentDurableObjectStub(env, agentId).getAgentSchedule({
    context,
    scheduleId: request.scheduleId,
  });
  // Schedule domain result を generated RPC response init へ変換します。
  return mapGetScheduleResponse(result);
}

/**
 * AgentScheduleService.ListSchedules を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った installation/thread/status/page filter です。
 * @returns generated ListSchedulesResponse の初期化値です。
 * @throws pagination cursor scope が filter と一致しない場合、または AIAgent 側の参照・認可で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchListSchedules(env, request);
 * ```
 */
export async function dispatchListSchedules(
  env: AgentWorkerEnv,
  request: ListSchedulesRequest
): Promise<ListSchedulesResponseInit> {
  // List query は Agent ID scope 内の scheduler storage だけを対象にします。
  const agentId = requireAgentId(request.agentId);
  // filter と pagination を含む request digest を context に含め、cursor 監査を可能にします。
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'ListSchedules',
    service: scheduleServiceName,
  });
  // Durable Object public method の listAgentSchedules に generated request の filter を渡します。
  const result = await getAIAgentDurableObjectStub(env, agentId).listAgentSchedules({
    context,
    installationId: request.installationId,
    pageCursorScope: request.page?.cursorScope,
    pageSize: request.page?.pageSize,
    pageToken: request.page?.pageToken,
    status: request.status,
    threadId: request.threadId,
  });
  // Schedule page result を generated RPC response init に統一します。
  return mapListSchedulesResponse(result);
}

/**
 * AgentScheduleService.CancelSchedule を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った Schedule ID、idempotency key、取消理由です。
 * @returns generated CancelScheduleResponse の初期化値です。
 * @throws Agent ID、Schedule ID、idempotency key、final authorization、状態遷移のいずれかが不正な場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchCancelSchedule(env, request);
 * ```
 */
export async function dispatchCancelSchedule(
  env: AgentWorkerEnv,
  request: CancelScheduleRequest
): Promise<CancelScheduleResponseInit> {
  // Schedule 取消は mutation として idempotency key と security metadata を Durable Object 側へ渡します。
  const agentId = requireAgentId(request.agentId);
  // cancel request の digest と認可情報を context に固定し、replay と audit の入力を揃えます。
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    idempotencyKey: request.idempotencyKey,
    method: 'CancelSchedule',
    security: request.security,
    service: scheduleServiceName,
  });
  // Durable Object public method の cancelAgentSchedule で future firing の抑止と audit を処理します。
  const result = await getAIAgentDurableObjectStub(env, agentId).cancelAgentSchedule({
    context,
    reason: request.reason,
    scheduleId: request.scheduleId,
  });
  // Cancel result を generated RPC response init へ変換します。
  return mapCancelScheduleResponse(result);
}
