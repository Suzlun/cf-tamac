import { type AgentScheduleService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import {
  dispatchCancelSchedule,
  dispatchCreateSchedule,
  dispatchGetSchedule,
  dispatchListSchedules,
} from '../schedule-do-router';

import type { AgentWorkerEnv } from '../../env';
import type { ServiceImpl } from '@connectrpc/connect';

/**
 * Agent Schedule service handlers for the Connect facade.
 */
export function createAgentScheduleService(
  env: AgentWorkerEnv
): Partial<ServiceImpl<typeof AgentScheduleService>> {
  return {
    cancelSchedule(request) {
      return dispatchCancelSchedule(env, request);
    },
    createSchedule(request) {
      return dispatchCreateSchedule(env, request);
    },
    getSchedule(request) {
      return dispatchGetSchedule(env, request);
    },
    listSchedules(request) {
      return dispatchListSchedules(env, request);
    },
  };
}
