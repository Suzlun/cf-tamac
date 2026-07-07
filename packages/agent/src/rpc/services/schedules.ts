import { type AgentScheduleService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import {
  dispatchCancelSchedule,
  dispatchCreateSchedule,
  dispatchGetSchedule,
  dispatchListSchedules,
} from '../dispatch/schedules';

import type { AgentWorkerEnv } from '../../env';
import type { ServiceImpl } from '@connectrpc/connect';

/**
 * AgentScheduleService の generated descriptor と AIAgent Durable Object dispatcher を接続します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @returns Connect router に登録する AgentScheduleService 実装です。
 * @throws 個々の RPC handler 内で Agent ID 検証、認証、final authorization、storage 処理に失敗した場合は Connect error 変換層へ例外を伝播します。
 * @example
 * ```ts
 * router.service(AgentScheduleService, createAgentScheduleService(env));
 * ```
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
