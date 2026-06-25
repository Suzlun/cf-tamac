import Link from 'next/link';

import {
  getAgentOverview,
  getAgentState,
  type BrowserSafeAgentOverview,
  type BrowserSafeAgentState,
} from '@cf-tamac/client/server/actions/agent-lifecycle';
import { getManagedAgentForDisplay } from '@cf-tamac/client/server/actions/managed-agents';

import { AgentToken } from '../../../src/components/agent-token';
import { ControlRoomFrame } from '../../../src/components/control-room-frame';
import { ErrorAlert } from '../../../src/components/error-alert';
import { SignalBadge } from '../../../src/components/signal-badge';
import { SkeletonTable } from '../../../src/components/skeleton-table';

interface AgentDetailPageProps {
  readonly params: Promise<{ readonly agentId: string }>;
}

type ManagedAgentDisplay = NonNullable<Awaited<ReturnType<typeof getManagedAgentForDisplay>>>;

interface OverviewLoadResult {
  readonly overview?: BrowserSafeAgentOverview;
  readonly state?: BrowserSafeAgentState;
  readonly error?: string;
  readonly errorCategory?: string;
}

function getErrorCategory(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null || !('category' in error)) {
    return undefined;
  }
  const category = (error as { readonly category?: unknown }).category;
  return typeof category === 'string' ? category : undefined;
}

function safeOverviewErrorMessage(error: unknown): string {
  switch (getErrorCategory(error)) {
    case 'not_found':
      return 'The Agent Worker has no aggregate for this Agent ID. Verify the Agent ID and RPC origin in Settings.';
    case 'permission_denied':
      return 'You do not have permission to view this Agent.';
    case 'unavailable':
      return 'Agent overview is temporarily unavailable. Safe metadata only is shown.';
    default:
      return 'Agent overview is temporarily unavailable. Safe metadata only is shown.';
  }
}

async function loadOverview(agentId: string): Promise<OverviewLoadResult> {
  const [overviewResult, stateResult] = await Promise.allSettled([
    getAgentOverview(agentId),
    getAgentState(agentId),
  ]);
  const overview = overviewResult.status === 'fulfilled' ? overviewResult.value : undefined;
  const state = stateResult.status === 'fulfilled' ? stateResult.value : undefined;
  let errorReason: unknown;
  if (overviewResult.status === 'rejected') {
    errorReason = overviewResult.reason;
  } else if (stateResult.status === 'rejected') {
    errorReason = stateResult.reason;
  }

  return {
    overview,
    state,
    error: errorReason === undefined ? undefined : safeOverviewErrorMessage(errorReason),
    errorCategory: errorReason === undefined ? undefined : getErrorCategory(errorReason),
  };
}

