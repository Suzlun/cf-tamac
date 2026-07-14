'use client';

import { useState } from 'react';

import { AgentToken } from './agent-token';
import { ConfirmDialog } from './confirm-dialog';
import { ControlRoomFrame } from './control-room-frame';
import { DetailDrawer } from './detail-drawer';
import { ErrorAlert } from './error-alert';
import { IntegrationInstallForm, type InstallFormState } from './integration-install-form';
import { InstallationDetail } from './integration-installation-detail';
import {
  INTEGRATION_PERMISSION_COPY_ID,
  IntegrationToolbar,
} from './integration-permission-controls';
import { IntegrationTable } from './integration-table';
import {
  confirmIntegrationInstall,
  uninstallIntegrationFromUi,
} from './integration-view-mutations';
import { PaginationBar } from './pagination-bar';

import type {
  BrowserSafeAgentRpcResult,
  BrowserSafeOperationDisplayData,
} from './schemas/browser-safe-result';

interface PageInfo {
  readonly nextPageToken?: string;
  readonly resultCount: number;
  readonly cursorScope?: string;
}

interface PayloadReference {
  readonly ref: string;
  readonly contentType: string;
  readonly byteSize: string;
  readonly sha256: string;
  readonly storageClass: string;
}

interface IntegrationGrant {
  readonly grantId: string;
  readonly grantType: string;
  readonly scope: string;
  readonly status: string;
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

interface CleanupResult {
  readonly auditEventId?: string;
  readonly deliveryRevokedLabel?: string;
  readonly disabledAdapterConnections?: number;
  readonly schedulesCancelledLabel?: string;
  readonly toolsDisabledLabel?: string;
  readonly trustKeysRevokedLabel?: string;
}

interface InstallationSummary {
  readonly installationId: string;
  readonly status: string;
  readonly integrationId?: string;
  readonly providerIdentity?: string;
  readonly manifestDigest?: string;
  readonly schemaVersion?: string;
  readonly installedAtUnixMs?: string;
  readonly updatedAtUnixMs?: string;
  readonly grantSummaryRef?: string;
  readonly grants: readonly IntegrationGrant[];
  readonly adapterConnections: readonly AdapterConnectionSummary[];
  readonly tools: readonly ToolSummary[];
  readonly deliveryCapabilityCount: number;
  readonly setupInstructionsRef?: PayloadReference;
  readonly cleanupResult?: CleanupResult;
}

interface IntegrationViewProps {
  readonly agentId: string;
  readonly installations: readonly InstallationSummary[];
  readonly page: PageInfo;
  readonly statusFilter: string;
  readonly actingOperatorId: string;
  readonly canManageIntegrations: boolean;
  readonly managementDisabledReason?: string;
  readonly onInstall: (
    agentId: string,
    idempotencyKey: string,
    integrationId: string,
    manifestRef: string,
    requestedGrants: readonly string[]
  ) => Promise<BrowserSafeInstallationActionResult>;
  readonly onUninstall: (
    agentId: string,
    installationId: string,
    idempotencyKey: string,
    reason: string
  ) => Promise<BrowserSafeInstallationActionResult>;
}

type BrowserSafeInstallationActionResult = BrowserSafeAgentRpcResult<
  BrowserSafeOperationDisplayData & { readonly data?: InstallationSummary }
>;

const TERMINAL_INSTALLATION_STATUSES = new Set(['uninstalled', 'failed']);

/**
 * Integration installation の list/detail/install/uninstall UI を提供する。
 *
 * @param agentId - 現在表示している Agent ID。Integration Server Actions はこの ID に scope する。
 * @param installations - Server Action が Agent RPC から取得した Browser-safe Installation rows。
 * @param page - Installation list の scoped cursor pagination metadata。
 * @param statusFilter - 現在の Installation status filter。
 * @param actingOperatorId - install/uninstall confirmation に表示する server-derived operator ID。
 * @param canManageIntegrations - server-side acting user scope から導出された Integration 管理操作 permission。
 * @param managementDisabledReason - permission denied 時に disabled control から参照する browser-safe copy。
 * @param onInstall - InstallIntegration を実行する Server Action。
 * @param onUninstall - UninstallIntegration を実行する Server Action。
 * @returns Integration management tab の Client Component。
 *
 * @remarks
 * Browser には Server Action callbacks、Browser-safe Installation rows、permission boolean/copy だけを渡します。
 * Agent RPC client、generated descriptors、credential material、acting user scope 一覧はこの component に入りません。
 * permission denied の場合は install/uninstall controls を disabled にし、wireframe copy を `aria-describedby` で参照します。
 *
 * @example
 * ```tsx
 * <IntegrationView
 *   agentId="agent-01"
 *   installations={installations.items}
 *   page={installations.page}
 *   statusFilter="all"
 *   actingOperatorId="operator-01"
 *   canManageIntegrations={true}
 *   onInstall={installIntegration}
 *   onUninstall={uninstallIntegration}
 * />
 * ```
 */
export function IntegrationView({
  agentId,
  installations,
  page,
  statusFilter,
  actingOperatorId,
  canManageIntegrations,
  managementDisabledReason,
  onInstall,
  onUninstall,
}: IntegrationViewProps) {
  // 表示状態は form/drawer/dialog のみ。Provider material や Agent RPC client は browser に置かない。
  const [showInstall, setShowInstall] = useState(false);
  const [installDraft, setInstallDraft] = useState<InstallFormState | undefined>();
  const [selected, setSelected] = useState<InstallationSummary | undefined>();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [success, setSuccess] = useState<string | undefined>();
  const [uninstallId, setUninstallId] = useState<string | undefined>();

  // install は manifest reference を Server Action に渡すだけで、browser では manifest を fetch しない。
  const handleInstall = (form: InstallFormState): Promise<void> => {
    setError(undefined);
    setSuccess(undefined);
    setInstallDraft(form);
    return Promise.resolve();
  };

  // 確認済み install mutation を helper に委譲し、component 本体の責務を状態配線に閉じる。
  const handleConfirmInstall = (): Promise<void> =>
    confirmIntegrationInstall({
      agentId,
      installDraft,
      onInstall,
      setError,
      setInstallDraft,
      setPending,
      setShowInstall,
      setSuccess,
    });

  // uninstall は destructive flow なので、選択状態と ConfirmDialog の両方で対象を固定する。
  const handleUninstall = (): Promise<void> =>
    uninstallIntegrationFromUi({
      agentId,
      onUninstall,
      setError,
      setPending,
      setSelected,
      setSuccess,
      setUninstallId,
      uninstallId,
    });

  return (
    <IntegrationViewContent
      agentId={agentId}
      installations={installations}
      page={page}
      statusFilter={statusFilter}
      actingOperatorId={actingOperatorId}
      canManageIntegrations={canManageIntegrations}
      managementDisabledReason={managementDisabledReason}
      showInstall={showInstall}
      installDraft={installDraft}
      selected={selected}
      pending={pending}
      error={error}
      success={success}
      uninstallId={uninstallId}
      onToggleInstall={() => {
        setShowInstall((previous) => !previous);
      }}
      onHideInstall={() => {
        setShowInstall(false);
      }}
      onInstall={handleInstall}
      onInstallInvalid={setError}
      onClearInstallDraft={() => {
        setInstallDraft(undefined);
      }}
      onView={setSelected}
      onRequestUninstall={setUninstallId}
      onClearSelected={() => {
        setSelected(undefined);
      }}
      onConfirmInstall={handleConfirmInstall}
      onConfirmUninstall={handleUninstall}
    />
  );
}

interface IntegrationViewContentProps {
  readonly agentId: string;
  readonly installations: readonly InstallationSummary[];
  readonly page: PageInfo;
  readonly statusFilter: string;
  readonly actingOperatorId: string;
  readonly canManageIntegrations: boolean;
  readonly managementDisabledReason?: string;
  readonly showInstall: boolean;
  readonly installDraft?: InstallFormState;
  readonly selected?: InstallationSummary;
  readonly pending: boolean;
  readonly error?: string;
  readonly success?: string;
  readonly uninstallId?: string;
  readonly onToggleInstall: () => void;
  readonly onHideInstall: () => void;
  readonly onInstall: (form: InstallFormState) => Promise<void>;
  readonly onInstallInvalid: (message: string) => void;
  readonly onClearInstallDraft: () => void;
  readonly onView: (installation: InstallationSummary) => void;
  readonly onRequestUninstall: (installationId: string | undefined) => void;
  readonly onClearSelected: () => void;
  readonly onConfirmInstall: () => Promise<void>;
  readonly onConfirmUninstall: () => Promise<void>;
}

function IntegrationViewContent({
  agentId,
  installations,
  page,
  statusFilter,
  actingOperatorId,
  canManageIntegrations,
  managementDisabledReason,
  showInstall,
  installDraft,
  selected,
  pending,
  error,
  success,
  uninstallId,
  onToggleInstall,
  onHideInstall,
  onInstall,
  onInstallInvalid,
  onClearInstallDraft,
  onView,
  onRequestUninstall,
  onClearSelected,
  onConfirmInstall,
  onConfirmUninstall,
}: IntegrationViewContentProps) {
  return (
    <ControlRoomFrame title={`Agent registry › ${agentId}`} signalLabel="integrations">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        Integrations
      </p>
      <h2>Integration installations</h2>
      <AgentToken agentId={agentId} />

      <IntegrationToolbar
        agentId={agentId}
        statusFilter={statusFilter}
        showInstall={showInstall}
        pending={pending}
        canManageIntegrations={canManageIntegrations}
        managementDisabledReason={managementDisabledReason}
        onToggleInstall={onToggleInstall}
      />

      <IntegrationInstallPanel
        showInstall={showInstall}
        pending={pending}
        canManageIntegrations={canManageIntegrations}
        managementDisabledReason={managementDisabledReason}
        error={error}
        success={success}
        onInstall={onInstall}
        onInstallInvalid={onInstallInvalid}
        onHideInstall={onHideInstall}
      />

      <IntegrationRecordsSection
        agentId={agentId}
        installations={installations}
        page={page}
        statusFilter={statusFilter}
        selected={selected}
        pending={pending}
        canManageIntegrations={canManageIntegrations}
        onView={onView}
        onClose={onClearSelected}
        onRequestUninstall={onRequestUninstall}
      />

      <IntegrationMutationDialogs
        installDraft={installDraft}
        uninstallId={uninstallId}
        actingOperatorId={actingOperatorId}
        pending={pending}
        onConfirmInstall={onConfirmInstall}
        onClearInstallDraft={onClearInstallDraft}
        onConfirmUninstall={onConfirmUninstall}
        onRequestUninstall={onRequestUninstall}
      />
    </ControlRoomFrame>
  );
}

function IntegrationRecordsSection({
  agentId,
  installations,
  page,
  statusFilter,
  selected,
  pending,
  canManageIntegrations,
  onView,
  onClose,
  onRequestUninstall,
}: {
  readonly agentId: string;
  readonly installations: readonly InstallationSummary[];
  readonly page: PageInfo;
  readonly statusFilter: string;
  readonly selected?: InstallationSummary;
  readonly pending: boolean;
  readonly canManageIntegrations: boolean;
  readonly onView: (installation: InstallationSummary) => void;
  readonly onClose: () => void;
  readonly onRequestUninstall: (installationId: string | undefined) => void;
}) {
  return (
    <>
      <IntegrationTable
        installations={installations}
        pending={pending}
        terminalStatuses={TERMINAL_INSTALLATION_STATUSES}
        canUninstall={canManageIntegrations}
        permissionDescriptionId={INTEGRATION_PERMISSION_COPY_ID}
        onView={onView}
        onUninstall={(id) => {
          onRequestUninstall(id);
        }}
      />
      <PaginationBar
        basePath={`/agents/${agentId}/integrations`}
        page={page}
        extraQuery={{ status: statusFilter }}
      />
      <DetailDrawer open={selected !== undefined} title="Installation detail" onClose={onClose}>
        {selected === undefined ? null : (
          <InstallationDetail
            installation={selected}
            pending={pending}
            terminal={TERMINAL_INSTALLATION_STATUSES.has(selected.status)}
            canUninstall={canManageIntegrations}
            permissionDescriptionId={INTEGRATION_PERMISSION_COPY_ID}
            onUninstall={() => {
              onRequestUninstall(selected.installationId);
            }}
          />
        )}
      </DetailDrawer>
    </>
  );
}

function IntegrationInstallPanel({
  showInstall,
  pending,
  canManageIntegrations,
  managementDisabledReason,
  error,
  success,
  onInstall,
  onInstallInvalid,
  onHideInstall,
}: {
  readonly showInstall: boolean;
  readonly pending: boolean;
  readonly canManageIntegrations: boolean;
  readonly managementDisabledReason?: string;
  readonly error?: string;
  readonly success?: string;
  readonly onInstall: (form: InstallFormState) => Promise<void>;
  readonly onInstallInvalid: (message: string) => void;
  readonly onHideInstall: () => void;
}) {
  return (
    <>
      {error !== undefined ? (
        <ErrorAlert title="Integration mutation failed" message={error} />
      ) : null}
      {success !== undefined ? (
        <div
          className="rounded-md border border-primary/50 bg-primary/10 px-3 py-2 text-sm"
          role="status"
        >
          {success}
        </div>
      ) : null}
      {showInstall ? (
        <IntegrationInstallForm
          pending={pending}
          canInstall={canManageIntegrations}
          permissionDeniedReason={managementDisabledReason}
          permissionDescriptionId={INTEGRATION_PERMISSION_COPY_ID}
          onInstall={onInstall}
          onInvalid={onInstallInvalid}
          onCancel={onHideInstall}
        />
      ) : null}
    </>
  );
}

function IntegrationMutationDialogs({
  installDraft,
  uninstallId,
  actingOperatorId,
  pending,
  onConfirmInstall,
  onClearInstallDraft,
  onConfirmUninstall,
  onRequestUninstall,
}: {
  readonly installDraft?: InstallFormState;
  readonly uninstallId?: string;
  readonly actingOperatorId: string;
  readonly pending: boolean;
  readonly onConfirmInstall: () => Promise<void>;
  readonly onClearInstallDraft: () => void;
  readonly onConfirmUninstall: () => Promise<void>;
  readonly onRequestUninstall: (installationId: string | undefined) => void;
}) {
  return (
    <>
      <ConfirmDialog
        open={installDraft !== undefined}
        heading={`Install Integration ${installDraft?.integrationId ?? ''}?`}
        confirmLabel="Install"
        onConfirm={onConfirmInstall}
        onCancel={onClearInstallDraft}
        pending={pending}
      >
        <p>
          The Agent will fetch the manifest server-side, verify signature and identity, and install
          only requested grants allowed by policy. Browser will not fetch the manifest.
        </p>
        <p aria-live="polite">Acting user: {actingOperatorId}.</p>
      </ConfirmDialog>
      <ConfirmDialog
        open={uninstallId !== undefined}
        heading={`Uninstall Integration ${uninstallId ?? ''}?`}
        confirmLabel="Uninstall"
        onConfirm={onConfirmUninstall}
        onCancel={() => {
          onRequestUninstall(undefined);
        }}
        pending={pending}
      >
        <p>
          The Agent will disable ingress, Adapter Connections, Tools, cancel pending ToolInvocations
          and Schedules, revoke DeliveryContexts, and revoke trust keys. History is preserved.
        </p>
        <p aria-live="polite">Acting user: {actingOperatorId}.</p>
      </ConfirmDialog>
    </>
  );
}
