import {
  assertAgentContext,
  checkAgentIdempotency,
  recordAgentIdempotency,
  reserveAgentNonce,
} from '../domain/agent-operation-utils';
import { createAgentDomainError } from '../domain/errors';

import { authorizeScheduleOperation, recordScheduleAudit } from './operations-shared';
import { mapScheduleRow } from './views';

import type { AgentScheduleRow, AgentStorageRepositories } from '../storage';
import type {
  CancelAgentScheduleCommand,
  CancelAgentScheduleResult,
  CleanupInstallationSchedulesCommand,
  CleanupInstallationSchedulesResult,
} from './types';

/**
 * CancelSchedule command を冪等に処理し、future callback side effect を停止します。
 *
 * @param input Agent ID、CancelSchedule command、Agent-owned repository set です。
 * @returns 取消後 Schedule、audit、runtime schedule ID、idempotency replay 状態を含む result です。
 * @throws Agent context、nonce、authorization、schedule lookup、repository 操作が失敗した場合に発生します。
 * @example
 * ```ts
 * const result = cancelScheduleInStore({ agentId, command, repositories });
 * ```
 */
export function cancelScheduleInStore(input: {
  readonly agentId: string;
  readonly command: CancelAgentScheduleCommand;
  readonly repositories: AgentStorageRepositories;
}): CancelAgentScheduleResult {
  assertAgentContext(input.agentId, input.command.context);
  const replay = checkAgentIdempotency<CancelAgentScheduleResult>({
    context: input.command.context,
    operationName: 'AgentScheduleService.CancelSchedule',
    repositories: input.repositories,
  });
  if (replay.status === 'replay') return { ...replay.response, replayed: true };
  reserveAgentNonce(input.repositories, input.command.context);
  authorizeScheduleOperation(
    input.repositories,
    input.command.context,
    'schedule.cancel',
    'CancelSchedule'
  );
  const current = requireSchedule(input.repositories, input.command.scheduleId);
  const audit = recordScheduleAudit(input, 'agent.schedule.cancelled', 'cancelled');
  const row =
    current.status === 'cancelled' || current.status === 'disabled'
      ? current
      : input.repositories.schedules.cancelSchedule({
          auditEventId: audit.auditEventId,
          cancelledAtMs: input.command.context.requestedAtMs,
          cancelledByPrincipalId: input.command.context.principal.principalId,
          reason: input.command.reason,
          scheduleId: input.command.scheduleId,
          status: 'cancelled',
        });
  const result = {
    audit,
    replayed: false,
    runtimeScheduleId: current.runtimeScheduleId ?? undefined,
    schedule: mapScheduleRow(input.agentId, row),
  };
  recordAgentIdempotency({
    context: input.command.context,
    operationName: 'AgentScheduleService.CancelSchedule',
    repositories: input.repositories,
    response: result,
  });
  return result;
}

/**
 * Integration disabled/uninstalled に伴う Schedule cleanup を保存します。
 *
 * @param input Agent ID、cleanup command、Agent-owned repository set です。
 * @returns cleanup audit、取消/無効化した Schedule view、runtime schedule ID 一覧を含む result です。
 * @throws Agent context、authorization、repository 操作が失敗した場合に発生します。
 * @example
 * ```ts
 * const result = cleanupInstallationSchedulesInStore({ agentId, command, repositories });
 * ```
 */
export function cleanupInstallationSchedulesInStore(input: {
  readonly agentId: string;
  readonly command: CleanupInstallationSchedulesCommand;
  readonly repositories: AgentStorageRepositories;
}): CleanupInstallationSchedulesResult {
  assertAgentContext(input.agentId, input.command.context);
  authorizeScheduleOperation(
    input.repositories,
    input.command.context,
    'schedule.cleanup',
    'CleanupSchedules'
  );
  const audit = recordScheduleAudit(
    input,
    'agent.schedule.installation_cleanup',
    input.command.status
  );
  const rows = input.repositories.schedules.cancelSchedulesByInstallation({
    auditEventId: audit.auditEventId,
    cancelledAtMs: input.command.context.requestedAtMs,
    cancelledByPrincipalId: input.command.context.principal.principalId,
    installationId: input.command.installationId,
    reason: input.command.reason ?? 'integration_cleanup',
    status: input.command.status,
  });
  return {
    audit,
    cancelledSchedules: rows.map((row) => mapScheduleRow(input.agentId, row)),
    runtimeScheduleIds: rows.flatMap((row) =>
      row.runtimeScheduleId === null ? [] : [row.runtimeScheduleId]
    ),
  };
}

function requireSchedule(
  repositories: AgentStorageRepositories,
  scheduleId: string
): AgentScheduleRow {
  const row = repositories.schedules.findByScheduleId(scheduleId);
  if (row === undefined)
    throw createAgentDomainError({ kind: 'not_found', message: 'Schedule not found.' });
  return row;
}
