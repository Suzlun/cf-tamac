'use client';

import Link from 'next/link';
import { useState } from 'react';

import { AgentToken } from './agent-token';
import { ControlRoomFrame } from './control-room-frame';
import { DataTable } from './data-table';
import { DetailDrawer } from './detail-drawer';
import { EmptyState } from './empty-state';
import { PaginationBar } from './pagination-bar';

interface PageInfo {
  readonly nextPageToken?: string;
  readonly resultCount: number;
  readonly cursorScope?: string;
}

interface ThreadSummary {
  readonly threadId: string;
  readonly threadKey: string;
  readonly status: string;
  readonly currentSectionId?: string;
  readonly latestEventId?: string;
  readonly latestRunId?: string;
  readonly updatedAtUnixMs: string;
  readonly snapshotRef?: string;
}

interface ThreadSectionSummary {
  readonly sectionId: string;
  readonly status: string;
  readonly sectionOrdinal: number;
  readonly startThreadSequence: string;
  readonly endThreadSequence?: string;
  readonly latestCompactionId?: string;
  readonly eventCount: number;
}

interface ThreadLatestEvent {
  readonly eventId: string;
  readonly eventType: string;
  readonly agentSequence: string;
  readonly threadSequence: string;
  readonly correlationId?: string;
  readonly causationId?: string;
}

interface ThreadLatestRun {
  readonly runId: string;
  readonly status: string;
}

interface ThreadDetail {
  readonly threadId: string;
  readonly threadKey: string;
  readonly status: string;
  readonly currentSection?: ThreadSectionSummary;
  readonly latestEvent?: ThreadLatestEvent;
  readonly latestRun?: ThreadLatestRun;
}

interface ThreadListProps {
  readonly agentId: string;
  readonly threads: readonly ThreadSummary[];
  readonly page: PageInfo;
  readonly statusFilter: string;
  readonly threadKeyPrefix: string;
  readonly onGetThread: (agentId: string, threadId: string) => Promise<ThreadDetail>;
}

/**
 * Thread list with scoped filters, cursor pagination, and a detail drawer。
 *
 * @param agentId - 表示対象 Agent ID。
 * @param threads - Server Action が返した Browser-safe Thread rows。
 * @param page - Agent-scoped cursor pagination metadata。
 * @param statusFilter - 現在の status filter。
 * @param threadKeyPrefix - 現在の thread_key prefix 検索値。
 * @param onGetThread - Thread detail を server-side Agent RPC から取得する Server Action。
 * @returns Thread 一覧と detail drawer。
 */
export function ThreadList({
  agentId,
  threads,
  page,
  statusFilter,
  threadKeyPrefix,
  onGetThread,
}: ThreadListProps) {
  const [selected, setSelected] = useState<ThreadDetail | undefined>();
  const [pending, setPending] = useState(false);

  const openThread = async (threadId: string) => {
    // Detail drawer の読み込み中に重複操作を避けるため、local pending を立てる。
    setPending(true);
    try {
      const detail = await onGetThread(agentId, threadId);
      setSelected(detail);
    } finally {
      setPending(false);
    }
  };

  return (
    <ControlRoomFrame
      title={`Agent registry › ${agentId}`}
      signalLabel="threads"
      agentId={agentId}
      currentSection="threads"
    >
      <p className="eyebrow">Threads</p>
      <h2>Agent-owned Thread history</h2>
      <AgentToken agentId={agentId} />
      <ThreadFilterBar
        agentId={agentId}
        statusFilter={statusFilter}
        threadKeyPrefix={threadKeyPrefix}
      />

      {threads.length === 0 ? (
        <EmptyState
          eyebrow="NO THREADS"
          heading="No Threads yet."
          lead="Threads appear when the Agent accepts Events with thread_key."
        />
      ) : (
        <ThreadTable threads={threads} pending={pending} onOpen={openThread} />
      )}

      <PaginationBar
        basePath={`/agents/${agentId}/threads`}
        page={page}
        extraQuery={{ status: statusFilter, q: threadKeyPrefix }}
      />

      <DetailDrawer
        open={selected !== undefined}
        title="Thread detail"
        onClose={() => {
          setSelected(undefined);
        }}
      >
        {selected === undefined ? null : (
          <ThreadDetailContent agentId={agentId} detail={selected} />
        )}
      </DetailDrawer>
    </ControlRoomFrame>
  );
}

