import {
  getLatestCompaction,
  getThreadMemory,
  listThreads,
  searchThreadHistory,
} from '@cf-tamac/client/server/actions/agent-queries';

import { CompactionView } from '../../../../src/components/compaction-view';

interface AgentCompactionsPageProps {
  readonly params: Promise<{ readonly agentId: string }>;
  readonly searchParams: Promise<{
    readonly thread?: string;
    readonly q?: string;
    readonly historyPageToken?: string;
  }>;
}

/**
 * Compaction, Memory, and History view page（AGENT-MANAGEMENT-UI-S005）。
 *
 * Handoff / History / Memory provenance を Agent RPC から取得し、R2 参照は
 * metadata のみを Browser へ渡す。
 */
export default async function AgentCompactionsPage({
  params,
  searchParams,
}: AgentCompactionsPageProps) {
  const { agentId } = await params;
  const { thread, q, historyPageToken } = await searchParams;
  const threadId = thread ?? '';

  const threads = await listThreads(agentId);
  const latestCompaction =
    threadId === '' ? undefined : await getLatestCompaction(agentId, threadId);
  const memory = threadId === '' ? undefined : await getThreadMemory(agentId, threadId);
  const history =
    threadId === ''
      ? undefined
      : await searchThreadHistory(agentId, threadId, q ?? '', {
          page: { pageToken: historyPageToken },
        });

  return (
    <CompactionView
      agentId={agentId}
      threads={threads.items}
      selectedThreadId={threadId}
      latestCompaction={latestCompaction}
      memory={memory}
      history={history}
    />
  );
}
