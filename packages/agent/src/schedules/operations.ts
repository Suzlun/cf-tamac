import {
  assertAgentContext,
  authorizeAgentOperation,
  checkAgentIdempotency,
  completeAgentIdempotencyRecord,
  recordAgentIdempotency,
  requireAgentIdempotencyKey,
  reserveAgentNonce,
  reserveAgentIdempotencyRecord,
} from '../domain/agent-operation-utils';
import { createAgentDomainError } from '../domain/errors';
import { createThreadKeyIdentity } from '../threads';

import { normalizeScheduleOverlapPolicy } from './overlap';
import { parseAgentScheduleSpec } from './spec';
import {
  assertCursorScope,
  clampSchedulePageSize,
  createScheduleListCursorScope,
  createSchedulePage,
  mapScheduleRow,
  normalizeOptionalFilter,
  parseSchedulePageToken,
} from './views';

import type { AgentAuditView, AgentCoreRequestContext } from '../domain';
import type { AgentScheduleRow, AgentStorageRepositories, AgentThreadRow } from '../storage';
import type {
  CancelAgentScheduleCommand,
  CancelAgentScheduleResult,
  CleanupInstallationSchedulesCommand,
  CleanupInstallationSchedulesResult,
  CreateAgentScheduleCommand,
  CreateAgentScheduleResult,
  GetAgentScheduleQuery,
  GetAgentScheduleResult,
  ListAgentSchedulesQuery,
  ListAgentSchedulesResult,
  AgentScheduleRuntimePlan,
  AgentScheduleView,
} from './types';

const scheduleServiceName = 'cftamac.agent.v1.AgentScheduleService';
const createScheduleOperationName = 'AgentScheduleService.CreateSchedule';
const defaultScheduleCallbackIdentity = 'handleAgentScheduleCallback';

type CreateScheduleIdempotencyState =
  | { readonly status: 'new_command' }
  | { readonly response: CreateAgentScheduleResult; readonly status: 'replay' }
  | { readonly schedule: AgentScheduleRow; readonly status: 'resume' };

/**
 * CreateSchedule command を Agent-owned storage に保存します。
 *
 * @param input Agent ID、command、repository set を含む入力です。
 * @returns 作成済み Schedule と SDK 登録用 runtime plan を返します。
 * @throws AgentDomainError Thread context 不在、権限不足、不正 schedule_spec の場合に発生します。
 */
export function createScheduleInStore(input: {
  readonly agentId: string;
  readonly command: CreateAgentScheduleCommand;
  readonly repositories: AgentStorageRepositories;
}): CreateAgentScheduleResult {
  assertAgentContext(input.agentId, input.command.context);
  assertScheduleThreadContext(input.command);
  // 既存の成功応答だけは validation 前に返し、再送が副作用なく完了できるようにする。
  const idempotency = checkCreateScheduleIdempotency(input);
  if (idempotency.status === 'replay') return { ...idempotency.response, replayed: true };
  // 認可・所有権・schedule_spec 検証を予約前に済ませ、失敗した key を汚染しない。
  authorizeScheduleOperation(
    input.repositories,
    input.command.context,
    'schedule.create',
    'CreateSchedule'
  );
  assertInstallationOwnership(input.command.context, input.command.installationId);

  const nowMs = input.command.context.requestedAtMs;
  const parsedSpec = parseAgentScheduleSpec(input.command.scheduleSpec, nowMs);
  if (idempotency.status === 'resume') {
    // 予約済みだが応答未保存の command は、既存 Schedule row から安全に再開する。
    return createResumedScheduleResult(
      input.agentId,
      input.repositories,
      idempotency.schedule,
      parsedSpec.runtimePlan
    );
  }
  // nonce、idempotency record、Thread 解決、監査、Schedule row を同一 transaction に閉じる。
  const persisted = input.repositories.transaction((repositories) => {
    reserveAgentNonce(repositories, input.command.context);
    reserveAgentIdempotencyRecord({
      context: input.command.context,
      operationName: createScheduleOperationName,
      repositories,
    });
    const thread = resolveScheduleThread(input.agentId, repositories, input.command, nowMs);
    const audit = recordScheduleAudit(
      { ...input, repositories },
      'agent.schedule.created',
      'succeeded'
    );
    const schedule = insertSchedule(
      { ...input, repositories },
      thread,
      parsedSpec.runtimePlan,
      audit.auditEventId
    );
    return { audit, schedule };
  });
  return {
    audit: persisted.audit,
    replayed: false,
    runtimePlan: parsedSpec.runtimePlan,
    schedule: persisted.schedule,
  };
}

/**
 * runtime registration と bind が完了した CreateSchedule response を冪等 replay 用に保存します。
 *
 * @param input command、repository set、runtime 登録済み result です。
 * @throws AgentDomainError idempotency key が欠落している場合に発生します。
 */
