import { Button } from './ui/button';

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
  readonly status?: string;
}

interface ToolSummary {
  readonly toolId: string;
  readonly displayName: string;
  readonly status: string;
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
  readonly grants: readonly IntegrationGrant[];
  readonly adapterConnections: readonly AdapterConnectionSummary[];
  readonly tools: readonly ToolSummary[];
  readonly deliveryCapabilityCount: number;
  readonly setupInstructionsRef?: PayloadReference;
  readonly cleanupResult?: CleanupResult;
}

interface InstallationDetailProps {
  readonly installation: InstallationSummary;
  readonly pending: boolean;
  readonly terminal: boolean;
  readonly canUninstall: boolean;
  readonly permissionDescriptionId?: string;
  readonly onUninstall: () => void;
}

/**
 * Integration Installation の詳細 drawer 本文を表示する。
 *
 * @param installation - Browser-safe Installation summary です。Provider secret や Adapter secret は含みません。
 * @param pending - uninstall Server Action 実行中に destructive control を無効化する flag です。
 * @param terminal - uninstalled/failed など uninstall 対象外 status かどうかを表す flag です。
 * @param canUninstall - server-side acting user permission から導出された uninstall 許可 flag です。
 * @param permissionDescriptionId - permission denied copy の DOM ID です。button の `aria-describedby` に使います。
 * @param onUninstall - Uninstall button click を親へ通知する callback です。直接 Agent RPC は呼びません。
 * @returns Installation detail drawer の Browser-safe 表示を返します。
 *
 * @remarks
 * manifest digest は read-only metadata として表示し、install input や digest pinning UI として扱いません。
 * terminal または permission denied の場合は Uninstall control を disabled にします。permission denied では親が描画した permission copy を
 * `aria-describedby` で参照し、ユーザーがなぜ操作できないかを把握できるようにします。
 *
 * @example
 * ```tsx
 * <InstallationDetail
 *   installation={selected}
 *   pending={false}
 *   terminal={false}
 *   canUninstall={true}
 *   onUninstall={requestUninstall}
 * />
 * ```
 */
export function InstallationDetail({
  installation,
  pending,
  terminal,
  canUninstall,
  permissionDescriptionId,
  onUninstall,
}: InstallationDetailProps) {
  const uninstallDisabled = pending || terminal || !canUninstall;
  return (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        INSTALLATION DETAIL
      </p>
      <p>installation_id: {installation.installationId}</p>
      <p>integration_id: {installation.integrationId ?? '—'}</p>
      <p>provider_identity: {installation.providerIdentity ?? '—'}</p>
      <p>status: {installation.status}</p>
      <p>manifest_digest: {installation.manifestDigest ?? '—'}</p>
      <p>schema_version: {installation.schemaVersion ?? '—'}</p>

      <GrantList grants={installation.grants} />
      <AdapterConnectionList connections={installation.adapterConnections} />
      <ToolList tools={installation.tools} />
      <DeliveryCapability count={installation.deliveryCapabilityCount} />
      <SetupInstructions reference={installation.setupInstructionsRef} />
      <CleanupResultView cleanup={installation.cleanupResult} />

      <Button
        type="button"
        variant={canUninstall ? 'destructive' : 'secondary'}
        onClick={onUninstall}
        disabled={uninstallDisabled}
        aria-disabled={uninstallDisabled}
        aria-describedby={!canUninstall ? permissionDescriptionId : undefined}
      >
        Uninstall
      </Button>
    </>
  );
}

function GrantList({ grants }: { readonly grants: readonly IntegrationGrant[] }) {
  return (
    <section
      className="rounded-md border bg-card p-4 text-sm space-y-1"
      aria-labelledby="grants-heading"
    >
      <strong id="grants-heading">GRANTS</strong>
      <ul aria-label="Granted scopes">
        {grants.map((grant) => (
          <li key={grant.grantId}>
            {grant.scope} — type: {grant.grantType} — status: {grant.status}
          </li>
        ))}
      </ul>
    </section>
  );
}

function AdapterConnectionList({
  connections,
}: {
  readonly connections: readonly AdapterConnectionSummary[];
}) {
  return (
    <section
      className="rounded-md border bg-card p-4 text-sm space-y-1"
      aria-labelledby="adapters-heading"
    >
      <strong id="adapters-heading">ADAPTER CONNECTIONS</strong>
      {connections.length === 0 ? (
        <p>No Adapter Connections.</p>
      ) : (
        <ul>
          {connections.map((connection) => (
            <li key={connection.connectionId}>
              connection_id: {connection.connectionId} — adapter: {connection.adapterId ?? '—'} —
              status: {connection.status ?? '—'}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function ToolList({ tools }: { readonly tools: readonly ToolSummary[] }) {
  return (
    <section
      className="rounded-md border bg-card p-4 text-sm space-y-1"
      aria-labelledby="tools-heading"
    >
      <strong id="tools-heading">TOOLS</strong>
      {tools.length === 0 ? (
        <p>No Tools.</p>
      ) : (
        <ul>
          {tools.map((tool) => (
            <li key={tool.toolId}>
              {tool.toolId} — {tool.displayName} ({tool.status}) — approval:{' '}
              {tool.approvalRequired === true ? 'required' : 'not required'}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function DeliveryCapability({ count }: { readonly count: number }) {
  return (
    <section
      className="rounded-md border bg-card p-4 text-sm space-y-1"
      aria-labelledby="delivery-heading"
    >
      <strong id="delivery-heading">DELIVERY CAPABILITY</strong>
      <p>delivery_enabled: {count > 0 ? 'true' : 'false'}</p>
      <p>delivery_contexts: {count}</p>
    </section>
  );
}

function SetupInstructions({ reference }: { readonly reference?: PayloadReference }) {
  return (
    <section
      className="rounded-md border bg-card p-4 text-sm space-y-1"
      aria-labelledby="setup-heading"
    >
      <strong id="setup-heading">SETUP INSTRUCTIONS</strong>
      <PayloadReferenceLine
        label="setup instructions"
        reference={reference}
        emptyText="No external setup instructions."
      />
    </section>
  );
}

function PayloadReferenceLine({
  label,
  reference,
  emptyText,
}: {
  readonly label: string;
  readonly reference?: PayloadReference;
  readonly emptyText: string;
}) {
  if (reference === undefined) {
    return <p>{emptyText}</p>;
  }
  return (
    <p>
      {label}: {reference.ref} · digest {reference.sha256} · {reference.byteSize} bytes ·{' '}
      {reference.storageClass}
    </p>
  );
}

function CleanupResultView({ cleanup }: { readonly cleanup?: CleanupResult }) {
  if (cleanup === undefined) {
    return null;
  }
  return (
    <section
      className="rounded-md border bg-card p-4 text-sm space-y-1"
      aria-live="polite"
      aria-labelledby="cleanup-heading"
    >
      <strong id="cleanup-heading">CLEANUP RESULT</strong>
      <p>adapter connections disabled: {cleanup.disabledAdapterConnections ?? 0}</p>
      <p>tools disabled: {cleanup.toolsDisabledLabel ?? '—'}</p>
      <p>schedules cancelled: {cleanup.schedulesCancelledLabel ?? '—'}</p>
      <p>delivery contexts revoked: {cleanup.deliveryRevokedLabel ?? '—'}</p>
      <p>trust keys revoked: {cleanup.trustKeysRevokedLabel ?? '—'}</p>
      <p>audit event: {cleanup.auditEventId ?? '—'}</p>
    </section>
  );
}
