import { assertAgentContext } from '../domain/agent-operation-utils';
import { createAgentDomainError } from '../domain/errors';

import { authorizeScheduleOperation } from './operations-shared';
import {
  assertCursorScope,
  clampSchedulePageSize,
  createScheduleListCursorScope,
  createSchedulePage,
  mapScheduleRow,
  normalizeOptionalFilter,
  parseSchedulePageToken,
} from './views';

import type { AgentStorageRepositories } from '../storage';
import type {
  GetAgentScheduleQuery,
  GetAgentScheduleResult,
  ListAgentSchedulesQuery,
  ListAgentSchedulesResult,
} from './types';

/**
 * GetSchedule query を Agent-owned storage から取得します。
 *
 * @param input Agent ID、GetSchedule query、Agent-owned repository set です。
 * @returns 取得した Schedule view を含む result です。
 * @throws Agent context、authorization、schedule lookup、repository 読み取りが失敗した場合に発生します。
 * @example
 * ```ts
 * const result = getScheduleFromStore({ agentId, query, repositories });
 * ```
 */
export function getScheduleFromStore(input: {
  readonly agentId: string;
  readonly query: GetAgentScheduleQuery;
  readonly repositories: AgentStorageRepositories;
}): GetAgentScheduleResult {
  assertAgentContext(input.agentId, input.query.context);
  authorizeScheduleOperation(
    input.repositories,
    input.query.context,
    'schedule.get',
    'GetSchedule'
  );
  const row = input.repositories.schedules.findByScheduleId(input.query.scheduleId);
  if (row === undefined) {
    throw createAgentDomainError({ kind: 'not_found', message: 'Schedule not found.' });
  }
  return { schedule: mapScheduleRow(input.agentId, row) };
}

/**
 * ListSchedules query を Agent scope と cursor scope に従って処理します。
 *
 * @param input Agent ID、ListSchedules query、Agent-owned repository set です。
 * @returns Schedule view 配列と cursor page metadata を含む list result です。
 * @throws Agent context、authorization、cursor scope/page token、repository 読み取りが失敗した場合に発生します。
 * @example
 * ```ts
 * const result = listSchedulesFromStore({ agentId, query, repositories });
 * ```
 */
export function listSchedulesFromStore(input: {
  readonly agentId: string;
  readonly query: ListAgentSchedulesQuery;
  readonly repositories: AgentStorageRepositories;
}): ListAgentSchedulesResult {
  assertAgentContext(input.agentId, input.query.context);
  authorizeScheduleOperation(
    input.repositories,
    input.query.context,
    'schedule.list',
    'ListSchedules'
  );
  const cursorScope = createScheduleListCursorScope(input.agentId);
  assertCursorScope(input.query.pageCursorScope, cursorScope);
  const pageSize = clampSchedulePageSize(input.query.pageSize);
  const rows = input.repositories.schedules.listSchedules({
    ...parseSchedulePageToken(input.query.pageToken),
    installationId: normalizeOptionalFilter(input.query.installationId),
    limit: pageSize + 1,
    status: normalizeOptionalFilter(input.query.status),
    threadId: normalizeOptionalFilter(input.query.threadId),
  });
  const pageRows = rows.slice(0, pageSize);
  return {
    page: createSchedulePage(cursorScope, pageRows, rows.length > pageSize),
    schedules: pageRows.map((row) => mapScheduleRow(input.agentId, row)),
  };
}
