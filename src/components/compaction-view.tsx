'use client';

import Link from 'next/link';

import { AgentToken } from './agent-token';
import { DataTable } from './data-table';
import { EmptyState } from './empty-state';
import { ErrorAlert } from './error-alert';
import { PaginationBar } from './pagination-bar';
import { Button } from './ui/button';
import { Input } from './ui/input';

interface PayloadReference {
  readonly ref: string;
  readonly contentType: string;
  readonly byteSize: string;
  readonly sha256: string;
  readonly storageClass: string;
}

interface PageInfo {
  readonly nextPageToken?: string;
  readonly resultCount: number;
  readonly cursorScope?: string;
}

interface ThreadSummary {
  readonly threadId: string;
  readonly threadKey: string;
  readonly status: string;
}

interface CompactionSnapshot {
  readonly snapshotRef: string;
  readonly digestSha256: string;
}

interface CompactionDetail {
  readonly compactionId?: string;
  readonly status?: string;
  readonly threadId?: string;
  readonly sectionId?: string;
  readonly handoffRef?: string;
  readonly historyRef?: string;
  readonly memoryDeltaRef?: string;
  readonly digestSha256?: string;
  readonly compactionOrdinal?: number;
  readonly sectionOrdinal?: number;
  readonly startThreadSequence?: string;
  readonly endThreadSequence?: string;
  readonly snapshot?: CompactionSnapshot;
}

interface MemoryItem {
  readonly memoryItemId: string;
  readonly status: string;
  readonly contentRef?: PayloadReference;
  readonly provenanceRef?: string;
  readonly supersedesItemId?: string;
}

interface MemoryDetail {
  readonly memoryId?: string;
  readonly version?: string;
  readonly itemCount: number;
  readonly memoryRef?: string;
  readonly snapshotRef?: string;
  readonly latestCompactionId?: string;
  readonly rebaseStatus?: string;
  readonly items: readonly MemoryItem[];
}

interface HistoryItem {
  readonly historyId: string;
  readonly historyRef: string;
  readonly sectionId?: string;
  readonly compactionId?: string;
  readonly summary?: string;
  readonly body?: PayloadReference;
  readonly provenanceRef?: string;
  readonly createdAtUnixMs?: string;
}

interface HistoryResult {
  readonly items: readonly HistoryItem[];
  readonly page: PageInfo;
}

interface CompactionViewProps {
  readonly agentId: string;
  readonly threads: readonly ThreadSummary[];
  readonly selectedThreadId: string;
  readonly latestCompaction?: CompactionDetail;
  readonly memory?: MemoryDetail;
  readonly history?: HistoryResult;
}

const METADATA_ONLY_LABEL = 'metadata only';

/**
 * Compaction、ThreadMemory、ThreadHistory の exploration view。
 *
 * @param agentId - 表示対象 Agent ID。
 * @param threads - Thread selector 用の Browser-safe Thread rows。
 * @param selectedThreadId - 現在選択している Thread ID。
 * @param latestCompaction - latest ready Compaction metadata。
 * @param memory - active ThreadMemory metadata と provenance。
 * @param history - ThreadHistory search result と cursor metadata。
 * @returns Handoff / History / Memory provenance を表示する三つの zone。
 */
export function CompactionView({
  agentId,
  threads,
  selectedThreadId,
  latestCompaction,
  memory,
  history,
}: CompactionViewProps) {
  const selectedThread = threads.find((thread) => thread.threadId === selectedThreadId);

  return (
    // page-level ControlRoomFrame は親 page が1つだけ提供する。CompactionView は sub-section として描画する。
    <section aria-label="Compaction and Memory detail" className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Section boundaries, Handoff, History, Memory</h2>
      </div>
      <AgentToken agentId={agentId} />

      {threads.length === 0 ? (
        <EmptyState
          eyebrow="NO THREADS"
          heading="No Threads yet."
          lead="Compactions appear after the Agent freezes a Section and generates Handoff/History/Memory."
        />
      ) : selectedThread === undefined ? (
        <ThreadSelectorTable agentId={agentId} threads={threads} />
      ) : (
        <CompactionDetailContent
          agentId={agentId}
          selectedThread={selectedThread}
          latestCompaction={latestCompaction}
          memory={memory}
          history={history}
        />
      )}
    </section>
  );
}

function ThreadSelectorTable({
  agentId,
  threads,
}: {
  readonly agentId: string;
  readonly threads: readonly ThreadSummary[];
}) {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Select a Thread to view its latest compaction, memory, and history.
      </p>
      <DataTable
        ariaLabel="Threads"
        headers={['Thread key', 'Status']}
        rows={threads.map((thread) => [
          <Link
            key={thread.threadId}
            className="inline-flex items-center rounded-md border px-3 py-1.5 text-sm hover:bg-accent"
            href={`/agents/${agentId}/threads?thread=${thread.threadId}`}
          >
            {thread.threadKey}
          </Link>,
          thread.status,
        ])}
      />
    </>
  );
}

function CompactionDetailContent({
  agentId,
  selectedThread,
  latestCompaction,
  memory,
  history,
}: {
  readonly agentId: string;
  readonly selectedThread: ThreadSummary;
  readonly latestCompaction?: CompactionDetail;
  readonly memory?: MemoryDetail;
  readonly history?: HistoryResult;
}) {
  return (
    <>
      <p className="text-sm text-muted-foreground">
        Thread: {selectedThread.threadKey} ({selectedThread.status})
      </p>
      <LatestCompactionZone latestCompaction={latestCompaction} />
      <ThreadMemoryZone memory={memory} />
      <ThreadHistoryZone agentId={agentId} threadId={selectedThread.threadId} history={history} />
    </>
  );
}

