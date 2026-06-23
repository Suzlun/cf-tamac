import { DataTable } from './data-table';
import { EmptyState } from './empty-state';

import type { ReactNode } from 'react';

interface IntegrationGrant {
  readonly grantId: string;
  readonly grantType: string;
  readonly scope: string;
  readonly status: string;
}

interface PayloadReference {
  readonly ref: string;
  readonly contentType: string;
  readonly byteSize: string;
  readonly sha256: string;
  readonly storageClass: string;
}

interface AdapterConnectionSummary {
  readonly connectionId: string;
  readonly adapterId?: string;
  readonly deliveryCapabilityId?: string;
  readonly grantSummaryRef?: string;
  readonly installationId?: string;
  readonly metadataRef?: PayloadReference;
  readonly status?: string;
}

interface ToolSummary {
  readonly toolId: string;
  readonly displayName: string;
  readonly status: string;
  readonly installationId?: string;
  readonly approvalRequired?: boolean;
}

interface InstallationSummary {
  readonly installationId: string;
  readonly status: string;
  readonly integrationId?: string;
  readonly providerIdentity?: string;
  readonly grantSummaryRef?: string;
  readonly grants: readonly IntegrationGrant[];
  readonly adapterConnections: readonly AdapterConnectionSummary[];
  readonly tools: readonly ToolSummary[];
  readonly deliveryCapabilityCount: number;
}

interface IntegrationTableProps {
  readonly installations: readonly InstallationSummary[];
  readonly pending: boolean;
  readonly terminalStatuses: ReadonlySet<string>;
  readonly canUninstall: boolean;
  readonly permissionDescriptionId?: string;
  readonly onView: (installation: InstallationSummary) => void;
  readonly onUninstall: (installationId: string) => void;
}

/**
 * Integration installation list table を表示する。
 *
 * @param installations - Server Action が Agent RPC から取得した Browser-safe Installation rows です。
 * @param pending - install/uninstall mutation 中に destructive action button を無効化する flag です。
 * @param terminalStatuses - uninstall を許可しない terminal status の集合です。
 * @param canUninstall - server-side acting user permission から導出された uninstall 許可 flag です。
 * @param permissionDescriptionId - permission denied copy の DOM ID です。uninstall button の `aria-describedby` に使います。
 * @param onView - View button click を親へ通知する callback です。
 * @param onUninstall - Uninstall button click を親へ通知する callback です。直接 Agent RPC は呼びません。
 * @returns Integration list table を返します。`installations` が空の場合は wireframe の empty state を返します。
 *
 * @remarks
 * Provider secret、Adapter secret、Agent RPC client は受け取らず、Browser-safe summary だけを表示します。
 * permission denied または terminal status の場合は uninstall button を disabled にし、permission denied では親の permission copy を
 * `aria-describedby` で参照します。副作用は button click 時に親 callback を呼ぶことだけです。
 *
 * @example
 * ```tsx
 * <IntegrationTable
 *   installations={rows}
 *   pending={false}
 *   terminalStatuses={new Set(['uninstalled'])}
 *   canUninstall={true}
 *   onView={setSelected}
 *   onUninstall={setUninstallId}
 * />
 * ```
 */
export function IntegrationTable({
  installations,
  pending,
  terminalStatuses,
  canUninstall,
  permissionDescriptionId,
  onView,
  onUninstall,
}: IntegrationTableProps) {
  if (installations.length === 0) {
    return (
      <EmptyState
        eyebrow="NO INTEGRATIONS"
        heading="No Integrations installed."
        lead="Install a signed Integration manifest to add Adapters, Tools, and Delivery capabilities."
      />
    );
  }

  return (
    <DataTable
      ariaLabel="Installations"
      headers={['Installation ID', 'Integration ID', 'Provider', 'Status', 'Grants', 'Actions']}
      rows={installations.map((installation) =>
        buildInstallationRow({
          installation,
          pending,
          terminalStatuses,
          canUninstall,
          permissionDescriptionId,
          onView,
          onUninstall,
        })
      )}
    />
  );
}

interface BuildInstallationRowInput {
  readonly installation: InstallationSummary;
  readonly pending: boolean;
  readonly terminalStatuses: ReadonlySet<string>;
  readonly canUninstall: boolean;
  readonly permissionDescriptionId?: string;
  readonly onView: (installation: InstallationSummary) => void;
  readonly onUninstall: (installationId: string) => void;
}

function buildInstallationRow({
  installation,
  pending,
  terminalStatuses,
  canUninstall,
  permissionDescriptionId,
  onView,
  onUninstall,
}: BuildInstallationRowInput): readonly ReactNode[] {
  return [
    installation.installationId,
    installation.integrationId ?? '—',
    installation.providerIdentity ?? '—',
    installation.status,
    formatGrantScopes(installation),
    <InstallationActions
      key={`actions-${installation.installationId}`}
      installation={installation}
      pending={pending}
      terminalStatuses={terminalStatuses}
      canUninstall={canUninstall}
      permissionDescriptionId={permissionDescriptionId}
      onView={onView}
      onUninstall={onUninstall}
    />,
  ];
}

function InstallationActions({
  installation,
  pending,
  terminalStatuses,
  canUninstall,
  permissionDescriptionId,
  onView,
  onUninstall,
}: BuildInstallationRowInput) {
  const terminal = terminalStatuses.has(installation.status);
  const disabled = pending || terminal || !canUninstall;
  return (
    <div className="action-row">
      <button
        type="button"
        className="nav-link"
        onClick={() => {
          onView(installation);
        }}
      >
        View
      </button>
      <button
        type="button"
        className={`nav-link state-error${canUninstall ? '' : ' state-disabled'}`}
        onClick={() => {
          onUninstall(installation.installationId);
        }}
        disabled={disabled}
        aria-disabled={disabled}
        aria-describedby={!canUninstall ? permissionDescriptionId : undefined}
      >
        Uninstall
      </button>
    </div>
  );
}

function formatGrantScopes(installation: InstallationSummary): string {
  const scopes = installation.grants.map((grant) => grant.scope).join(', ');
  if (scopes !== '') {
    return scopes;
  }
  return installation.grantSummaryRef ?? '—';
}
