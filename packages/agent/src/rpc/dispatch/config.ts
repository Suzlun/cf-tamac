import type {
  GetConfigRequest,
  GetConfigResponseSchema,
  UpdateConfigRequest,
  UpdateConfigResponseSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { getAIAgentDurableObjectStub } from '../../agent-routing';
import { createAgentCoreContext } from '../command-context';
import {
  mapConfigCommand,
  mapGetConfigResponse,
  mapUpdateConfigResponse,
  requireAgentId,
} from '../mappers/core';

import type { AgentWorkerEnv } from '../../env';
import type { MessageInitShape } from '@bufbuild/protobuf';

type UpdateConfigResponseInit = MessageInitShape<typeof UpdateConfigResponseSchema>;
type GetConfigResponseInit = MessageInitShape<typeof GetConfigResponseSchema>;

/**
 * AgentStateService.UpdateConfig を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った設定差分、idempotency key、security context です。
 * @returns generated UpdateConfigResponse の初期化値です。
 * @throws Agent ID や設定入力が不正な場合、または AIAgent 側の認可・永続化で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchUpdateConfig(env, request);
 * ```
 */
export async function dispatchUpdateConfig(
  env: AgentWorkerEnv,
  request: UpdateConfigRequest
): Promise<UpdateConfigResponseInit> {
  // 設定更新は Agent-local な command として処理し、Client D1 や外部 storage へ流しません。
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    idempotencyKey: request.idempotencyKey,
    method: 'UpdateConfig',
    security: request.security,
    service: 'cftamac.agent.v1.AgentStateService',
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).updateConfig({
    config: mapConfigCommand(request.config),
    context,
  });
  return mapUpdateConfigResponse(result);
}

/**
 * AgentStateService.GetConfig を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った Agent ID です。
 * @returns generated GetConfigResponse の初期化値です。
 * @throws Agent ID が空の場合、または AIAgent 側の参照・認可で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchGetConfig(env, request);
 * ```
 */
export async function dispatchGetConfig(
  env: AgentWorkerEnv,
  request: GetConfigRequest
): Promise<GetConfigResponseInit> {
  // Agent ID に対応する Durable Object から現在の config projection だけを取得します。
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'GetConfig',
    service: 'cftamac.agent.v1.AgentStateService',
  });
  const config = await getAIAgentDurableObjectStub(env, agentId).getConfig({ context });
  return mapGetConfigResponse(config);
}