function LatestCompactionZone({
  latestCompaction,
}: {
  readonly latestCompaction?: CompactionDetail;
}) {
  return (
    <section
      className="rounded-md border bg-card p-4 text-sm space-y-1"
      aria-labelledby="compaction-heading"
    >
      <strong id="compaction-heading">LATEST READY COMPACTION</strong>
      {latestCompaction?.compactionId === undefined ? (
        <ErrorAlert message="No compaction data available." />
      ) : (
        <>
          <p>compaction_id: {latestCompaction.compactionId}</p>
          <p>section_id: {latestCompaction.sectionId ?? '—'}</p>
          <p>status: {latestCompaction.status ?? '—'}</p>
          <p>ordinal: {latestCompaction.compactionOrdinal ?? '—'}</p>
          <p>
            event range: {latestCompaction.startThreadSequence ?? '—'} →{' '}
            {latestCompaction.endThreadSequence ?? '—'}
          </p>
          <p>handoff ref: {latestCompaction.handoffRef ?? METADATA_ONLY_LABEL}</p>
          <p>history ref: {latestCompaction.historyRef ?? METADATA_ONLY_LABEL}</p>
          <p>memory delta ref: {latestCompaction.memoryDeltaRef ?? METADATA_ONLY_LABEL}</p>
          <p>
            digest:{' '}
            {latestCompaction.digestSha256 ?? latestCompaction.snapshot?.digestSha256 ?? '—'}
          </p>
          <details>
            <summary>View full Handoff metadata</summary>
            <pre className="h-9 w-full rounded-md border bg-transparent px-3 text-sm">
              {JSON.stringify(
                {
                  handoffRef: latestCompaction.handoffRef,
                  snapshotRef: latestCompaction.snapshot?.snapshotRef,
                  digest: latestCompaction.snapshot?.digestSha256,
                },
                null,
                2
              )}
            </pre>
          </details>
        </>
      )}
    </section>
  );
}

function ThreadMemoryZone({ memory }: { readonly memory?: MemoryDetail }) {
  return (
    <section
      className="rounded-md border bg-card p-4 text-sm space-y-1"
      aria-labelledby="memory-heading"
    >
      <strong id="memory-heading">THREAD MEMORY</strong>
      {memory === undefined ? (
        <ErrorAlert message="No memory data available." />
      ) : (
        <>
          <p>active version: {memory.version ?? '—'}</p>
          <p>memory_ref: {memory.memoryRef ?? METADATA_ONLY_LABEL}</p>
          <p>snapshot_ref: {memory.snapshotRef ?? METADATA_ONLY_LABEL}</p>
          <p>latest_compaction_id: {memory.latestCompactionId ?? '—'}</p>
          <p>rebase_status: {memory.rebaseStatus ?? '—'}</p>
          <ul aria-label="Thread Memory items with provenance">
            {memory.items.map((item) => (
              <li key={item.memoryItemId}>
                {item.memoryItemId} — status: {item.status} — provenance:{' '}
                {item.provenanceRef ?? '—'} — content:{' '}
                {item.contentRef === undefined
                  ? METADATA_ONLY_LABEL
                  : `${item.contentRef.ref} · digest ${item.contentRef.sha256}`}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

function ThreadHistoryZone({
  agentId,
  threadId,
  history,
}: {
  readonly agentId: string;
  readonly threadId: string;
  readonly history?: HistoryResult;
}) {
  return (
    <section
      className="space-y-4 rounded-lg border bg-card p-5 text-sm"
      aria-labelledby="history-heading"
    >
      <strong id="history-heading">THREAD HISTORY SEARCH</strong>
      <form
        className="grid gap-3 sm:grid-cols-[minmax(14rem,24rem)_auto] sm:items-end"
        method="get"
      >
        <input type="hidden" name="thread" value={threadId} />
        <div className="space-y-2">
          <label
            className="text-xs font-medium uppercase tracking-wide text-muted-foreground"
            htmlFor="history-query"
          >
            Search
          </label>
          <Input id="history-query" name="q" placeholder="query…" />
        </div>
        <Button type="submit" variant="outline">
          Search History
        </Button>
      </form>
      {history === undefined ? (
        <ErrorAlert message="No history data available." />
      ) : history.items.length === 0 ? (
        <EmptyState
          eyebrow="NO HISTORY"
          heading="No History yet."
          lead="History entries appear after successful Compaction output."
        />
      ) : (
        <ul aria-label="Thread History results with provenance">
          {history.items.map((result) => (
            <li key={result.historyId}>
              {result.summary ?? result.historyRef} — section: {result.sectionId ?? '—'} —
              compaction: {result.compactionId ?? '—'} — provenance: {result.provenanceRef ?? '—'} —
              body:{' '}
              {result.body === undefined
                ? METADATA_ONLY_LABEL
                : `R2 ref metadata ${result.body.ref} · digest ${result.body.sha256} · ${result.body.byteSize} bytes`}
            </li>
          ))}
        </ul>
      )}
      {history === undefined ? null : (
        <PaginationBar
          basePath={`/agents/${agentId}/threads`}
          page={history.page}
          extraQuery={{ thread: threadId }}
        />
      )}
    </section>
  );
}
