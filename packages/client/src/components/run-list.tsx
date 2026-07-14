'use client';

import Link from 'next/link';
import { useState } from 'react';

import { AgentToken } from './agent-token';
import { ConfirmDialog } from './confirm-dialog';
import { DataTable } from './data-table';
import { DetailDrawer } from './detail-drawer';
import { EmptyState } from './empty-state';
import { generateIdempotencyKey } from './generate-idempotency-key';
import { PaginationBar } from './pagination-bar';
import { Button } from './ui/button';

import type {
  BrowserSafeAgentRpcResult,
  BrowserSafeOperationDisplayData,
} from './schemas/browser-safe-result';

interface PageInfo {
  readonly nextPageToken?: string;
  readonly resultCount: number;
  readonly cursorScope?: string;
}

interface RunSummary {
  readonly runId: string;
  readonly status: string;
  readonly threadId?: string;
  readonly triggerEventId?: string;
  readonly sectionId?: string;
  readonly startedAtUnixMs?: string;
  readonly finishedAtUnixMs?: string;
  readonly configVersion?: string;
  readonly toolSetVersion?: string;
  readonly integrationVersion?: string;
  readonly snapshotRef?: string;
  readonly safeErrorMessage?: string;
}

interface RunInputSnapshot {
  readonly runInputId: string;
  readonly triggerEventId: string;
  readonly triggerStartThreadSequence: string;
  readonly triggerEndThreadSequence: string;
  readonly threadMemoryVersion?: string;
  readonly latestReadyCompactionId?: string;
  readonly uncompactedUpperThreadSequence?: string;
  readonly configVersion: string;
  readonly toolSetVersion?: string;
  readonly integrationInstallationVersion?: string;
  readonly stateSnapshotRef?: string;
}

interface RunSnapshotReference {
  readonly snapshotRef: string;
  readonly threadId: string;
  readonly runId: string;
  readonly createdAtUnixMs: string;
  readonly digestSha256: string;
}

interface RunDetail extends RunSummary {
  readonly input?: RunInputSnapshot;
  readonly snapshot?: RunSnapshotReference;
}

interface RunListProps {
  readonly agentId: string;
  readonly runs: readonly RunSummary[];
  readonly page: PageInfo;
  readonly threadFilter: string;
  readonly statusFilter: string;
  readonly onGetRun: (agentId: string, runId: string) => Promise<BrowserSafeRunQueryResult>;
  readonly onCancelRun: (
    agentId: string,
    runId: string,
    idempotencyKey: string,
    reason: string
  ) => Promise<BrowserSafeRunActionResult>;
}

type BrowserSafeRunActionResult = BrowserSafeAgentRpcResult<
  BrowserSafeOperationDisplayData & { readonly data?: RunSummary }
>;

type BrowserSafeRunQueryResult = BrowserSafeAgentRpcResult<
  BrowserSafeOperationDisplayData & { readonly data?: RunDetail }
>;

const CANCELLABLE_STATUSES = ['pending', 'running', 'waiting_tool', 'waiting_approval'];

/**
 * Run list with immutable snapshot details and cancel confirmation。
 *
 * @param agentId - 表示対象 Agent ID。
 * @param runs - Server Action が返した Browser-safe Run rows。
 * @param page - Agent-scoped cursor pagination metadata。
 * @param threadFilter - 現在の Thread filter。
 * @param statusFilter - 現在の Run status filter。
 * @param onGetRun - Run detail を server-side Agent RPC から取得する Server Action。
 * @param onCancelRun - Run cancel を server-side Agent RPC へ送る Server Action。
 * @returns Run list、snapshot detail drawer、cancel confirm dialog。
 */
