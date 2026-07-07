import { type AgentRunService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { dispatchCancelRun, dispatchGetRun, dispatchListRuns } from '../dispatch/runs';

import type { AgentWorkerEnv } from '../../env';
import type { ServiceImpl } from '@connectrpc/connect';

/**
 * AgentRunService の generated descriptor と AIAgent Durable Object dispatcher を接続します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @returns Connect router に登録する AgentRunService 実装です。
 * @throws 個々の RPC handler 内で Agent ID 検証、認証、final authorization、storage 処理に失敗した場合は Connect error 変換層へ例外を伝播します。
 * @example
 * ```ts
 * router.service(AgentRunService, createAgentRunService(env));
 * ```
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