function ThreadFilterBar({
  agentId,
  statusFilter,
  threadKeyPrefix,
}: {
  readonly agentId: string;
  readonly statusFilter: string;
  readonly threadKeyPrefix: string;
}) {
  const statuses = ['all', 'active', 'compacted', 'system'];
  return (
    <section className="readout" aria-label="Thread filters">
      <div className="action-row" aria-live="polite">
        {statuses.map((status) => (
          <Link
            key={status}
            className={`nav-link${statusFilter === status ? ' state-pending' : ''}`}
            href={buildThreadsHref(agentId, status, threadKeyPrefix)}
            aria-pressed={statusFilter === status}
          >
            {status}
          </Link>
        ))}
      </div>
      <form className="action-row" method="get">
        <input type="hidden" name="status" value={statusFilter} />
        <label className="eyebrow" htmlFor="thread-key-prefix">
          Search thread_key
        </label>
        <input
          id="thread-key-prefix"
          name="q"
          className="form-control"
          defaultValue={threadKeyPrefix}
          placeholder="thread_key…"
        />
        <button className="nav-link" type="submit">
          Apply filter
        </button>
      </form>
    </section>
  );
}

function ThreadTable({
  threads,
  pending,
  onOpen,
}: {
  readonly threads: readonly ThreadSummary[];
  readonly pending: boolean;
  readonly onOpen: (threadId: string) => Promise<void>;
}) {
  return (
    <DataTable
      ariaLabel="Threads"
      headers={['Thread key', 'Status', 'Sections', 'Latest event', 'Latest run', 'Snapshot']}
      rows={threads.map((thread) => [
        <button
          key={`key-${thread.threadId}`}
          type="button"
          className="nav-link"
          onClick={() => {
            void onOpen(thread.threadId);
          }}
          disabled={pending}
          aria-label={`Open Thread ${thread.threadKey}`}
        >
          {thread.threadKey}
        </button>,
        thread.status,
        thread.currentSectionId ?? '—',
        thread.latestEventId ?? '—',
        thread.latestRunId ?? '—',
        thread.snapshotRef ?? 'metadata only',
      ])}
    />
  );
}

function ThreadDetailContent({
  agentId,
  detail,
}: {
  readonly agentId: string;
  readonly detail: ThreadDetail;
}) {
  return (
    <>
      <p className="eyebrow">THREAD DETAIL</p>
      <p>thread_id: {detail.threadId}</p>
      <p>thread_key: {detail.threadKey}</p>
      <p>status: {detail.status}</p>
      <p>current_section_id: {detail.currentSection?.sectionId ?? '—'}</p>
      <p>section ordinal: {detail.currentSection?.sectionOrdinal ?? '—'}</p>
      <p>
        section range: {detail.currentSection?.startThreadSequence ?? '—'} →{' '}
        {detail.currentSection?.endThreadSequence ?? 'open'}
      </p>
      <section className="readout" aria-label="Latest Event">
        <strong>LATEST EVENT</strong>
        <p>event_id: {detail.latestEvent?.eventId ?? '—'}</p>
        <p>type: {detail.latestEvent?.eventType ?? '—'}</p>
        <p aria-label={`agent sequence ${detail.latestEvent?.agentSequence ?? 'unknown'}`}>
          agent_sequence: {detail.latestEvent?.agentSequence ?? '—'}
        </p>
        <p aria-label={`thread sequence ${detail.latestEvent?.threadSequence ?? 'unknown'}`}>
          thread_sequence: {detail.latestEvent?.threadSequence ?? '—'}
        </p>
      </section>
      <section className="readout" aria-label="Latest Run">
        <strong>LATEST RUN</strong>
        <p>run_id: {detail.latestRun?.runId ?? '—'}</p>
        <p>status: {detail.latestRun?.status ?? '—'}</p>
      </section>
      <div className="action-row">
        <Link className="nav-link" href={`/agents/${agentId}/events?thread=${detail.threadId}`}>
          Open Events for this Thread
        </Link>
        <Link className="nav-link" href={`/agents/${agentId}/runs?thread=${detail.threadId}`}>
          Open Runs for this Thread
        </Link>
        <Link
          className="nav-link"
          href={`/agents/${agentId}/compactions?thread=${detail.threadId}`}
        >
          Open Compactions
        </Link>
      </div>
    </>
  );
}

function buildThreadsHref(agentId: string, status: string, q: string): string {
  const params = new URLSearchParams();
  params.set('status', status);
  if (q !== '') {
    params.set('q', q);
  }
  return `/agents/${agentId}/threads?${params.toString()}`;
}
