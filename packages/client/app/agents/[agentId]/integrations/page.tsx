import {
  installIntegration,
  listInstallations,
  uninstallIntegration,
} from '@cf-tamac/client/server/actions/agent-operations';
import {
  getActingOperatorId,
  getIntegrationManagementPermission,
} from '@cf-tamac/client/server/actions/managed-agents';

import { IntegrationView } from '../../../../src/components/integration-view';

interface AgentIntegrationsPageProps {
  readonly params: Promise<{ readonly agentId: string }>;
  readonly searchParams: Promise<{
    readonly status?: string;
    readonly pageToken?: string;
  }>;
}

/**
 * Integration installation management page（AGENT-MANAGEMENT-UI-S008）。
 *
 * Integration install/list/uninstall を server-side Agent RPC に閉じ、Provider
 * identity や Adapter/Tool/Delivery capability は browser-safe metadata のみで表示する。
 */
export default async function AgentIntegrationsPage({
  params,
  searchParams,
}: AgentIntegrationsPageProps) {
  const { agentId } = await params;
  const { status, pageToken } = await searchParams;
  const [installations, actingOperatorId, integrationManagementPermission] = await Promise.all([
    listInstallations(agentId, {
      status: status === 'all' ? undefined : status,
      page: { pageToken },
    }),
    getActingOperatorId(),
    getIntegrationManagementPermission(),
  ]);

  return (
    <IntegrationView
      agentId={agentId}
      installations={installations.items}
      page={installations.page}
      statusFilter={status ?? 'all'}
      actingOperatorId={actingOperatorId}
      canManageIntegrations={integrationManagementPermission.canManageIntegrations}
      managementDisabledReason={integrationManagementPermission.deniedReason}
      onInstall={installIntegration}
      onUninstall={uninstallIntegration}
    />
  );
}
