import {
  assertAgentContext,
  authorizeAgentOperation,
  checkAgentIdempotency,
  recordAgentIdempotency,
  reserveAgentNonce,
} from '../domain/agent-operation-utils';
import { createAgentDomainError } from '../domain/errors';

import { assertRunStatus, isTerminalRunStatus } from './foundation';
import { createGetRunResult, mapAgentRunDetailRow } from './views';

import type { AgentAuditView, AgentCoreRequestContext, AgentPageView } from '../domain';
import type { AgentRunRow, AgentStorageRepositories } from '../storage';
import type { RunStatus } from './foundation';
import type { CancelAgentRunResult, GetAgentRunResult, ListAgentRunsResult } from './views';

const runServiceName = 'cftamac.agent.v1.AgentRunService';
const cancelRunOperationName = 'AgentRunService.CancelRun';

/**
 * Agent-scoped GetRun query accepted by the Durable Object.
 */
export interface GetAgentRunQuery {
  readonly context: AgentCoreRequestContext;
  readonly runId: string;
}

/**
 * Agent-scoped ListRuns query accepted by the Durable Object.
 */
export interface ListAgentRunsQuery {
  readonly context: AgentCoreRequestContext;
  readonly endMs?: number;
  readonly pageCursorScope?: string;
  readonly pageSize?: number;
  readonly pageToken?: string;
  readonly startMs?: number;
  readonly status?: string;
  readonly threadId?: string;
}

/**
 * Agent-scoped CancelRun command accepted by the Durable Object.
 */
export interface CancelAgentRunCommand {
  readonly context: AgentCoreRequestContext;
  readonly reason?: string;
  readonly runId: string;
}

/**
 * Return one AgentRun with immutable snapshot metadata after Agent-local authorization.
 */
export function getRunFromStore(input: {
  readonly agentId: string;
  readonly query: GetAgentRunQuery;
  readonly repositories: AgentStorageRepositories;
}): Promise<GetAgentRunResult> {
  assertAgentContext(input.agentId, input.query.context);
  authorizeRunOperation(input.repositories, input.query.context, 'run.get', 'GetRun', 'read');
  const run = requireRun(input.repositories, input.query.runId);
  return createGetRunResult({ agentId: input.agentId, repositories: input.repositories, run });
}

/**
 * Return Agent-scoped Runs filtered by Thread, status, time range, and cursor scope.
 */
export function listRunsFromStore(input: {
  readonly agentId: string;
  readonly query: ListAgentRunsQuery;
  readonly repositories: AgentStorageRepositories;
}): ListAgentRunsResult {
  assertAgentContext(input.agentId, input.query.context);
  authorizeRunOperation(input.repositories, input.query.context, 'run.list', 'ListRuns', 'read');
  assertTimeRange(input.query.startMs, input.query.endMs);
  assertThreadFilter(input.repositories, input.query.threadId);
  const cursorScope = createRunListCursorScope(input.agentId, input.query);
  assertCursorScope(input.query.pageCursorScope, cursorScope);
  const pageSize = clampPageSize(input.query.pageSize);
  const cursor = parseRunPageToken(input.query.pageToken);
  const rows = input.repositories.pendingRuns.listRuns({
    afterCreatedAtMs: cursor?.createdAtMs,
    afterRunId: cursor?.runId,
    endCreatedAtMs: input.query.endMs,
    limit: pageSize + 1,
    startCreatedAtMs: input.query.startMs,
    status: normalizeOptionalFilter(input.query.status),
    threadId: normalizeOptionalFilter(input.query.threadId),
  });
  const pageRows = rows.slice(0, pageSize);
  return {
    page: createPage(cursorScope, pageRows, rows.length > pageSize),
    runs: pageRows.map((run) => mapAgentRunDetailRow(input.agentId, input.repositories, run)),
  };
}

/**
 * Cancel or interrupt pending/running/waiting Run work with idempotency replay protection.
 */
