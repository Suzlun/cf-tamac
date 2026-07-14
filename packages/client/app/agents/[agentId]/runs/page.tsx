import {
  approveInvocation,
  getInvocation,
  listInvocations,
  listTools,
  rejectInvocation,
} from '@cf-tamac/client/server/actions/agent-operations';
import { cancelRun, getRun, listRuns } from '@cf-tamac/client/server/actions/agent-queries';
import { getActingOperatorId } from '@cf-tamac/client/server/actions/managed-agents';

import { AgentDataUnavailableAlert } from '../../../../src/components/agent-data-unavailable-alert';
import { ControlRoomFrame } from '../../../../src/components/control-room-frame';
import { RunList } from '../../../../src/components/run-list';
import { ToolView } from '../../../../src/components/tool-view';

interface AgentRunsPageProps {
  readonly params: Promise<{ readonly agentId: string }>;
  readonly searchParams: Promise<{
    readonly thread?: string;
    readonly status?: string;
    readonly pageToken?: string;
  }>;
}

type RunListDisplayData = NonNullable<Awaited<ReturnType<typeof listRuns>>['displayData']['data']>;
type ToolListDisplayData = NonNullable<
  Awaited<ReturnType<typeof listTools>>['displayData']['data']
>;
type InvocationListDisplayData = NonNullable<
  Awaited<ReturnType<typeof listInvocations>>['displayData']['data']
>;

/**
 * Agent Run history 画面（AGENT-MANAGEMENT-UI-S005 / S007 / S019 / S020）。
 *
 * Run の一覧/detail を Agent RPC scoped request で取得する。加えて、ToolInvocation と
 * Tool catalog を Runs context の文脈 detail として表示する（タスク 2.6 / 3.7）。
 * Tool 承認/却下は明示的な user confirmation 後だけ server-side RPC として送る。
 * page-level frame は持たず、RunList / ToolView がそれぞれ section frame を提供する（nested frame を避ける）。
 * 全ての Browser payload は secret-free である。
 */
export default async function AgentRunsPage({ params, searchParams }: AgentRunsPageProps) {
  const { agentId } = await params;
  const { thread, status, pageToken } = await searchParams;

  // Acting user は Client server-side metadata であり、Agent RPC data の可否と独立して取得する。
  const actingOperatorId = await getActingOperatorId();
  // Agent RPC / credential resolution の失敗時も Runs route 自体は落とさず、safe fallback を描画する。
  let dataUnavailable = false;
  let runs: RunListDisplayData = { items: [], page: { resultCount: 0 } };
  let tools: ToolListDisplayData = { items: [], page: { resultCount: 0 } };
  let invocations: InvocationListDisplayData = {
    items: [],
    page: { resultCount: 0 },
  };

  try {
    // Run 一覧と Tool 文脈データを並行取得する。両者とも server-side Agent RPC 経由。
    const [runResult, toolResult, invocationResult] = await Promise.all([
      listRuns(agentId, {
        threadId: thread,
        status: status === 'all' ? undefined : status,
        page: { pageToken },
      }),
      listTools(agentId, { includeUnavailable: false }),
      listInvocations(agentId, { status: 'pending_approval', page: {} }),
    ]);
    if (
      runResult.safeStatus === 'failed' ||
      toolResult.safeStatus === 'failed' ||
      invocationResult.safeStatus === 'failed' ||
      runResult.displayData.data === undefined ||
      toolResult.displayData.data === undefined ||
      invocationResult.displayData.data === undefined
    ) {
      // failure envelope の raw error は読まず、固定 unavailable state へ閉じます。
      dataUnavailable = true;
    } else {
      runs = runResult.displayData.data;
      tools = toolResult.displayData.data;
      invocations = invocationResult.displayData.data;
    }
  } catch {
    // 例外詳細は secret-safe ではない可能性があるため Browser payload に含めない。
    dataUnavailable = true;
  }

  return (
    // 単一 page-level frame の配下に Run list と Tool catalog/approval を sub-section として統合する（wireframe IA）。
    <ControlRoomFrame
      title="Runs"
      signalLabel={`Agent ${agentId} › Runs`}
      description="Run history with sequence, status, causal links, and contextual Tool approval."
    >
      {dataUnavailable ? <AgentDataUnavailableAlert screenName="Runs" /> : null}
      {/* 文脈 detail: Tool catalog と pending ToolInvocation を Runs context で扱う（タスク 2.6 / 3.7）。 */}
      <RunList
        agentId={agentId}
        runs={runs.items}
        page={runs.page}
        threadFilter={thread ?? ''}
        statusFilter={status ?? 'all'}
        onGetRun={getRun}
        onCancelRun={cancelRun}
      />
      <ToolView
        agentId={agentId}
        tools={tools.items}
        invocations={invocations.items}
        invocationPage={invocations.page}
        statusFilter="pending_approval"
        actingOperatorId={actingOperatorId}
        onGetInvocation={getInvocation}
        onApprove={approveInvocation}
        onReject={rejectInvocation}
      />
    </ControlRoomFrame>
  );
}
