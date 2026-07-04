import {
  installIntegration,
  listInstallations,
  uninstallIntegration,
} from '@cf-tamac/client/server/actions/agent-operations';
import {
  getActingOperatorId,
  getIntegrationManagementPermission,
} from '@cf-tamac/client/server/actions/managed-agents';

import { AgentDataUnavailableAlert } from '../../../../src/components/agent-data-unavailable-alert';
import { ControlRoomFrame } from '../../../../src/components/control-room-frame';
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
  const [actingOperatorId, integrationManagementPermission] = await Promise.all([
    getActingOperatorId(),
    getIntegrationManagementPermission(),
  ]);

  try {
    // Installation 一覧は Agent Service の正本から取得し、Provider secret や raw manifest body は Browser に渡さない。
    const installations = await listInstallations(agentId, {
      status: status === 'all' ? undefined : status,
      page: { pageToken },
    });

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
  } catch {
    // Agent RPC / credential resolution failure は route-level safe fallback に変換する。
    return (
      <ControlRoomFrame title={`Agent registry › ${agentId}`} signalLabel="integrations">
        <AgentDataUnavailableAlert screenName="Integrations" />
      </ControlRoomFrame>
    );
  }
}