export function cancelRunInStore(input: {
  readonly agentId: string;
  readonly command: CancelAgentRunCommand;
  readonly repositories: AgentStorageRepositories;
}): CancelAgentRunResult {
  assertAgentContext(input.agentId, input.command.context);
  const replay = checkAgentIdempotency<CancelAgentRunResult>({
    context: input.command.context,
    operationName: cancelRunOperationName,
    repositories: input.repositories,
  });
  if (replay.status === 'replay') return { ...replay.response, replayed: true };
  reserveAgentNonce(input.repositories, input.command.context);
  authorizeRunOperation(
    input.repositories,
    input.command.context,
    'run.cancel',
    'CancelRun',
    'cancel'
  );
  const result = input.repositories.transaction((repositories) =>
    cancelRunTransaction(input.agentId, repositories, input.command)
  );
  recordAgentIdempotency({
    context: input.command.context,
    operationName: cancelRunOperationName,
    repositories: input.repositories,
    response: result,
  });
  return result;
}

function cancelRunTransaction(
  agentId: string,
  repositories: AgentStorageRepositories,
  command: CancelAgentRunCommand
): CancelAgentRunResult {
  const run = requireRun(repositories, command.runId);
  assertRunStatus(run.status);
  if (isTerminalRunStatus(run.status)) {
    return createTerminalCancelResult(agentId, repositories, command, run);
  }
  const requestedStatus = selectCancelStatus(run.status);
  const interruptId = createCancelInterruptId(command.context, run.runId);
  const snapshot = repositories.pendingRuns.findRunInputSnapshot(run.runId);
  repositories.runtime.recordRunInterrupt({
    createdAtMs: command.context.requestedAtMs,
    interruptId,
    interruptType: 'user_cancel',
    reason: command.reason ?? 'Run cancellation requested.',
    requestedStatus,
    runId: run.runId,
    safeAuditRef: `agent-run://${run.runId}/cancel`,
    snapshotRef: snapshot?.snapshotRef,
  });
  repositories.pendingRuns.transitionRunStatus({
    fromStatus: run.status,
    nowMs: command.context.requestedAtMs,
    runId: run.runId,
    toStatus: requestedStatus,
  });
  const audit = recordRunCancelAudit(agentId, repositories, command, requestedStatus, 'cancelled');
  const updated = repositories.pendingRuns.findRunById(run.runId) ?? {
    ...run,
    status: requestedStatus,
  };
  return { audit, replayed: false, run: mapAgentRunDetailRow(agentId, repositories, updated) };
}

function createTerminalCancelResult(
  agentId: string,
  repositories: AgentStorageRepositories,
  command: CancelAgentRunCommand,
  run: AgentRunRow
): CancelAgentRunResult {
  const audit = recordRunCancelAudit(
    agentId,
    repositories,
    command,
    run.status,
    'terminal_precondition'
  );
  return { audit, replayed: false, run: mapAgentRunDetailRow(agentId, repositories, run) };
}

function recordRunCancelAudit(
  agentId: string,
  repositories: AgentStorageRepositories,
  command: CancelAgentRunCommand,
  status: string,
  result: string
): AgentAuditView {
  const auditEventId = createCancelAuditId(command.context, command.runId, result);
  repositories.audit.insertAuditEvent({
    auditId: auditEventId,
    createdAtMs: command.context.requestedAtMs,
    eventType: `agent.run.cancel.${result}`,
    principalRef: command.context.principal.principalId,
    requestDigest: command.context.bodyDigest.digestHex,
  });
  return {
    agentId,
    auditEventId,
    correlationId: command.context.correlationId,
    occurredAtMs: command.context.requestedAtMs,
    operation: cancelRunOperationName,
    principalId: command.context.principal.principalId,
    result: `${result}:${status}`,
    safeDetailRef: `agent-run://${command.runId}/cancel`,
    systemThreadId: repositories.profile.getProfile()?.systemThreadId ?? '',
  };
}

function authorizeRunOperation(
  repositories: AgentStorageRepositories,
  context: AgentCoreRequestContext,
  action: string,
  method: string,
  mode: 'cancel' | 'read'
): void {
  authorizeAgentOperation({
    action,
    context,
    method,
    repositories,
    requiredPrincipalTypes: ['CLIENT_SERVICE', 'ADMIN_OPERATOR', 'INTERNAL_SERVICE'],
    requiredScopes: mode === 'read' ? ['agent.rpc', 'agent.read'] : ['agent.rpc', 'agent.run'],
    service: runServiceName,
  });
}

