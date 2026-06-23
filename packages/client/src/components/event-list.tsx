'use client';

import Link from 'next/link';

import { AgentToken } from './agent-token';
import { ControlRoomFrame } from './control-room-frame';
import { DataTable } from './data-table';
import { EmptyState } from './empty-state';
import { ErrorAlert } from './error-alert';
import { PaginationBar } from './pagination-bar';

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

interface ThreadSummary {
  readonly threadId: string;
  readonly threadKey: string;
}

interface EventSummary {
  readonly eventId: string;
  readonly threadId: string;
  readonly sectionId: string;
  readonly agentSequence: string;
  readonly threadSequence: string;
  readonly eventType: string;
  readonly source: string;
  readonly occurredAtUnixMs: string;
  readonly correlationId?: string;
  readonly causationId?: string;
  readonly runId?: string;
  readonly payloadRef?: string;
  readonly payloadMetadata?: PayloadReference;
}

interface EventListProps {
  readonly agentId: string;
  readonly events: readonly EventSummary[];
  readonly page: PageInfo;
  readonly threads: readonly ThreadSummary[];
  readonly threadId: string;
  readonly eventTypeFilter: string;
}

/**
 * AgentEvent log list for a selected Thread。
 *
 * @param agentId - 表示対象 Agent ID。
 * @param events - Server Action が返した Browser-safe Event rows。
 * @param page - Agent/Thread-scoped cursor pagination metadata。
 * @param threads - Thread selector に使う Browser-safe Thread rows。
 * @param threadId - 現在選択されている Thread ID。
 * @param eventTypeFilter - 現在の Event type filter。
 * @returns Event sequence、payload metadata、causal links を含む一覧。
 */
export function EventList({
  agentId,
  events,
  page,
  threads,
  threadId,
  eventTypeFilter,
}: EventListProps) {
  return (
    <ControlRoomFrame
      title={`Agent registry › ${agentId}`}
      signalLabel="events"
      agentId={agentId}
      currentSection="events"
    >
      <p className="eyebrow">Events</p>
      <h2>AgentEvent log</h2>
      <AgentToken agentId={agentId} />
      <EventFilterBar
        agentId={agentId}
        threads={threads}
        threadId={threadId}
        eventTypeFilter={eventTypeFilter}
      />

      {threadId === '' ? (
        <ErrorAlert message="Select a Thread from the Threads tab to view its Events." />
      ) : events.length === 0 ? (
        <EmptyState
          eyebrow="NO EVENTS"
          heading="No Events yet."
          lead="Events are appended when the Agent accepts external or internal input."
        />
      ) : (
        <DataTable
          ariaLabel="Events"
          headers={[
            'Agent seq',
            'Thread seq',
            'Type',
            'Source',
            'Correlation',
            'Payload metadata',
            'Causal links',
          ]}
          rows={events.map((event) => [
            <span
              key={`agent-seq-${event.eventId}`}
              aria-label={`agent sequence ${event.agentSequence}`}
            >
              {event.agentSequence.padStart(5, '0')}
            </span>,
            <span
              key={`thread-seq-${event.eventId}`}
              aria-label={`thread sequence ${event.threadSequence}`}
            >
              {event.threadSequence.padStart(5, '0')}
            </span>,
            event.eventType,
            event.source,
            event.correlationId ?? '—',
            <PayloadMetadata key={`payload-${event.eventId}`} event={event} />,
            `causation: ${event.causationId ?? '—'} · run: ${event.runId ?? '—'}`,
          ])}
        />
      )}

      <PaginationBar
        basePath={`/agents/${agentId}/events`}
        page={page}
        extraQuery={{ thread: threadId, type: eventTypeFilter }}
      />
    </ControlRoomFrame>
  );
}

function EventFilterBar({
  agentId,
  threads,
  threadId,
  eventTypeFilter,
}: {
  readonly agentId: string;
  readonly threads: readonly ThreadSummary[];
  readonly threadId: string;
  readonly eventTypeFilter: string;
}) {
  return (
    <section className="readout" aria-label="Event filters">
      <div className="action-row" aria-live="polite">
        {threads.map((thread) => (
          <Link
            key={thread.threadId}
            className={`nav-link${thread.threadId === threadId ? ' state-pending' : ''}`}
            href={`/agents/${agentId}/events?thread=${thread.threadId}&type=${eventTypeFilter}`}
            aria-pressed={thread.threadId === threadId}
          >
            {thread.threadKey}
          </Link>
        ))}
      </div>
      <form className="action-row" method="get">
        <input type="hidden" name="thread" value={threadId} />
        <label className="eyebrow" htmlFor="event-type-filter">
          Type
        </label>
        <select
          id="event-type-filter"
          name="type"
          className="form-control"
          defaultValue={eventTypeFilter}
        >
          <option value="all">all</option>
          <option value="user.message.received">user.message.received</option>
          <option value="schedule.triggered">schedule.triggered</option>
          <option value="tool.invocation.succeeded">tool.invocation.succeeded</option>
          <option value="tool.invocation.failed">tool.invocation.failed</option>
        </select>
        <button type="submit" className="nav-link">
          Apply filter
        </button>
      </form>
    </section>
  );
}

function PayloadMetadata({ event }: { readonly event: EventSummary }) {
  if (event.payloadMetadata !== undefined) {
    return (
      <span>
        R2 ref metadata only: {event.payloadMetadata.ref} · digest {event.payloadMetadata.sha256} ·{' '}
        {event.payloadMetadata.byteSize} bytes
      </span>
    );
  }
  if (event.payloadRef !== undefined) {
    return <span>payload ref metadata only: {event.payloadRef}</span>;
  }
  return <span>inline metadata only</span>;
}
