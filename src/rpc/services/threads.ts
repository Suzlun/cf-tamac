import { type AgentThreadService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import {
  dispatchGetLatestCompaction,
  dispatchGetThread,
  dispatchGetThreadMemory,
  dispatchListSections,
  dispatchListThreads,
  dispatchSearchThreadHistory,
} from '../dispatch/threads';

import type { AgentWorkerEnv } from '../../env';
import type { ServiceImpl } from '@connectrpc/connect';

/**
 * `createAgentThreadService` は Agent Service の内部境界で利用する exported 関数です。
 *
 * @remarks
 * この関数は Agent-owned Durable Object / storage / RPC adapter の責務内で呼び出されます。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 * @param env Agent Worker の binding と Durable Object routing を含む環境です。
 * @returns Agent Thread RPC の unary handler 群を含む Connect service 実装断片です。
 * @throws この関数自体は Connect service object を組み立てるだけのため例外を投げません。
 */
export function createAgentThreadService(
  env: AgentWorkerEnv
): Partial<ServiceImpl<typeof AgentThreadService>> {
  return {
    getLatestCompaction(request) {
      return dispatchGetLatestCompaction(env, request);
    },
    getThread(request) {
      return dispatchGetThread(env, request);
    },
    getThreadMemory(request) {
      return dispatchGetThreadMemory(env, request);
    },
    listSections(request) {
      return dispatchListSections(env, request);
    },
    listThreads(request) {
      return dispatchListThreads(env, request);
    },
    searchThreadHistory(request) {
      return dispatchSearchThreadHistory(env, request);
    },
  };
}
