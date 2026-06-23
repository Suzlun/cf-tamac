import { type AgentRunService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { dispatchCancelRun, dispatchGetRun, dispatchListRuns } from '../run-do-router';

import type { AgentWorkerEnv } from '../../env';
import type { ServiceImpl } from '@connectrpc/connect';

/**
 * Create the implemented Agent Run query/cancel service for the Connect facade.
 */
export function createAgentRunService(
  env: AgentWorkerEnv
): Partial<ServiceImpl<typeof AgentRunService>> {
  return {
    cancelRun(request) {
      return dispatchCancelRun(env, request);
    },
    getRun(request) {
      return dispatchGetRun(env, request);
    },
    listRuns(request) {
      return dispatchListRuns(env, request);
    },
  };
}
