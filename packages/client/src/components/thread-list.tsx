'use client';

import Link from 'next/link';
import { startTransition, useState } from 'react';

import { AgentToken } from './agent-token';
import { DataTable } from './data-table';
import { DetailDrawer } from './detail-drawer';
import { EmptyState } from './empty-state';
import { ErrorAlert } from './error-alert';
import { PaginationBar } from './pagination-bar';
import { Button } from './ui/button';
import { Input } from './ui/input';

import type {
  BrowserSafeAgentRpcResult,
  BrowserSafeOperationDisplayData,
} from './schemas/browser-safe-result';

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
  readonly onGetThread: (
    agentId: string,
    threadId: string
  ) => Promise<BrowserSafeThreadQueryResult>;
}

type BrowserSafeThreadQueryResult = BrowserSafeAgentRpcResult<
  BrowserSafeOperationDisplayData & { readonly data?: ThreadDetail }
>;

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
  const [detailError, setDetailError] = useState<string | undefined>();

  const openThread = async (threadId: string) => {
    // 新しい detail request 開始時に旧 selection を transition で明示的に消し、失敗後に stale Thread detail を残しません。
    startTransition(() => {
      setSelected(undefined);
      setPending(true);
      setDetailError(undefined);
    });
    try {
      const result = await onGetThread(agentId, threadId);
      if (result.safeStatus === 'failed' || result.displayData.data === undefined) {
        // Server Action が返した固定安全文言だけを表示し、SDK/Connect error は Browser で読まない。
        startTransition(() => {
          setSelected(undefined);
          setDetailError(result.displayData.message);
        });
        return;
      }
      startTransition(() => {
        setSelected(result.displayData.data);
      });
    } catch {
      // envelope 契約外の失敗でも raw detail を表示せず、再試行可能な固定安全文言へ丸めます。
      startTransition(() => {
        setSelected(undefined);
        setDetailError('Thread詳細を確認できませんでした。時間をおいてもう一度表示してください。');
      });
    } finally {
      startTransition(() => {
        setPending(false);
      });
    }
  };

  return (
    // page-level ControlRoomFrame は親 page が1つだけ提供するため、ここでは frame を持たず内容のみ描画する。
    <div className="space-y-4">
      <AgentToken agentId={agentId} />
      <ThreadFilterBar
        agentId={agentId}
        statusFilter={statusFilter}
        threadKeyPrefix={threadKeyPrefix}
      />
      {detailError !== undefined ? <ErrorAlert message={detailError} /> : null}

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
    </div>
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
    <section className="space-y-4 rounded-lg border bg-card p-5" aria-label="Thread filters">
      <div className="flex flex-wrap gap-2" aria-live="polite">
        {statuses.map((status) => (
          <Button
            key={status}
            asChild
            variant={statusFilter === status ? 'secondary' : 'outline'}
            size="sm"
            aria-pressed={statusFilter === status}
          >
            <Link href={buildThreadsHref(agentId, status, threadKeyPrefix)}>{status}</Link>
          </Button>
        ))}
      </div>
      <form
        className="grid gap-3 sm:grid-cols-[minmax(14rem,24rem)_auto] sm:items-end"
        method="get"
      >
        <input type="hidden" name="status" value={statusFilter} />
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground" htmlFor="thread-key-prefix">
            Search thread_key
          </label>
          <Input
            id="thread-key-prefix"
            name="q"
            defaultValue={threadKeyPrefix}
            placeholder="thread_key…"
          />
        </div>
        <Button variant="outline" type="submit">
          Apply filter
        </Button>
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
        <Button
          key={`key-${thread.threadId}`}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void onOpen(thread.threadId);
          }}
          disabled={pending}
          aria-label={`Open Thread ${thread.threadKey}`}
        >
          {thread.threadKey}
        </Button>,
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
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        THREAD DETAIL
      </p>
      <p>thread_id: {detail.threadId}</p>
      <p>thread_key: {detail.threadKey}</p>
      <p>status: {detail.status}</p>
      <p>current_section_id: {detail.currentSection?.sectionId ?? '—'}</p>
      <p>section ordinal: {detail.currentSection?.sectionOrdinal ?? '—'}</p>
      <p>
        section range: {detail.currentSection?.startThreadSequence ?? '—'} →{' '}
        {detail.currentSection?.endThreadSequence ?? 'open'}
      </p>
      <section
        className="rounded-md border bg-card p-4 text-sm space-y-1"
        aria-label="Latest Event"
      >
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
      <section className="rounded-md border bg-card p-4 text-sm space-y-1" aria-label="Latest Run">
        <strong>LATEST RUN</strong>
        <p>run_id: {detail.latestRun?.runId ?? '—'}</p>
        <p>status: {detail.latestRun?.status ?? '—'}</p>
      </section>
      <div className="flex flex-wrap gap-2">
        <Link
          className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
          href={`/agents/${agentId}/events?thread=${detail.threadId}`}
        >
          Open Events for this Thread
        </Link>
        <Link
          className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
          href={`/agents/${agentId}/runs?thread=${detail.threadId}`}
        >
          Open Runs for this Thread
        </Link>
        <Link
          className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
          href={`/agents/${agentId}/threads?thread=${detail.threadId}`}
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