export function RunList({
  agentId,
  runs,
  page,
  threadFilter,
  statusFilter,
  onGetRun,
  onCancelRun,
}: RunListProps) {
  const [selected, setSelected] = useState<RunDetail | undefined>();
  const [pending, setPending] = useState(false);
  const [cancelRunId, setCancelRunId] = useState<string | undefined>();
  const [success, setSuccess] = useState<string | undefined>();
  const [error, setError] = useState<string | undefined>();

  const openRun = async (runId: string) => {
    // detail query の再実行前に古い安全な失敗文言を消し、pending 状態を一つに保ちます。
    setError(undefined);
    setPending(true);
    try {
      const result = await onGetRun(agentId, runId);
      if (result.safeStatus === 'failed' || result.displayData.data === undefined) {
        // envelope 内の固定安全文言だけを表示し、raw SDK/Connect failure は Browser に露出しません。
        setError(result.displayData.message);
        return;
      }
      setSelected(result.displayData.data);
    } catch {
      // envelope 契約外の失敗も raw detail を出さず、利用者へ再表示を案内します。
      setError('Run詳細を確認できませんでした。時間をおいてもう一度表示してください。');
    } finally {
      setPending(false);
    }
  };

  const handleCancel = async () => {
    if (cancelRunId === undefined) {
      return;
    }
    setPending(true);
    try {
      const result = await onCancelRun(
        agentId,
        cancelRunId,
        generateIdempotencyKey(),
        'cancelled from UI'
      );
      if (result.safeStatus === 'failed') {
        setError(result.displayData.message);
        return;
      }
      setSuccess(result.displayData.message);
      setCancelRunId(undefined);
      setSelected(undefined);
    } catch {
      setError('実行の状態は直前の確定値を保持しています。時間をおいてもう一度実行してください。');
    } finally {
      setPending(false);
    }
  };

  return (
    // page-level ControlRoomFrame は親 page が1つだけ提供するため、ここでは frame を持たず内容のみ描画する。
    <div className="space-y-4">
      <AgentToken agentId={agentId} />
      <RunFilterBar agentId={agentId} threadFilter={threadFilter} statusFilter={statusFilter} />
      {success === undefined ? null : (
        <p
          role="status"
          className="rounded-md border border-primary/50 bg-primary/10 px-3 py-2 text-sm"
        >
          {success}
        </p>
      )}
      {error === undefined ? null : <p role="alert">{error}</p>}
      <RunTable runs={runs} pending={pending} onOpen={openRun} />
      <PaginationBar
        basePath={`/agents/${agentId}/runs`}
        page={page}
        extraQuery={{ thread: threadFilter, status: statusFilter }}
      />

      <DetailDrawer
        open={selected !== undefined}
        title="Run detail"
        onClose={() => {
          setSelected(undefined);
        }}
      >
        {selected === undefined ? null : (
          <RunDetailContent
            detail={selected}
            pending={pending}
            onCancel={() => {
              setCancelRunId(selected.runId);
            }}
          />
        )}
      </DetailDrawer>

      <ConfirmDialog
        open={cancelRunId !== undefined}
        heading={`Cancel Run ${cancelRunId ?? ''}?`}
        confirmLabel="Cancel Run"
        onConfirm={handleCancel}
        onCancel={() => {
          setCancelRunId(undefined);
        }}
        pending={pending}
      >
        <p>
          The Agent scheduler will interrupt this Run. If the Run is already terminal, the cancel is
          replayed as a no-op. Acting user: server-derived operator.
        </p>
      </ConfirmDialog>
    </div>
  );
}

function RunFilterBar({
  agentId,
  threadFilter,
  statusFilter,
}: {
  readonly agentId: string;
  readonly threadFilter: string;
  readonly statusFilter: string;
}) {
  const statuses = [
    'all',
    'pending',
    'running',
    'waiting_tool',
    'waiting_approval',
    'completed',
    'failed',
    'cancelled',
    'interrupted',
  ];
  return (
    <section className="rounded-md border bg-card p-4" aria-label="Run filters">
      <div className="flex flex-wrap gap-2" aria-live="polite">
        {statuses.map((status) => (
          <Link
            key={status}
            className={`inline-flex items-center rounded-md border px-3 py-1.5 text-sm hover:bg-accent ${
              statusFilter === status ? 'bg-accent text-accent-foreground' : 'text-muted-foreground'
            }`}
            href={`/agents/${agentId}/runs?status=${status}&thread=${threadFilter}`}
            aria-pressed={statusFilter === status}
          >
            {status}
          </Link>
        ))}
      </div>
      <p className="mt-3 text-xs text-muted-foreground">
        Thread filter: {threadFilter === '' ? 'all' : threadFilter}
      </p>
    </section>
  );
}