export function completeCreateScheduleIdempotencyInStore(input: {
  readonly command: CreateAgentScheduleCommand;
  readonly repositories: AgentStorageRepositories;
  readonly result: CreateAgentScheduleResult;
}): void {
  const replayable = { ...input.result, runtimePlan: undefined };
  completeAgentIdempotencyRecord({
    context: input.command.context,
    repositories: input.repositories,
    response: replayable,
  });
}

function checkCreateScheduleIdempotency(input: {
  readonly command: CreateAgentScheduleCommand;
  readonly repositories: AgentStorageRepositories;
}): CreateScheduleIdempotencyState {
  const idempotencyKey = requireAgentIdempotencyKey(input.command.context);
  const existing = input.repositories.idempotency.findRecord(
    input.command.context.principal.principalId,
    idempotencyKey
  );
  if (existing === undefined) return { status: 'new_command' };
  if (existing.requestDigest !== input.command.context.bodyDigest.digestHex) {
    throw createAgentDomainError({
      kind: 'conflict',
      message: 'Idempotency key was already used with a different request digest.',
    });
  }
  if (existing.operationName !== createScheduleOperationName) {
    throw createAgentDomainError({
      kind: 'conflict',
      message: 'Idempotency key was already used for a different Agent operation.',
    });
  }
  if (existing.responseRef !== null) {
    return {
      response: JSON.parse(existing.responseRef) as CreateAgentScheduleResult,
      status: 'replay',
    };
  }
  const schedule = input.repositories.schedules.findByIdempotencyKey(idempotencyKey);
  if (schedule === undefined) {
    throw createAgentDomainError({
      kind: 'concurrency',
      message: 'Idempotent CreateSchedule command is still being recorded.',
    });
  }
  return { schedule, status: 'resume' };
}

function createResumedScheduleResult(
  agentId: string,
  repositories: AgentStorageRepositories,
  row: AgentScheduleRow,
  runtimePlan: AgentScheduleRuntimePlan
): CreateAgentScheduleResult {
  const profile = repositories.profile.getProfile();
  return {
    audit: {
      agentId,
      auditEventId: row.auditEventId ?? '',
      occurredAtMs: row.createdAtMs,
      operation: 'agent.schedule.created',
      principalId: row.createdByPrincipalId ?? 'system',
      result: 'succeeded',
      systemThreadId: profile?.systemThreadId ?? '',
    },
    replayed: false,
    runtimePlan: row.runtimeScheduleId === null ? runtimePlan : undefined,
    runtimeScheduleId: row.runtimeScheduleId ?? undefined,
    schedule: mapScheduleRow(agentId, row),
  };
}

/**
 * SDK runtime schedule の ID を Agent-owned Schedule に保存します。
 */
export function bindScheduleRuntimeInStore(input: {
  readonly agentId: string;
  readonly result: CreateAgentScheduleResult;
  readonly runtimeScheduleId: string;
  readonly runtimeNextFireAtMs?: number;
  readonly repositories: AgentStorageRepositories;
}): CreateAgentScheduleResult {
  const row = input.repositories.schedules.bindRuntimeSchedule({
    nextFireAtMs: input.runtimeNextFireAtMs,
    runtimeScheduleId: input.runtimeScheduleId,
    scheduleId: input.result.schedule.scheduleId,
    updatedAtMs: input.result.schedule.createdAtMs,
  });
  return {
    ...input.result,
    runtimeScheduleId: input.runtimeScheduleId,
    schedule: mapScheduleRow(input.agentId, row),
  };
}

