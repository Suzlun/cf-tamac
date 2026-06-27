import { listEvents, listThreads } from '@cf-tamac/client/server/actions/agent-queries';

import { AgentDataUnavailableAlert } from '../../../../src/components/agent-data-unavailable-alert';
import { ControlRoomFrame } from '../../../../src/components/control-room-frame';
import { EventList } from '../../../../src/components/event-list';

interface AgentEventsPageProps {
  readonly params: Promise<{ readonly agentId: string }>;
  readonly searchParams: Promise<{
    readonly thread?: string;
    readonly type?: string;
    readonly pageToken?: string;
  }>;
}

/**
 * Agent Event log page（AGENT-MANAGEMENT-UI-S005）。
 *
 * Thread 選択と Event type filter を Server Action へ渡し、Agent-owned Event
 * payload は metadata のみを Browser へ渡す。
 */
export default async function AgentEventsPage({ params, searchParams }: AgentEventsPageProps) {
  const { agentId } = await params;
  const { thread, type, pageToken } = await searchParams;
  try {
    // Thread 選択肢と Event 一覧は Agent-owned data なので、server-side Agent RPC に閉じて取得する。
    const threads = await listThreads(agentId);
    const selectedThreadId = thread ?? threads.items[0]?.threadId ?? '';
    const events =
      selectedThreadId === ''
        ? { items: [], page: { resultCount: 0 } }
        : await listEvents(agentId, {
            threadId: selectedThreadId,
            eventType: type === 'all' ? undefined : type,
            page: { pageToken },
          });

    return (
      <EventList
        agentId={agentId}
        events={events.items}
        page={events.page}
        threads={threads.items}
        threadId={selectedThreadId}
        eventTypeFilter={type ?? 'all'}
      />
    );
  } catch {
    // Agent RPC / credential resolution failure は Next error page へ漏らさず、secret-free alert だけを表示する。
    return (
      <ControlRoomFrame title={`Agent registry › ${agentId}`} signalLabel="events">
        <AgentDataUnavailableAlert screenName="Events" />
      </ControlRoomFrame>
    );
  }
}