function RunTable({
  runs,
  pending,
  onOpen,
}: {
  readonly runs: readonly RunSummary[];
  readonly pending: boolean;
  readonly onOpen: (runId: string) => Promise<void>;
}) {
  if (runs.length === 0) {
    return (
      <EmptyState
        eyebrow="NO RUNS"
        heading="No Runs yet."
        lead="Runs appear when the Agent scheduler processes pending work."
      />
    );
  }

  return (
    <DataTable
      ariaLabel="Runs"
      headers={['Run ID', 'Status', 'Thread', 'Started', 'Snapshot ref', 'Causal trigger']}
      rows={runs.map((run) => [
        <Button
          key={`run-${run.runId}`}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void onOpen(run.runId);
          }}
          disabled={pending}
        >
          {run.runId}
        </Button>,
        run.status,
        run.threadId ?? '—',
        run.startedAtUnixMs ?? '—',
        run.snapshotRef ?? 'metadata only',
        run.triggerEventId ?? '—',
      ])}
    />
  );
}

function RunDetailContent({
  detail,
  pending,
  onCancel,
}: {
  readonly detail: RunDetail;
  readonly pending: boolean;
  readonly onCancel: () => void;
}) {
  return (
    <>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        RUN DETAIL
      </p>
      <p>run_id: {detail.runId}</p>
      <p>status: {detail.status}</p>
      <p>thread_id: {detail.threadId ?? '—'}</p>
      <section
        className="space-y-2 rounded-lg border bg-card p-5 text-sm leading-6"
        aria-label="Immutable Run snapshot"
      >
        <strong>SNAPSHOT (immutable)</strong>
        <p>
          trigger event range: {detail.input?.triggerStartThreadSequence ?? '—'} →{' '}
          {detail.input?.triggerEndThreadSequence ?? '—'}
        </p>
        <p>thread memory version: {detail.input?.threadMemoryVersion ?? '—'}</p>
        <p>latest ready compaction: {detail.input?.latestReadyCompactionId ?? '—'}</p>
        <p>uncompacted upper sequence: {detail.input?.uncompactedUpperThreadSequence ?? '—'}</p>
        <p>config version: {detail.input?.configVersion ?? detail.configVersion ?? '—'}</p>
        <p>tool set version: {detail.input?.toolSetVersion ?? detail.toolSetVersion ?? '—'}</p>
        <p>
          integration version:{' '}
          {detail.input?.integrationInstallationVersion ?? detail.integrationVersion ?? '—'}
        </p>
        <p>snapshot_ref: {detail.snapshot?.snapshotRef ?? detail.snapshotRef ?? 'metadata only'}</p>
        <p>snapshot digest: {detail.snapshot?.digestSha256 ?? '—'}</p>
      </section>
      <section
        className="space-y-2 rounded-lg border bg-card p-5 text-sm leading-6"
        aria-label="Run causal links"
      >
        <strong>CAUSAL LINKS</strong>
        <p>trigger_event_id: {detail.triggerEventId ?? detail.input?.triggerEventId ?? '—'}</p>
        <p>section_id: {detail.sectionId ?? '—'}</p>
        <p>safe error detail: {detail.safeErrorMessage ?? '—'}</p>
      </section>
      {CANCELLABLE_STATUSES.includes(detail.status) ? (
        <Button type="button" variant="destructive" onClick={onCancel} disabled={pending}>
          Cancel Run
        </Button>
      ) : null}
    </>
  );
}
