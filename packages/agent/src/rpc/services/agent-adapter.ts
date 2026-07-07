import { type IntegrationIngressService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import {
  dispatchPublishDeliveryResult,
  dispatchPublishIntegrationEvent,
  dispatchPublishToolResult,
} from '../dispatch/integration-ingress';

import type { AgentWorkerEnv } from '../../env';
import type { ServiceImpl } from '@connectrpc/connect';

/**
 * IntegrationIngressService の Provider callback handlers を Connect facade に接続します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @returns Connect router に登録する IntegrationIngressService 実装です。
 * @throws この関数自体は service object を組み立てるだけのため例外を投げません。
 */
export function createIntegrationIngressService(
  env: AgentWorkerEnv
): Partial<ServiceImpl<typeof IntegrationIngressService>> {
  return {
    publishDeliveryResult(request) {
      return dispatchPublishDeliveryResult(env, request);
    },
    publishEvent(request) {
      return dispatchPublishIntegrationEvent(env, request);
    },
    publishToolResult(request) {
      return dispatchPublishToolResult(env, request);
    },
  };
}
