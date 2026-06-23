import type { AgentToolService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import {
  dispatchApproveInvocation,
  dispatchGetInvocation,
  dispatchListInvocations,
  dispatchListTools,
  dispatchRejectInvocation,
} from '../tool-do-router';

import type { AgentWorkerEnv } from '../../env';
import type { ServiceImpl } from '@connectrpc/connect';

/**
 * AgentToolService の generated descriptor と AIAgent Durable Object dispatcher を接続します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @returns Connect router に登録する AgentToolService 実装です。
 * @throws 個々の RPC handler 内で Agent ID 検証、認証、final authorization、storage 処理に失敗した場合は Connect error 変換層へ例外を伝播します。
 * @example
 * ```ts
 * router.service(AgentToolService, createAgentToolService(env));
 * ```
 */
export function createAgentToolService(
  env: AgentWorkerEnv
): Partial<ServiceImpl<typeof AgentToolService>> {
  return {
    approveInvocation(request) {
      return dispatchApproveInvocation(env, request);
    },
    getInvocation(request) {
      return dispatchGetInvocation(env, request);
    },
    listInvocations(request) {
      return dispatchListInvocations(env, request);
    },
    listTools(request) {
      return dispatchListTools(env, request);
    },
    rejectInvocation(request) {
      return dispatchRejectInvocation(env, request);
    },
  };
}
