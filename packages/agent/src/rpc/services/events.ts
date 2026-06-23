import { type AgentEventService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { dispatchGetEvent, dispatchListEvents, dispatchPublishEvent } from '../do-router';

import type { AgentWorkerEnv } from '../../env';
import type { ServiceImpl } from '@connectrpc/connect';

/**
 * Create the implemented Event service for the Agent Connect facade.
 */
export function createAgentEventService(
  env: AgentWorkerEnv
): Partial<ServiceImpl<typeof AgentEventService>> {
  return {
    getEvent(request) {
      return dispatchGetEvent(env, request);
    },
    listEvents(request) {
      return dispatchListEvents(env, request);
    },
    publishEvent(request) {
      return dispatchPublishEvent(env, request);
    },
  };
}