/**
 * GetSchedule query を Agent-owned storage から取得します。
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

/**
 * CancelSchedule command を冪等に処理し、future callback side effect を停止します。
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

function insertSchedule(
  input: {
    readonly agentId: string;
    readonly command: CreateAgentScheduleCommand;
    readonly repositories: AgentStorageRepositories;
  },
  thread: AgentThreadRow,
  runtimePlan: AgentScheduleRuntimePlan,
  auditEventId: string
): AgentScheduleView {
  const row = input.repositories.schedules.insertSchedule({
    auditEventId,
    callbackIdentity: input.command.callbackIdentity ?? defaultScheduleCallbackIdentity,
    createdAtMs: input.command.context.requestedAtMs,
    createdByPrincipalId: input.command.context.principal.principalId,
    idempotencyKey: input.command.context.idempotencyKey ?? '',
    installationId: normalizeOptionalFilter(input.command.installationId),
    intervalSeconds: runtimePlan.kind === 'interval' ? runtimePlan.intervalSeconds : undefined,
    nextFireAtMs: runtimePlan.nextFireAtMs,
    normalizedThreadKey: thread.normalizedThreadKey,
    overlapPolicy: normalizeScheduleOverlapPolicy(input.command.overlapPolicy),
    scheduleId: crypto.randomUUID(),
    scheduleKind: runtimePlan.kind,
    scheduleSpec: input.command.scheduleSpec,
    status: 'active',
    threadId: thread.threadId,
    threadKey: thread.threadKey,
    updatedAtMs: input.command.context.requestedAtMs,
  });
  return mapScheduleRow(input.agentId, row);
}

function resolveScheduleThread(
  agentId: string,
  repositories: AgentStorageRepositories,
  command: CreateAgentScheduleCommand,
  nowMs: number
): AgentThreadRow {
  const threadId = normalizeOptionalFilter(command.threadId);
  if (threadId !== undefined) {
    const thread = repositories.threads.findByThreadId(threadId);
    if (thread === undefined)
      throw createAgentDomainError({ kind: 'not_found', message: 'Thread not found.' });
    return thread;
  }
  const identity = createThreadKeyIdentity(agentId, command.threadKey ?? '');
  const existing = repositories.threads.findByNormalizedThreadKey(identity.normalizedThreadKey);
  if (existing !== undefined) return existing;
  const createdThreadId = crypto.randomUUID();
  repositories.threads.insertThread({
    normalizedThreadKey: identity.normalizedThreadKey,
    nowMs,
    threadId: createdThreadId,
    threadKey: identity.threadKey,
  });
  const created = repositories.threads.findByThreadId(createdThreadId);
  if (created === undefined)
    throw createAgentDomainError({ kind: 'internal', message: 'Thread write failed.' });
  return created;
}

function recordScheduleAudit(
  input: {
    readonly agentId: string;
    readonly command?: { readonly context: AgentCoreRequestContext };
    readonly repositories: AgentStorageRepositories;
  },
  operation: string,
  result: string
): AgentAuditView {
  const context = input.command?.context;
  const nowMs = context?.requestedAtMs ?? Date.now();
  const auditId = crypto.randomUUID();
  input.repositories.audit.insertAuditEvent({
    auditId,
    createdAtMs: nowMs,
    eventType: operation,
    principalRef: context?.principal.principalId,
    requestDigest: context?.bodyDigest.digestHex,
  });
  appendScheduleAuditEvent(input.repositories, auditId, operation, nowMs, context);
  const profile = input.repositories.profile.getProfile();
  return {
    agentId: input.agentId,
    auditEventId: auditId,
    correlationId: context?.correlationId,
    occurredAtMs: nowMs,
    operation,
    principalId: context?.principal.principalId ?? 'system',
    result,
    systemThreadId: profile?.systemThreadId ?? '',
  };
}

function appendScheduleAuditEvent(
  repositories: AgentStorageRepositories,
  auditId: string,
  operation: string,
  nowMs: number,
  context: AgentCoreRequestContext | undefined
): void {
  const profile = repositories.profile.getProfile();
  const systemThread = repositories.threads.findByThreadId(profile?.systemThreadId ?? '');
  if (systemThread === undefined) return;
  const section = repositories.sections.findOpenSection(systemThread.threadId);
  if (section === undefined) return;
  repositories.events.appendEvent({
    createdAtMs: nowMs,
    eventId: crypto.randomUUID(),
    eventType: operation,
    idempotencyKey: `audit:${auditId}`,
    normalizedThreadKey: systemThread.normalizedThreadKey,
    occurredAtMs: nowMs,
    requestDigest: context?.bodyDigest.digestHex,
    sectionId: section.sectionId,
    sequences: repositories.events.getNextSequences(systemThread.threadId),
    source: 'agent.schedule',
    threadId: systemThread.threadId,
    threadKey: systemThread.threadKey,
  });
  repositories.sections.incrementEventCount(systemThread.threadId, section.sectionId);
}

function authorizeScheduleOperation(
  repositories: AgentStorageRepositories,
  context: AgentCoreRequestContext,
  action: string,
  method: string
): void {
  authorizeAgentOperation({
    action,
    context,
    method,
    repositories,
    requiredPrincipalTypes: [
      'CLIENT_SERVICE',
      'ADMIN_OPERATOR',
      'INTERNAL_SERVICE',
      'INTEGRATION_INSTALLATION',
    ],
    requiredScopes: ['agent.rpc', 'agent.schedule'],
    service: scheduleServiceName,
  });
}

function assertScheduleThreadContext(command: CreateAgentScheduleCommand): void {
  if (normalizeOptionalFilter(command.threadId) !== undefined) return;
  if (normalizeOptionalFilter(command.threadKey) !== undefined) return;
  throw createAgentDomainError({
    kind: 'validation',
    message: 'CreateSchedule requires thread_id or thread_key.',
  });
}

function assertInstallationOwnership(
  context: AgentCoreRequestContext,
  installationId: string | undefined
): void {
  if (
    installationId === undefined ||
    context.principal.principalType !== 'INTEGRATION_INSTALLATION'
  )
    return;
  if (context.principal.principalId === installationId) return;
  throw createAgentDomainError({
    kind: 'authorization',
    message: 'Installation-owned Schedule principal mismatch.',
  });
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