function formatTimestamp(value: number | undefined): string {
  if (value === undefined) {
    return '—';
  }
  return new Intl.DateTimeFormat('ja-JP', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function statusVariant(status: string | undefined): 'signal' | 'cyan' | 'muted' | 'error' {
  const normalized = status?.toLowerCase() ?? '';
  if (
    normalized.includes('destroyed') ||
    normalized.includes('revoked') ||
    normalized.includes('unavailable')
  ) {
    return 'error';
  }
  if (normalized.includes('serving') || normalized.includes('active')) {
    return 'signal';
  }
  if (normalized === '') {
    return 'muted';
  }
  return 'cyan';
}

function formatStatus(status: string | undefined): string {
  return status === undefined || status === '' ? 'UNKNOWN' : status.toUpperCase();
}

/**
 * Agent overview page (AGENT-MANAGEMENT-UI-S003).
 *
 * Fetches Agent profile, lifecycle, config version, credential status, and
 * capability summary from Agent RPC via server-side actions.
 */
export default async function AgentDetailPage({ params }: AgentDetailPageProps) {
  const { agentId } = await params;
  const managedAgent = await getManagedAgentForDisplay(agentId);

  if (managedAgent === undefined) {
    return <NotRegisteredOverview />;
  }

  const { overview, state, error, errorCategory } = await loadOverview(agentId);
  const signalLabel = overview?.status ?? state?.status ?? errorCategory ?? 'unknown';

  return (
    <ControlRoomFrame
      title={`Agent registry › ${agentId}`}
      signalLabel={signalLabel}
      agentId={agentId}
      currentSection="overview"
    >
      <OverviewHeader agentId={agentId} managedAgent={managedAgent} />
      {error !== undefined ? <ErrorAlert message={error} /> : null}
      {overview === undefined ? (
        error === undefined ? (
          <SkeletonTable rows={3} columns={2} />
        ) : (
          <OverviewErrorActions agentId={agentId} category={errorCategory} />
        )
      ) : (
        <OverviewZones
          agentId={agentId}
          managedAgent={managedAgent}
          overview={overview}
          state={state}
        />
      )}
    </ControlRoomFrame>
  );
}

function OverviewErrorActions({
  agentId,
  category,
}: {
  readonly agentId: string;
  readonly category?: string;
}) {
  if (category === 'permission_denied') {
    return null;
  }
  return (
    <div className="action-row">
      {category === 'not_found' ? (
        <Link className="primary-action" href={`/agents/${agentId}/settings`}>
          Open Settings
        </Link>
      ) : (
        <Link className="primary-action" href={`/agents/${agentId}`}>
          Retry overview
        </Link>
      )}
      <Link className="nav-link" href="/agents">
        Back to registry
      </Link>
    </div>
  );
}

function NotRegisteredOverview() {
  return (
    <ControlRoomFrame title="Agent registry" signalLabel="not registered" currentSection="overview">
      <ErrorAlert message="This Agent is not registered in the Client ledger." />
      <div className="action-row">
        <Link className="nav-link" href="/agents">
          Back to registry
        </Link>
      </div>
    </ControlRoomFrame>
  );
}

function OverviewHeader({
  agentId,
  managedAgent,
}: {
  readonly agentId: string;
  readonly managedAgent: ManagedAgentDisplay;
}) {
  return (
    <>
      <p className="eyebrow">Agent overview</p>
      <h2>{managedAgent.displayName}</h2>
      <AgentToken agentId={agentId} />
    </>
  );
}

function OverviewZones({
  agentId,
  managedAgent,
  overview,
  state,
}: {
  readonly agentId: string;
  readonly managedAgent: ManagedAgentDisplay;
  readonly overview: BrowserSafeAgentOverview;
  readonly state?: BrowserSafeAgentState;
}) {
  const isDestroyed = overview.status === 'destroyed';
  return (
    <>
      {isDestroyed ? <DestroyedNotice /> : null}
      <div className="route-grid">
        <ProfileZone managedAgent={managedAgent} overview={overview} />
        <CapabilityZone overview={overview} state={state} />
        <StorageHealthZone state={state} />
      </div>
      <OverviewActions agentId={agentId} isDestroyed={isDestroyed} />
    </>
  );
}

function DestroyedNotice() {
  return (
    <div className="state-error readout" role="status">
      This Agent is destroyed. History remains viewable; mutations are disabled.
    </div>
  );
}

function ProfileZone({
  managedAgent,
  overview,
}: {
  readonly managedAgent: ManagedAgentDisplay;
  readonly overview: BrowserSafeAgentOverview;
}) {
  return (
    <section className="readout" aria-labelledby="profile-heading">
      <strong id="profile-heading">Profile + lifecycle</strong>
      <p>
        Lifecycle status:{' '}
        <SignalBadge
          label={formatStatus(overview.status)}
          variant={statusVariant(overview.status)}
        />
      </p>
      <p>Config version: v{overview.configVersion}</p>
      <CredentialLine overview={overview} />
      <p>Last opened: {formatTimestamp(managedAgent.lastOpenedAtMs)}</p>
    </section>
  );
}

function CredentialLine({ overview }: { readonly overview: BrowserSafeAgentOverview }) {
  if (overview.credential === undefined) {
    return <p>Credential: generation {overview.credentialGeneration} · status unknown</p>;
  }
  return (
    <p>
      Credential: generation {overview.credential.generation} ·{' '}
      <SignalBadge
        label={formatStatus(overview.credential.status)}
        variant={statusVariant(overview.credential.status)}
      />{' '}
      · key id: {overview.credential.keyId ?? '—'}
    </p>
  );
}

function CapabilityZone({
  overview,
  state,
}: {
  readonly overview: BrowserSafeAgentOverview;
  readonly state?: BrowserSafeAgentState;
}) {
  const summary = overview.capabilitySummary ?? state?.capabilitySummary;
  return (
    <section className="readout" aria-labelledby="capabilities-heading">
      <strong id="capabilities-heading">Capabilities</strong>
      <ul>
        <li>Threads: {overview.threadCount ?? '—'}</li>
        <li>Active Run: {state?.currentRunId ?? overview.activeRunId ?? 'none'}</li>
        <li>Pending Runs: {overview.pendingRunCount ?? '—'}</li>
        <li>Schedules: {overview.scheduleCount ?? summary?.activeScheduleCount ?? '—'}</li>
        <li>Tools: {overview.toolCount ?? summary?.toolCount ?? '—'}</li>
        <li>
          Integrations: {overview.installationCount ?? summary?.activeInstallationCount ?? '—'}
        </li>
      </ul>
    </section>
  );
}

function StorageHealthZone({ state }: { readonly state?: BrowserSafeAgentState }) {
  const storagePercent = state?.storagePercent;
  const clampedStoragePercent = Math.max(0, Math.min(storagePercent ?? 0, 100));
  const health = state?.storageStatus ?? state?.schedulerStatus ?? state?.status;
  return (
    <section className="readout" aria-labelledby="health-heading">
      <strong id="health-heading">Storage & health</strong>
      <p>DO storage: {storagePercent === undefined ? '—' : `${String(storagePercent)}%`}</p>
      <div
        className="storage-meter"
        role="progressbar"
        aria-valuenow={clampedStoragePercent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Durable Object storage usage"
      >
        <span style={{ width: `${String(clampedStoragePercent)}%` }} />
      </div>
      <p>R2 archive: safe metadata only</p>
      <p>
        Health: <SignalBadge label={formatStatus(health)} variant={statusVariant(health)} />
      </p>
      <p>Safe metadata only — no secrets, no raw stack.</p>
    </section>
  );
}

function OverviewActions({
  agentId,
  isDestroyed,
}: {
  readonly agentId: string;
  readonly isDestroyed: boolean;
}) {
  return (
    <div className="action-row">
      {isDestroyed ? null : (
        <Link className="primary-action" href={`/agents/${agentId}/settings`}>
          Open Settings
        </Link>
      )}
      <Link className="nav-link" href={`/agents/${agentId}/threads`}>
        View Threads
      </Link>
      <Link className="nav-link" href={`/agents/${agentId}/runs`}>
        View Runs
      </Link>
    </div>
  );
}
