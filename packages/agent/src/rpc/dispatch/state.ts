import type {
  GetStateRequest,
  GetStateResponseSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { getAIAgentDurableObjectStub } from '../../agent-routing';
import { createAgentCoreContext } from '../command-context';
import { mapGetStateResponse, requireAgentId } from '../mappers/core';

import type { AgentWorkerEnv } from '../../env';
import type { MessageInitShape } from '@bufbuild/protobuf';

type GetStateResponseInit = MessageInitShape<typeof GetStateResponseSchema>;

/**
 * AgentStateService.GetState を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った Agent ID です。
 * @returns generated GetStateResponse の初期化値です。
 * @throws Agent ID が空の場合、または AIAgent 側の参照・認可で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchGetState(env, request);
 * ```
 */
export async function dispatchGetState(
  env: AgentWorkerEnv,
  request: GetStateRequest
): Promise<GetStateResponseInit> {
  // state snapshot は Agent-owned Durable Object の現在状態だけから構築します。
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'GetState',
    service: 'cftamac.agent.v1.AgentStateService',
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).getState({ context });
  return mapGetStateResponse(result);
}
