import { Code, ConnectError, type ServiceImpl } from '@connectrpc/connect';

import { type AgentHealthService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { dispatchAgentHealthCheck } from '../do-router';

import type { AgentWorkerEnv } from '../../env';

/**
 * Create the implemented health service for the Agent Connect facade.
 */
export function createAgentHealthService(
  env: AgentWorkerEnv
): Partial<ServiceImpl<typeof AgentHealthService>> {
  return {
    check(request) {
      const agentId = request.agentId.trim();
      if (agentId === '') {
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
