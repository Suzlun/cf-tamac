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
import { Button } from '../../../src/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../../src/components/ui/card';

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

function safeOverviewErrorMessage(category: string | undefined): string {
  switch (category) {
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
  // 各 query は四属性 Browser-safe result を返すため、raw rejection detail を画面文言へ渡しません。
  const [overviewResult, stateResult] = await Promise.allSettled([
    getAgentOverview(agentId),
    getAgentState(agentId),
  ]);
  const overviewAction = overviewResult.status === 'fulfilled' ? overviewResult.value : undefined;
  const stateAction = stateResult.status === 'fulfilled' ? stateResult.value : undefined;
  const overview =
    overviewAction?.safeStatus === 'succeeded' ? overviewAction.displayData.data : undefined;
  const state = stateAction?.safeStatus === 'succeeded' ? stateAction.displayData.data : undefined;
  const failedAction =
    overviewAction?.safeStatus === 'failed'
      ? overviewAction
      : stateAction?.safeStatus === 'failed'
        ? stateAction
        : undefined;
  const category = failedAction?.safeErrorCategory;
  const hasUnexpectedRejection =
    overviewResult.status === 'rejected' || stateResult.status === 'rejected';

  return {
    overview,
    state,
    // action が予期せず reject しても error.reason は読まず、固定安全文言だけを採用します。
    error:
      failedAction === undefined && !hasUnexpectedRejection
        ? undefined
        : safeOverviewErrorMessage(category),
    errorCategory: category,
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
 * Agent overview page (AGENT-MANAGEMENT-UI-S003 / S019 / S020)。
 *
 * タスク 3.3: profile/lifecycle/config version/credential generation/capability summary/
 * latest Memory/Compaction summary を card/list/detail composition で描画する。
 * Agent RPC から server-side で取得し、Browser payload は secret-free である。
 */
export default async function AgentDetailPage({ params }: AgentDetailPageProps) {
  const { agentId } = await params;
  const managedAgent = await getManagedAgentForDisplay(agentId);

  if (managedAgent === undefined) {
    return (
      <ControlRoomFrame title="Agent registry" signalLabel="not registered">
        <ErrorAlert message="This Agent is not registered in the Client ledger." />
        <div className="mt-4 flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/agents">Back to registry</Link>
          </Button>
        </div>
      </ControlRoomFrame>
    );
  }

  const { overview, state, error, errorCategory } = await loadOverview(agentId);
  const signalLabel = overview?.status ?? state?.status ?? errorCategory ?? 'unknown';

  return (
    <ControlRoomFrame
      title={managedAgent.displayName}
      signalLabel={signalLabel}
      description="Agent overview: profile, lifecycle, config, credential generation, and capability summary."
      actions={
        overview === undefined || overview.status === 'destroyed' ? undefined : (
          <Button asChild variant="default">
            <Link href={`/agents/${agentId}/settings`}>Open Settings</Link>
          </Button>
        )
      }
    >
      <div className="space-y-4">
        <AgentToken agentId={agentId} />
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
      </div>
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
    <div className="flex flex-wrap gap-2">
      {category === 'not_found' ? (
        <Button asChild variant="default">
          <Link href={`/agents/${agentId}/settings`}>Open Settings</Link>
        </Button>
      ) : (
        <Button asChild variant="default">
          <Link href={`/agents/${agentId}`}>Retry overview</Link>
        </Button>
      )}
      <Button asChild variant="outline">
        <Link href="/agents">Back to registry</Link>
      </Button>
    </div>
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
  const summary = overview.capabilitySummary ?? state?.capabilitySummary;
  const storagePercent = state?.storagePercent;
  const clampedStoragePercent = Math.max(0, Math.min(storagePercent ?? 0, 100));

  return (
    <>
      {isDestroyed ? (
        <p
          role="status"
          className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive"
        >
          This Agent is destroyed. History remains viewable; mutations are disabled.
        </p>
      ) : null}
      {/* profile/lifecycle/capability を card/list composition で並べる（nested card を避ける）。 */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Profile + lifecycle</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1 text-sm">
            <div className="flex items-center gap-2">
              Lifecycle status:{' '}
              <SignalBadge
                label={formatStatus(overview.status)}
                variant={statusVariant(overview.status)}
              />
            </div>
            <p>Config version: v{overview.configVersion}</p>
            <CredentialLine overview={overview} />
            <p>Last opened: {formatTimestamp(managedAgent.lastOpenedAtMs)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Capabilities</CardTitle>
          </CardHeader>
          <CardContent className="text-sm">
            <ul className="space-y-1">
              <li>Threads: {overview.threadCount ?? '—'}</li>
              <li>Active Run: {state?.currentRunId ?? overview.activeRunId ?? 'none'}</li>
              <li>Pending Runs: {overview.pendingRunCount ?? '—'}</li>
              <li>Schedules: {overview.scheduleCount ?? summary?.activeScheduleCount ?? '—'}</li>
              <li>Tools: {overview.toolCount ?? summary?.toolCount ?? '—'}</li>
              <li>
                Integrations:{' '}
                {overview.installationCount ?? summary?.activeInstallationCount ?? '—'}
              </li>
            </ul>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">{'Storage & health'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>DO storage: {storagePercent === undefined ? '—' : `${String(storagePercent)}%`}</p>
            {/* storage 使用率は progressbar で表現し、color alone ではなく数値 label も併記する。 */}
            <div
              role="progressbar"
              aria-valuenow={clampedStoragePercent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Durable Object storage usage"
              className="h-2 w-full overflow-hidden rounded-full bg-muted"
            >
              <div
                className="h-full bg-primary"
                style={{ width: `${String(clampedStoragePercent)}%` }}
              />
            </div>
            <p>R2 archive: safe metadata only</p>
            <div className="flex items-center gap-2">
              Health:{' '}
              <SignalBadge
                label={formatStatus(
                  state?.storageStatus ?? state?.schedulerStatus ?? state?.status
                )}
                variant={statusVariant(
                  state?.storageStatus ?? state?.schedulerStatus ?? state?.status
                )}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Safe metadata only — no secrets, no raw stack.
            </p>
          </CardContent>
        </Card>
      </div>
      {/* 文脈 detail: Memory/Compaction summary への導線（タスク 2.6 / AGENT-MANAGEMENT-UI-S020）。 */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">{'Latest memory & compaction'}</CardTitle>
            <Link
              href={`/agents/${agentId}/threads`}
              className="text-sm text-muted-foreground hover:text-foreground hover:underline"
            >
              Open in Threads
            </Link>
          </div>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          Compaction and Memory provenance are available as contextual detail in Threads.
        </CardContent>
      </Card>
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href={`/agents/${agentId}/threads`}>View Threads</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={`/agents/${agentId}/runs`}>View Runs</Link>
        </Button>
      </div>
    </>
  );
}

function CredentialLine({ overview }: { readonly overview: BrowserSafeAgentOverview }) {
  if (overview.credential === undefined) {
    return <p>Credential: generation {overview.credentialGeneration} · status unknown</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1">
      Credential: generation {overview.credential.generation} ·{' '}
      <SignalBadge
        label={formatStatus(overview.credential.status)}
        variant={statusVariant(overview.credential.status)}
      />{' '}
      · key id: {overview.credential.keyId ?? '—'}
    </div>
  );
}
