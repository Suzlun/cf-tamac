import { type AgentEventService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { dispatchGetEvent, dispatchListEvents, dispatchPublishEvent } from '../dispatch/events';

import type { AgentWorkerEnv } from '../../env';
import type { ServiceImpl } from '@connectrpc/connect';

/**
 * `createAgentEventService` は Agent Service の内部境界で利用する exported 関数です。
 *
 * @remarks
 * この関数は Agent-owned Durable Object / storage / RPC adapter の責務内で呼び出されます。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 * @param env Agent Worker の binding と Durable Object routing を含む環境です。
 * @returns Agent Event RPC の unary handler 群を含む Connect service 実装断片です。
 * @throws この関数自体は Connect service object を組み立てるだけのため例外を投げません。
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
