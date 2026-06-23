import {
  cancelSchedule,
  createSchedule,
  listSchedules,
} from '@cf-tamac/client/server/actions/agent-operations';
import { listThreads } from '@cf-tamac/client/server/actions/agent-queries';
import { getActingOperatorId } from '@cf-tamac/client/server/actions/managed-agents';

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
 * Agent Schedule management page（CLIENT-MANAGEMENT-S006）。
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
  const [schedules, threads, actingOperatorId] = await Promise.all([
    listSchedules(agentId, {
      threadId: thread,
      status: status === 'all' ? undefined : status,
      page: { pageToken },
    }),
    listThreads(agentId),
    getActingOperatorId(),
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
}
