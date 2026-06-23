'use client';

import Link from 'next/link';
import { useState } from 'react';

import { AgentToken } from './agent-token';
import { ConfirmDialog } from './confirm-dialog';
import { ControlRoomFrame } from './control-room-frame';
import { DataTable } from './data-table';
import { DetailDrawer } from './detail-drawer';
import { EmptyState } from './empty-state';
import { generateIdempotencyKey } from './generate-idempotency-key';
import { PaginationBar } from './pagination-bar';

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
  readonly onGetRun: (agentId: string, runId: string) => Promise<RunDetail>;
  readonly onCancelRun: (
    agentId: string,
    runId: string,
    idempotencyKey: string,
    reason: string
  ) => Promise<RunSummary>;
}

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

  const openRun = async (runId: string) => {
    setPending(true);
    try {
      const detail = await onGetRun(agentId, runId);
      setSelected(detail);
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
      await onCancelRun(agentId, cancelRunId, generateIdempotencyKey(), 'cancelled from UI');
      setSuccess(`Run ${cancelRunId} cancellation accepted.`);
      setCancelRunId(undefined);
      setSelected(undefined);
    } finally {
      setPending(false);
    }
  };

  return (
    <ControlRoomFrame
      title={`Agent registry › ${agentId}`}
      signalLabel="runs"
      agentId={agentId}
      currentSection="runs"
    >
      <p className="eyebrow">Runs</p>
      <h2>AgentRun history and scheduler</h2>
      <AgentToken agentId={agentId} />
      <RunFilterBar agentId={agentId} threadFilter={threadFilter} statusFilter={statusFilter} />
      {success === undefined ? null : <div className="state-success readout">{success}</div>}
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
    </ControlRoomFrame>
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
    <section className="readout" aria-label="Run filters">
      <div className="action-row" aria-live="polite">
        {statuses.map((status) => (
          <Link
            key={status}
            className={`nav-link${statusFilter === status ? ' state-pending' : ''}`}
            href={`/agents/${agentId}/runs?status=${status}&thread=${threadFilter}`}
            aria-pressed={statusFilter === status}
          >
            {status}
          </Link>
        ))}
      </div>
      <p className="eyebrow">Thread filter: {threadFilter === '' ? 'all' : threadFilter}</p>
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
        <button
          key={`run-${run.runId}`}
          type="button"
          className="nav-link"
          onClick={() => {
            void onOpen(run.runId);
          }}
          disabled={pending}
        >
          {run.runId}
        </button>,
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
      <p className="eyebrow">RUN DETAIL</p>
      <p>run_id: {detail.runId}</p>
      <p>status: {detail.status}</p>
      <p>thread_id: {detail.threadId ?? '—'}</p>
      <section className="readout" aria-label="Immutable Run snapshot">
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
      <section className="readout" aria-label="Run causal links">
        <strong>CAUSAL LINKS</strong>
        <p>trigger_event_id: {detail.triggerEventId ?? detail.input?.triggerEventId ?? '—'}</p>
        <p>section_id: {detail.sectionId ?? '—'}</p>
        <p>safe error detail: {detail.safeErrorMessage ?? '—'}</p>
      </section>
      {CANCELLABLE_STATUSES.includes(detail.status) ? (
        <button
          type="button"
          className="nav-link state-error"
          onClick={onCancel}
          disabled={pending}
        >
          Cancel Run
        </button>
      ) : null}
    </>
  );
}
