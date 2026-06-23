import { getThread, listThreads } from '@cf-tamac/client/server/actions/agent-queries';

import { ThreadList } from '../../../../src/components/thread-list';

interface AgentThreadsPageProps {
  readonly params: Promise<{ readonly agentId: string }>;
  readonly searchParams: Promise<{
    readonly status?: string;
    readonly q?: string;
    readonly pageToken?: string;
  }>;
}

/**
 * Agent Thread list page（CLIENT-MANAGEMENT-S005）。
 *
 * Agent-owned Thread を Server Action 経由で取得し、filter と cursor を
 * Agent scope に閉じたまま表示コンポーネントへ渡す。
 */
export default async function AgentThreadsPage({ params, searchParams }: AgentThreadsPageProps) {
  const { agentId } = await params;
  const { status, q, pageToken } = await searchParams;
  const threads = await listThreads(agentId, {
    status: status === 'all' ? undefined : status,
    threadKeyPrefix: q,
    page: { pageToken },
  });

  return (
    <ThreadList
      agentId={agentId}
      threads={threads.items}
      page={threads.page}
      statusFilter={status ?? 'all'}
      threadKeyPrefix={q ?? ''}
      onGetThread={getThread}
    />
  );
}
