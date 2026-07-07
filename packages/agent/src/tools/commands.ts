import {
  assertAgentContext,
  checkAgentIdempotency,
  recordAgentIdempotency,
  reserveAgentNonce,
} from '../domain/agent-operation-utils';
import { createAgentDomainError } from '../domain/errors';

import { assembleToolCatalog } from './catalog';
import { authorizeToolOperation } from './operation-authorization';
import {
  assertInvokableDefinition,
  beginToolMutationCommand,
  recordToolMutationResult,
  requireIdempotency,
  requireInvocation,
} from './operation-guards';
import { createInvocationResult } from './operation-mappers';
import { toolOperationNames } from './operation-names';

import type { AgentAuditView, AgentCoreRequestContext } from '../domain';
import type { AgentStorageRepositories } from '../storage';
import type {
  CreateToolInvocationCommand,
  DecideToolInvocationCommand,
  ToolInvocationMutationResult,
} from './operation-types';

/**
 * Harness decision から ToolInvocation を作成し、approval 要否に応じて待機状態へ遷移します。
 *
 * @param input Agent ID、CreateToolInvocation command、Agent-owned repository set です。
 * @returns 作成済み ToolInvocation、任意 approval/audit、idempotency replay 状態を含む mutation result です。
 * @throws Agent context、authorization、Tool catalog assembly、definition 検証、repository 書き込みが失敗した場合に発生します。
 * @example
 * ```ts
 * const result = await createToolInvocationInStore({ agentId, command, repositories });
 * ```
 */
export async function createToolInvocationInStore(input: {
  readonly agentId: string;
  readonly command: CreateToolInvocationCommand;
  readonly repositories: AgentStorageRepositories;
}): Promise<ToolInvocationMutationResult> {
  assertAgentContext(input.agentId, input.command.context);
  const replay = beginToolMutationCommand(
    input.repositories,
    input.command.context,
    toolOperationNames.createInvocation
  );
  if (replay !== undefined) return replay;
  authorizeToolOperation(
    input.repositories,
    input.command.context,
    'tool.invocation.create',
    'CreateInvocation',
    'invoke'
  );
  const catalog = await assembleToolCatalog({
    agentId: input.agentId,
    nowMs: input.command.context.requestedAtMs,
    persistSnapshot: true,
    repositories: input.repositories,
  });
  const definition = catalog.tools.find((tool) => tool.toolId === input.command.toolId);
  assertInvokableDefinition(definition, input.command.toolId);
  const row = input.repositories.tools.insertInvocation({
    causationEventId: input.command.causationEventId,
    createdAtMs: input.command.context.requestedAtMs,
    idempotencyKey: requireIdempotency(input.command.context),
    inputRef: input.command.inputRef,
    installationId: definition.installationId,
    invocationId: crypto.randomUUID(),
    runId: input.command.runId,
    status: definition.approvalRequired ? 'pending_approval' : 'approved',
    threadId: input.command.threadId,
    toolId: definition.toolId,
    toolSetVersion: catalog.toolSetVersion,
  });
  return recordToolMutationResult(
    input.repositories,
    input.command.context,
    toolOperationNames.createInvocation,
    {
      ...createInvocationResult(input.agentId, input.repositories, row),
      replayed: false,
    }
  );
}

/**
 * ApproveInvocation command を明示 actor/rationale と状態遷移で処理します。
 *
 * @param input Agent ID、ApproveInvocation command、Agent-owned repository set です。
 * @returns 承認後 ToolInvocation、approval record、audit、idempotency replay 状態を含む mutation result です。
 * @throws Agent context、nonce、authorization、状態遷移、repository 操作が失敗した場合に発生します。
 * @example
 * ```ts
 * const result = approveToolInvocationInStore({ agentId, command, repositories });
 * ```
 */
export function approveToolInvocationInStore(input: {
  readonly agentId: string;
  readonly command: DecideToolInvocationCommand;
  readonly repositories: AgentStorageRepositories;
}): ToolInvocationMutationResult {
  return decideToolInvocation(input, 'approved');
}