function requireRun(repositories: AgentStorageRepositories, runId: string): AgentRunRow {
  if (runId.trim() === '') {
    throw createAgentDomainError({ kind: 'validation', message: 'run_id must not be empty.' });
  }
  const run = repositories.pendingRuns.findRunById(runId);
  if (run === undefined) {
    throw createAgentDomainError({ kind: 'not_found', message: 'Agent Run not found.' });
  }
  return run;
}

function assertThreadFilter(
  repositories: AgentStorageRepositories,
  threadId: string | undefined
): void {
  if (
    threadId !== undefined &&
    threadId !== '' &&
    repositories.threads.findByThreadId(threadId) === undefined
  ) {
    throw createAgentDomainError({ kind: 'not_found', message: 'Thread not found.' });
  }
}

function assertCursorScope(actual: string | undefined, expected: string): void {
  if (actual !== undefined && actual !== '' && actual !== expected) {
    throw createAgentDomainError({
      kind: 'authorization',
      message: 'Pagination cursor is outside the requested Agent Run scope.',
    });
  }
}

function assertTimeRange(startMs: number | undefined, endMs: number | undefined): void {
  if (startMs !== undefined && endMs !== undefined && startMs > endMs) {
    throw createAgentDomainError({
      kind: 'validation',
      message: 'Run time range start must be less than or equal to range end.',
    });
  }
}

function selectCancelStatus(status: string): Extract<RunStatus, 'cancelled' | 'interrupted'> {
  return status === 'pending' ? 'cancelled' : 'interrupted';
}

function createRunListCursorScope(agentId: string, query: ListAgentRunsQuery): string {
  const parts = [`${agentId}:runs`];
  if (query.threadId !== undefined && query.threadId !== '') parts.push(`thread=${query.threadId}`);
  if (query.status !== undefined && query.status !== '') parts.push(`status=${query.status}`);
  if (query.startMs !== undefined) parts.push(`start=${String(query.startMs)}`);
  if (query.endMs !== undefined) parts.push(`end=${String(query.endMs)}`);
  return parts.join(':');
}

function createPage(
  cursorScope: string,
  rows: readonly AgentRunRow[],
  hasMore: boolean
): AgentPageView {
  const last = rows.at(-1);
  return {
    cursorScope,
    nextPageToken: hasMore && last !== undefined ? createRunPageToken(last) : undefined,
    resultCount: rows.length,
  };
}

function clampPageSize(pageSize: number | undefined): number {
  return Math.min(Math.max(pageSize ?? 50, 1), 100);
}

function parseRunPageToken(
  token: string | undefined
): { readonly createdAtMs: number; readonly runId?: string } | undefined {
  if (token === undefined || token === '') return undefined;
  const separator = token.indexOf(':');
  if (separator === -1) return { createdAtMs: parseNumericPageToken(token, 'run page token') };
  const createdAtMs = parseNumericPageToken(token.slice(0, separator), 'run page token');
  const runId = decodeURIComponent(token.slice(separator + 1));
  if (runId === '') {
    throw createAgentDomainError({ kind: 'validation', message: 'Invalid run page token.' });
  }
  return { createdAtMs, runId };
}

function parseNumericPageToken(token: string, label: string): number {
  const parsed = Number.parseInt(token, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw createAgentDomainError({ kind: 'validation', message: `Invalid ${label}.` });
  }
  return parsed;
}

function createRunPageToken(run: AgentRunRow): string {
  return `${String(run.createdAtMs)}:${encodeURIComponent(run.runId)}`;
}

function normalizeOptionalFilter(value: string | undefined): string | undefined {
  return value === undefined || value === '' ? undefined : value;
}

function createCancelInterruptId(context: AgentCoreRequestContext, runId: string): string {
  return `cancel:${runId}:${context.idempotencyKey ?? context.bodyDigest.digestHex}`;
}

function createCancelAuditId(
  context: AgentCoreRequestContext,
  runId: string,
  result: string
): string {
  return `run-cancel:${result}:${runId}:${context.idempotencyKey ?? context.bodyDigest.digestHex}`;
}
