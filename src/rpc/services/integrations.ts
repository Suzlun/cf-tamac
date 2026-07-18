import { type AgentIntegrationService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import {
  dispatchCreateAdapterConnection,
  dispatchDeleteAdapterConnection,
  dispatchGetInstallation,
  dispatchInstallIntegration,
  dispatchListAdapterConnections,
  dispatchListInstallations,
  dispatchUninstallIntegration,
} from '../dispatch/integrations';

import type { AgentWorkerEnv } from '../../env';
import type { ServiceImpl } from '@connectrpc/connect';

/**
 * AgentIntegrationService の generated descriptor と AIAgent Durable Object dispatcher を接続します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @returns Connect router に登録する AgentIntegrationService 実装です。
 * @throws この関数自体は service object を組み立てるだけのため例外を投げません。
 */
export function createAgentIntegrationService(
  env: AgentWorkerEnv
): Partial<ServiceImpl<typeof AgentIntegrationService>> {
  return {
    createAdapterConnection(request) {
      return dispatchCreateAdapterConnection(env, request);
    },
    deleteAdapterConnection(request) {
      return dispatchDeleteAdapterConnection(env, request);
    },
    getInstallation(request) {
      return dispatchGetInstallation(env, request);
    },
    installIntegration(request) {
      return dispatchInstallIntegration(env, request);
    },
    listAdapterConnections(request) {
      return dispatchListAdapterConnections(env, request);
    },
    listInstallations(request) {
      return dispatchListInstallations(env, request);
    },
    uninstallIntegration(request) {
      return dispatchUninstallIntegration(env, request);
    },
  };
}
