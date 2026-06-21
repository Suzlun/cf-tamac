import { type AgentHealthService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { dispatchAgentHealthCheck } from '../do-router';

import type { AgentWorkerEnv } from '../../env';
import type { ServiceImpl } from '@connectrpc/connect';

/**
 * Create the implemented health service for the Agent Connect facade.
 */
export function createAgentHealthService(
  env: AgentWorkerEnv
): Partial<ServiceImpl<typeof AgentHealthService>> {
  return {
    check(request) {
      return dispatchAgentHealthCheck(env, request.agentId);
    },
  };
}