/**
 * RejectInvocation command を明示 actor/rationale と状態遷移で処理します。
 *
 * @param input Agent ID、RejectInvocation command、Agent-owned repository set です。
 * @returns 却下後 ToolInvocation、approval record、audit、idempotency replay 状態を含む mutation result です。
 * @throws Agent context、nonce、authorization、状態遷移、repository 操作が失敗した場合に発生します。
 * @example
 * ```ts
 * const result = rejectToolInvocationInStore({ agentId, command, repositories });
 * ```
 */
export function rejectToolInvocationInStore(input: {
  readonly agentId: string;
  readonly command: DecideToolInvocationCommand;
  readonly repositories: AgentStorageRepositories;
}): ToolInvocationMutationResult {
  return decideToolInvocation(input, 'rejected');
}

function decideToolInvocation(
  input: {
    readonly agentId: string;
    readonly command: DecideToolInvocationCommand;
    readonly repositories: AgentStorageRepositories;
  },
  decision: 'approved' | 'rejected'
): ToolInvocationMutationResult {
  assertAgentContext(input.agentId, input.command.context);
  const operationName =
    decision === 'approved'
      ? 'AgentToolService.ApproveInvocation'
      : 'AgentToolService.RejectInvocation';
  const replay = checkAgentIdempotency<ToolInvocationMutationResult>({
    context: input.command.context,
    operationName,
    repositories: input.repositories,
  });
  if (replay.status === 'replay') return { ...replay.response, replayed: true };
  reserveAgentNonce(input.repositories, input.command.context);
  authorizeToolOperation(
    input.repositories,
    input.command.context,
    'tool.approval.decide',
    decision === 'approved' ? 'ApproveInvocation' : 'RejectInvocation',
    'approve'
  );
  const invocation = requireInvocation(input.repositories, input.command.invocationId);
  if (invocation.status !== 'pending_approval') {
    throw createAgentDomainError({
      kind: 'precondition',
      message: 'ToolInvocation is not pending approval.',
    });
  }
  const audit = recordToolAudit(
    input.agentId,
    input.repositories,
    input.command.context,
    `agent.tool.${decision}`,
    decision,
    invocation.invocationId
  );
  const approval = input.repositories.tools.insertApproval({
    actorId:
      input.command.context.principal.actingUserId ?? input.command.context.principal.principalId,
    approvalId: crypto.randomUUID(),
    auditEventId: audit.auditEventId,
    decidedAtMs: input.command.context.requestedAtMs,
    decision,
    invocationId: invocation.invocationId,
    principalId: input.command.context.principal.principalId,
    reason: input.command.reason,
  });
  const updated = input.repositories.tools.attachApproval({
    approvalId: approval.approvalId,
    invocationId: invocation.invocationId,
    status: decision === 'approved' ? 'approved' : 'cancelled',
    updatedAtMs: input.command.context.requestedAtMs,
  });
  const result = {
    ...createInvocationResult(input.agentId, input.repositories, updated),
    audit,
    replayed: false,
  };
  recordAgentIdempotency({
    context: input.command.context,
    operationName,
    repositories: input.repositories,
    response: result,
  });
  return result;
}

function recordToolAudit(
  agentId: string,
  repositories: AgentStorageRepositories,
  context: AgentCoreRequestContext,
  operation: string,
  result: string,
  invocationId: string
): AgentAuditView {
  const auditEventId = crypto.randomUUID();
  repositories.audit.insertAuditEvent({
    auditId: auditEventId,
    createdAtMs: context.requestedAtMs,
    eventType: operation,
    principalRef: context.principal.principalId,
    requestDigest: context.bodyDigest.digestHex,
  });
  return {
    agentId,
    auditEventId,
    correlationId: context.correlationId,
    occurredAtMs: context.requestedAtMs,
    operation,
    principalId: context.principal.principalId,
    result,
    safeDetailRef: `agent-tool-invocation://${invocationId}`,
    systemThreadId: repositories.profile.getProfile()?.systemThreadId ?? '',
  };
}
