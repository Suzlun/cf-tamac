import {
  cancelSchedule,
  createSchedule,
  listSchedules,
} from '@cf-tamac/client/server/actions/agent-operations';
import { listThreads } from '@cf-tamac/client/server/actions/agent-queries';
import { getActingOperatorId } from '@cf-tamac/client/server/actions/managed-agents';

import { AgentDataUnavailableAlert } from '../../../../src/components/agent-data-unavailable-alert';
import { ControlRoomFrame } from '../../../../src/components/control-room-frame';
import { ScheduleList } from '../../../../src/components/schedule-list';

interface AgentSchedulesPageProps {
  readonly params: Promise<{ readonly agentId: string }>;
  readonly searchParams: Promise<{
    readonly thread?: string;
    readonly status?: string;
    readonly pageToken?: string;
  }>;
}

/**
 * Agent Schedule management page（AGENT-MANAGEMENT-UI-S006）。
 *
 * Schedule 一覧は Thread/status filter と scoped cursor を Agent RPC に渡し、
 * 作成/取消は Server Action の mutation 境界に閉じる。
 */
export default async function AgentSchedulesPage({
  params,
  searchParams,
}: AgentSchedulesPageProps) {
  const { agentId } = await params;
  const { thread, status, pageToken } = await searchParams;
  const actingOperatorId = await getActingOperatorId();

  try {
    // Schedule と Thread filter data は Agent RPC から取得し、Client D1 に Agent-domain snapshot を持たない。
    const [schedules, threads] = await Promise.all([
      listSchedules(agentId, {
        threadId: thread,
        status: status === 'all' ? undefined : status,
        page: { pageToken },
      }),
      listThreads(agentId),
    ]);

    return (
      <ScheduleList
        agentId={agentId}
        schedules={schedules.items}
        page={schedules.page}
        threads={threads.items}
        threadFilter={thread ?? ''}
        statusFilter={status ?? 'all'}
        actingOperatorId={actingOperatorId}
        onCreateSchedule={createSchedule}
        onCancelSchedule={cancelSchedule}
      />
    );
  } catch {
    // Agent RPC / credential resolution failure は secret-free な unavailable 表示に閉じる。
    return (
      <ControlRoomFrame title={`Agent registry › ${agentId}`} signalLabel="schedules">
        <AgentDataUnavailableAlert screenName="Schedules" />
      </ControlRoomFrame>
    );
  }
}
