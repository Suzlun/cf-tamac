import { type AgentStateService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { dispatchGetConfig, dispatchUpdateConfig } from '../dispatch/config';
import { dispatchGetState } from '../dispatch/state';

import type { AgentWorkerEnv } from '../../env';
import type { ServiceImpl } from '@connectrpc/connect';

/**
 * `createAgentStateService` は Agent Service の内部境界で利用する exported 関数です。
 *
 * @remarks
 * この関数は Agent-owned Durable Object / storage / RPC adapter の責務内で呼び出されます。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 * @param env Agent Worker の binding と Durable Object routing を含む環境です。
 * @returns Agent state RPC の unary handler 群を含む Connect service 実装断片です。
 * @throws この関数自体は Connect service object を組み立てるだけのため例外を投げません。
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
