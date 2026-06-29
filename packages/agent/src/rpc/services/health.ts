import { Code, ConnectError, type ServiceImpl } from '@connectrpc/connect';

import { type AgentHealthService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { dispatchAgentHealthCheck } from '../do-router';

import type { AgentWorkerEnv } from '../../env';

/**
 * Agent Connect facade へ登録する Health service 実装を作成します。
 *
 * @param env Agent Worker env。trust config diagnostic と Durable Object routing に使用します。
 * @returns generated `AgentHealthService` の `Check` 実装です。
 */
export function createAgentHealthService(
  env: AgentWorkerEnv
): Partial<ServiceImpl<typeof AgentHealthService>> {
  return {
    check(request) {
      const agentId = request.agentId.trim();
      if (agentId === '') {
        // health も Agent scope を必須にし、Agent-cross な匿名診断 endpoint にしません。
        throw new ConnectError(
          'agent_id is required for AgentHealthService.Check.',
          Code.InvalidArgument
        );
      }

      return dispatchAgentHealthCheck(env, {
        agentId,
        includeDependencies: request.includeDependencies,
      });
    },
  };
}
