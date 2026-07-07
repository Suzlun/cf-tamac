import {
  assertAgentContext,
  checkAgentIdempotency,
  recordAgentIdempotency,
  reserveAgentNonce,
} from '../domain/agent-operation-utils';

import { authorizeRunOperation, requireRun } from './operations-shared';
import { assertRunStatus, isTerminalRunStatus } from './run-status';
import { mapAgentRunDetailRow } from './views';

import type { AgentAuditView, AgentCoreRequestContext } from '../domain';
import type { AgentRunRow, AgentStorageRepositories } from '../storage';
import type { RunStatus } from './run-status';
import type { CancelAgentRunResult } from './views';

const cancelRunOperationName = 'AgentRunService.CancelRun';

/**
 * Durable Object が受け取る Agent-scoped CancelRun command を表します。
 *
 * この command は Agent-owned Run ledger の状態遷移と runtime interrupt 記録にだけ使われ、
 * 外部 provider や public Durable Object 入口を直接呼びません。
 *
 * @example
 * ```ts
 * const command: CancelAgentRunCommand = { context, runId: 'run_123', reason: 'operator requested' };
 * ```
 */
export interface CancelAgentRunCommand {
  /** Agent ID、Principal、request digest、idempotency key、要求時刻を含む検証済み context です。 */
  readonly context: AgentCoreRequestContext;
  /** interrupt ledger に保存する任意のキャンセル理由です。未指定時は既定文言を保存します。 */
  readonly reason?: string;
  /** キャンセル対象の AgentRun ID です。空文字は store 操作側で validation error になります。 */
  readonly runId: string;
}

/**
 * idempotency replay protection を維持しながら pending/running/waiting Run を cancel または interrupt します。
 *
 * @param input Agent ID、CancelRun command、Agent-owned storage repositories をまとめた入力です。
 * @returns Run detail、audit view、replay 判定を含む CancelRun result を返します。
 * @throws Agent context の Agent ID が一致しない場合、idempotency nonce が不正な場合、認可に失敗した場合、`runId` が空の場合、または Run が存在しない場合に Agent domain error を送出します。
 *
 * @example
 * ```ts
 * const result = cancelRunInStore({ agentId, command, repositories });
 * ```
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

function selectCancelStatus(status: string): Extract<RunStatus, 'cancelled' | 'interrupted'> {
  return status === 'pending' ? 'cancelled' : 'interrupted';
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
