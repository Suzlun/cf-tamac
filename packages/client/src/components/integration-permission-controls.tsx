import Link from 'next/link';

import { Button } from './ui/button';

/**
 * Integration management permission copy を参照する安定 DOM ID です。
 *
 * @remarks
 * Install toggle、Install submit、Uninstall controls が permission denied の理由を `aria-describedby` で参照するために使います。
 * ID だけを公開し、acting user scopes や credential material は含めません。
 */
export const INTEGRATION_PERMISSION_COPY_ID = 'integration-management-permission-copy';

const INTEGRATION_PERMISSION_DENIED_COPY = 'You do not have permission to manage Integrations.';

interface IntegrationToolbarProps {
  readonly agentId: string;
  readonly statusFilter: string;
  readonly showInstall: boolean;
  readonly pending: boolean;
  readonly canManageIntegrations: boolean;
  readonly managementDisabledReason?: string;
  readonly onToggleInstall: () => void;
}

/**
 * Integration tab の filter、permission copy、install toggle をまとめて表示します。
 *
 * @param agentId - 現在表示している Agent ID です。filter link の path に使います。
 * @param statusFilter - 現在選択中の status filter です。active 表示と link query に使います。
 * @param showInstall - install form panel が開いているかどうかです。
 * @param pending - install/uninstall mutation 中に toggle を無効化する flag です。
 * @param canManageIntegrations - server-side acting user permission から導出された Integration 管理許可 flag です。
 * @param managementDisabledReason - permission denied 時に表示する browser-safe copy です。
 * @param onToggleInstall - Install toggle click を親へ通知する callback です。
 * @returns filter bar、permission notice、Install Integration toggle を返します。
 *
 * @remarks
 * Browser-visible component ですが、Agent RPC client、credential、acting user scope 一覧は受け取りません。
 * permission denied の場合は copy を描画し、toggle を disabled にして copy ID を `aria-describedby` で参照します。
 */
export function IntegrationToolbar({
  agentId,
  statusFilter,
  showInstall,
  pending,
  canManageIntegrations,
  managementDisabledReason,
  onToggleInstall,
}: IntegrationToolbarProps) {
  return (
    <>
      <IntegrationFilterBar agentId={agentId} statusFilter={statusFilter} />
      <IntegrationPermissionNotice
        canManageIntegrations={canManageIntegrations}
        managementDisabledReason={managementDisabledReason}
      />
      <IntegrationActions
        showInstall={showInstall}
        pending={pending}
        canManageIntegrations={canManageIntegrations}
        onToggle={onToggleInstall}
      />
    </>
  );
}

function IntegrationFilterBar({
  agentId,
  statusFilter,
}: {
  readonly agentId: string;
  readonly statusFilter: string;
}) {
  const statuses = ['all', 'active', 'pending_external_setup', 'disabled', 'uninstalled', 'failed'];
  return (
    <section
      className="rounded-md border bg-card p-4 text-sm space-y-1"
      aria-label="Integration filters"
    >
      <div className="flex flex-wrap gap-2" aria-live="polite">
        {statuses.map((status) => (
          <Link
            key={status}
            className={`inline-flex items-center rounded-md border px-3 py-1.5 text-sm hover:bg-accent ${statusFilter === status ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'}`}
            href={`/agents/${agentId}/integrations?status=${status}`}
            aria-pressed={statusFilter === status}
          >
            {status}
          </Link>
        ))}
      </div>
    </section>
  );
}

function IntegrationPermissionNotice({
  canManageIntegrations,
  managementDisabledReason,
}: {
  readonly canManageIntegrations: boolean;
  readonly managementDisabledReason?: string;
}) {
  if (canManageIntegrations) {
    return null;
  }
  return (
    <div
      id={INTEGRATION_PERMISSION_COPY_ID}
      className="rounded-md border bg-muted p-4 text-sm opacity-70"
      role="note"
    >
      {managementDisabledReason ?? INTEGRATION_PERMISSION_DENIED_COPY}
    </div>
  );
}

function IntegrationActions({
  showInstall,
  pending,
  canManageIntegrations,
  onToggle,
}: {
  readonly showInstall: boolean;
  readonly pending: boolean;
  readonly canManageIntegrations: boolean;
  readonly onToggle: () => void;
}) {
  const disabled = pending || !canManageIntegrations;
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="default"
        className={canManageIntegrations ? undefined : 'opacity-50'}
        onClick={onToggle}
        disabled={disabled}
        aria-disabled={disabled}
        aria-describedby={canManageIntegrations ? undefined : INTEGRATION_PERMISSION_COPY_ID}
        aria-expanded={showInstall}
      >
        {showInstall ? 'Hide form' : 'Install Integration'}
      </Button>
    </div>
  );
}
