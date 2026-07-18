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
 * Agent Event log page（AGENT-MANAGEMENT-UI-S005）を描画します。
 *
 * @param params - App Router から渡される route params です。`agentId` を解決し、Agent-scoped RPC の対象を決めます。
 * @param searchParams - Event 一覧の thread/type/pageToken filter です。未指定時は先頭 Thread と全 Event type を使います。
 * @returns Agent-owned Event metadata の一覧、または Agent RPC が利用できない場合の secret-free fallback alert を返します。
 * @throws この page は Agent RPC / credential 解決失敗を内部で捕捉し、Next error page へ再送出しません。
 *
 * @example
 * ```tsx
 * <AgentEventsPage
 *   params={Promise.resolve({ agentId: 'agent-alpha' })}
 *   searchParams={Promise.resolve({ type: 'all' })}
 * />
 * ```
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
