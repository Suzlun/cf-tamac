import {
  getLatestCompaction,
  getThread,
  getThreadMemory,
  listThreads,
  searchThreadHistory,
} from '@cf-tamac/client/server/actions/agent-queries';

import { AgentDataUnavailableAlert } from '../../../../src/components/agent-data-unavailable-alert';
import { CompactionView } from '../../../../src/components/compaction-view';
import { ControlRoomFrame } from '../../../../src/components/control-room-frame';
import { ThreadList } from '../../../../src/components/thread-list';

interface AgentThreadsPageProps {
  readonly params: Promise<{ readonly agentId: string }>;
  readonly searchParams: Promise<{
    readonly status?: string;
    readonly q?: string;
    readonly thread?: string;
    readonly pageToken?: string;
  }>;
}

/**
 * Agent Thread 一覧画面（AGENT-MANAGEMENT-UI-S005 / S019 / S020）。
 *
 * Thread 一覧/detail を取得するほか、ThreadCompaction / Memory / History を
 * Threads context の文脈 detail として表示する（タスク 2.6）。
 * 選択中 Thread の compaction/memory/history は Agent RPC から取得し、safe metadata のみを描画する。
 * page-level frame は持たず、ThreadList / CompactionView がそれぞれ section frame を提供する（nested frame を避ける）。
 */
export default async function AgentThreadsPage({ params, searchParams }: AgentThreadsPageProps) {
  const { agentId } = await params;
  const { status, q, thread, pageToken } = await searchParams;

  // Agent RPC / credential resolution の失敗を Next error boundary へ漏らさず、shell を保ったまま安全表示へ落とす。
  let dataUnavailable = false;
  let threads: Awaited<ReturnType<typeof listThreads>> = { items: [], page: { resultCount: 0 } };
  let latestCompaction: Awaited<ReturnType<typeof getLatestCompaction>> | undefined;
  let memory: Awaited<ReturnType<typeof getThreadMemory>> | undefined;
  let history: Awaited<ReturnType<typeof searchThreadHistory>> | undefined;

  try {
    // Thread 一覧は selected-Agent scope の入口であり、filter と cursor は server-side RPC にだけ渡す。
    threads = await listThreads(agentId, {
      status: status === 'all' ? undefined : status,
      threadKeyPrefix: q,
      page: { pageToken },
    });

    // 選択中 Thread の Compaction/Memory/History を文脈 detail として取得する（未選択時は取得しない）。
    const threadIdForDetail = thread ?? '';
    if (threadIdForDetail !== '') {
      [latestCompaction, memory, history] = await Promise.all([
        getLatestCompaction(agentId, threadIdForDetail),
        getThreadMemory(agentId, threadIdForDetail),
        // ThreadCompaction/History を文脈 detail として取得する（safe metadata のみ）。
        searchThreadHistory(agentId, threadIdForDetail, q ?? '', { page: { pageToken } }),
      ]);
    }
  } catch {
    // 例外詳細は Browser に出さず、画面構造と navigation を維持する。
    dataUnavailable = true;
  }

  // 選択中 Thread がない場合は detail RPC を呼ばず、一覧からの選択を促す。
  const threadId = thread ?? '';

  return (
    // 単一 page-level frame の配下に Thread list と Compaction/Memory を sub-section として統合する（wireframe IA）。
    <ControlRoomFrame
      title="Threads"
      signalLabel={`Agent ${agentId} › Threads`}
      description="Agent-owned threads with sequence, status, and contextual Compaction/Memory detail."
    >
      {dataUnavailable ? <AgentDataUnavailableAlert screenName="Threads" /> : null}
      <ThreadList
        agentId={agentId}
        threads={threads.items}
        page={threads.page}
        statusFilter={status ?? 'all'}
        threadKeyPrefix={q ?? ''}
        onGetThread={getThread}
      />
      {/* 文脈 detail: ThreadCompaction / Memory を Threads context で扱う（タスク 2.6 / AGENT-MANAGEMENT-UI-S020）。 */}
      <CompactionView
        agentId={agentId}
        threads={threads.items}
        selectedThreadId={threadId}
        latestCompaction={latestCompaction}
        memory={memory}
        history={history}
      />
    </ControlRoomFrame>
  );
}
