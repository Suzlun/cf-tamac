import { type AgentStateService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { dispatchGetConfig, dispatchGetState, dispatchUpdateConfig } from '../do-router';

import type { AgentWorkerEnv } from '../../env';
import type { ServiceImpl } from '@connectrpc/connect';

/**
 * Create the implemented Agent state/config service for the Agent Connect facade.
 */
export function createAgentStateService(
  env: AgentWorkerEnv
): Partial<ServiceImpl<typeof AgentStateService>> {
  return {
    getConfig(request) {
      return dispatchGetConfig(env, request);
    },
    getState(request) {
      return dispatchGetState(env, request);
    },
    updateConfig(request) {
      return dispatchUpdateConfig(env, request);
    },
  };
}
