import { cancelRun, getRun, listRuns } from '@cf-tamac/client/server/actions/agent-queries';

import { RunList } from '../../../../src/components/run-list';

interface AgentRunsPageProps {
  readonly params: Promise<{ readonly agentId: string }>;
  readonly searchParams: Promise<{
    readonly thread?: string;
    readonly status?: string;
    readonly pageToken?: string;
  }>;
}

/**
 * AgentRun history page（AGENT-MANAGEMENT-UI-S005）。
 *
 * Run status と Thread filter を Agent RPC の scoped request へ渡し、Run の
 * snapshot detail は Server Action から Browser-safe view として取得する。
 */
export default async function AgentRunsPage({ params, searchParams }: AgentRunsPageProps) {
  const { agentId } = await params;
  const { thread, status, pageToken } = await searchParams;
  const runs = await listRuns(agentId, {
    threadId: thread,
    status: status === 'all' ? undefined : status,
    page: { pageToken },
  });

  return (
    <RunList
      agentId={agentId}
      runs={runs.items}
      page={runs.page}
      threadFilter={thread ?? ''}
      statusFilter={status ?? 'all'}
      onGetRun={getRun}
      onCancelRun={cancelRun}
    />
  );
}
