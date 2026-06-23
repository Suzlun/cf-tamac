import { type AgentLifecycleService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import {
  dispatchDestroyAgent,
  dispatchGetAgent,
  dispatchInitializeAgent,
  dispatchRotateAgentCredential,
} from '../do-router';

import type { AgentWorkerEnv } from '../../env';
import type { ServiceImpl } from '@connectrpc/connect';

/**
 * Create the implemented lifecycle service for the Agent Connect facade.
 */
export function createAgentLifecycleService(
  env: AgentWorkerEnv
): Partial<ServiceImpl<typeof AgentLifecycleService>> {
  return {
    destroyAgent(request) {
      return dispatchDestroyAgent(env, request);
    },
    getAgent(request) {
      return dispatchGetAgent(env, request);
    },
    initializeAgent(request) {
      return dispatchInitializeAgent(env, request);
    },
    rotateAgentCredential(request) {
      return dispatchRotateAgentCredential(env, request);
    },
  };
}
