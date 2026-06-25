import {
  approveInvocation,
  getInvocation,
  listInvocations,
  listTools,
  rejectInvocation,
} from '@cf-tamac/client/server/actions/agent-operations';
import { getActingOperatorId } from '@cf-tamac/client/server/actions/managed-agents';

import { ToolView } from '../../../../src/components/tool-view';

interface AgentToolsPageProps {
  readonly params: Promise<{ readonly agentId: string }>;
  readonly searchParams: Promise<{
    readonly status?: string;
    readonly thread?: string;
    readonly pageToken?: string;
  }>;
}

/**
 * Tool catalog and approval queue page（AGENT-MANAGEMENT-UI-S007）。
 *
 * Tool catalog と ToolInvocation queue は Server Action 経由で取得し、
 * approve/reject は explicit confirmation 後だけ server-side RPC として送る。
 */
export default async function AgentToolsPage({ params, searchParams }: AgentToolsPageProps) {
  const { agentId } = await params;
  const { status, thread, pageToken } = await searchParams;
  const [tools, invocations, actingOperatorId] = await Promise.all([
    listTools(agentId, { includeUnavailable: false }),
    listInvocations(agentId, {
      status: status === 'all' ? undefined : status,
      threadId: thread,
      page: { pageToken },
    }),
    getActingOperatorId(),
  ]);

  return (
    <ToolView
      agentId={agentId}
      tools={tools.items}
      invocations={invocations.items}
      invocationPage={invocations.page}
      statusFilter={status ?? 'pending_approval'}
      actingOperatorId={actingOperatorId}
      onGetInvocation={getInvocation}
      onApprove={approveInvocation}
      onReject={rejectInvocation}
    />
  );
}
