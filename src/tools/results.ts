import { assertAgentContext } from '../domain/agent-operation-utils';
import { createAgentDomainError } from '../domain/errors';
import { appendAgentEventToThreadInRepositories } from '../events/mailbox';

import { authorizeToolOperation } from './operation-authorization';
import {
  assertProviderResultIdentity,
  assertToolResultCanResumeRun,
  assertTransition,
  beginToolMutationCommand,
  recordToolMutationResult,
  requireIdempotency,
  requireInvocation,
} from './operation-guards';
import { createInvocationResult } from './operation-mappers';
import { toolOperationNames } from './operation-names';
import { toolInvocationFailedEventType, toolInvocationSucceededEventType } from './tool-status';

import type { AgentEventView } from '../domain';
import type { AgentStorageRepositories, AgentToolInvocationRow } from '../storage';
import type { RecordToolResultCommand, ToolInvocationMutationResult } from './operation-types';

/**
 * Tool 成功/失敗 result を同じ Thread へ Event として戻します。
 *
 * @param input Agent ID、RecordToolResult command、Agent-owned repository set です。
 * @returns 更新済み ToolInvocation と、必要に応じて append された result Event を含む mutation result です。
 * @throws Agent context、idempotency、authorization、状態遷移、Run 再開検証、repository 操作が失敗した場合に発生します。
 * @example
 * ```ts
 * const result = recordToolResultInStore({ agentId, command, repositories });
 * ```
 */
export function recordToolResultInStore(input: {
  readonly agentId: string;
  readonly command: RecordToolResultCommand;
  readonly repositories: AgentStorageRepositories;
}): ToolInvocationMutationResult {
  assertAgentContext(input.agentId, input.command.context);
  const replay = beginToolMutationCommand(
    input.repositories,
    input.command.context,
    toolOperationNames.publishToolResult
  );
  if (replay !== undefined) return replay;
  return recordToolMutationResult(
    input.repositories,
    input.command.context,
    toolOperationNames.publishToolResult,
    recordToolResultCore(input)
  );
}

/**
 * Provider 実行 path と Provider callback path で共有する Tool result 永続化 core です。
 *
 * @param input Agent ID、result command、repository set をまとめた内部入力です。
 * @returns 更新後の ToolInvocation と、必要に応じて append された result Event です。
 * @throws result 権限、状態遷移、Provider operation identity、Run 再開世代が不正な場合は domain error を投げます。
 * @example
 * ```ts
 * const result = recordToolResultCore({ agentId, command, repositories });
 * ```
 */
export function recordToolResultCore(input: {
  readonly agentId: string;
  readonly command: RecordToolResultCommand;
  readonly repositories: AgentStorageRepositories;
}): ToolInvocationMutationResult {
  return input.repositories.transaction((repositories) => {
    const invocation = requireInvocation(repositories, input.command.invocationId);
    authorizeToolOperation(
      repositories,
      input.command.context,
      'tool.result.publish',
      'PublishToolResult',
      'result',
      {
        capabilityKind: 'tool',
        installationId: invocation.installationId ?? undefined,
        ownerAgentId: input.agentId,
        toolId: invocation.toolId,
      }
    );
    assertTransition(invocation.status, input.command.status);
    assertProviderResultIdentity(repositories, invocation, input.command.providerOperationId);
    const existingResult = repositories.tools.findResultEventByInvocation(invocation.invocationId);
    if (existingResult !== undefined)
      return { ...createInvocationResult(input.agentId, repositories, invocation), replayed: true };
    assertToolResultCanResumeRun(repositories, invocation);
    const persisted = appendToolResultEvent({ ...input, repositories }, invocation);
    const updated = repositories.tools.markInvocationResult({
      invocationId: invocation.invocationId,
      outputRef: input.command.outputRef,
      resultEventId: persisted.event.eventId,
      fromStatus: invocation.status,
      status: input.command.status,
      updatedAtMs: input.command.context.requestedAtMs,
    });
    repositories.tools.insertResultEvent({
      createdAtMs: input.command.context.requestedAtMs,
      eventId: persisted.event.eventId,
      idempotencyKey: requireIdempotency(input.command.context),
      invocationId: invocation.invocationId,
      providerOperationId: input.command.providerOperationId ?? null,
      resultStatus: input.command.status,
      suppressedDuplicate: 0,
    });
    return {
      ...createInvocationResult(input.agentId, repositories, updated),
      replayed: false,
      resultEvent: persisted.event,
    };
  });
}

function appendToolResultEvent(
  input: {
    readonly agentId: string;
    readonly command: RecordToolResultCommand;
    readonly repositories: AgentStorageRepositories;
  },
  invocation: AgentToolInvocationRow
) {
  const thread = input.repositories.threads.findByThreadId(invocation.threadId);
  if (thread === undefined)
    throw createAgentDomainError({
      kind: 'not_found',
      message: 'ToolInvocation Thread not found.',
    });
  return input.repositories.transaction((repositories) => {
    repositories.pendingRuns.transitionRunStatus({
      fromStatus: 'waiting',
      nowMs: input.command.context.requestedAtMs,
      runId: invocation.runId,
      toStatus: 'pending',
    });
    const persisted = appendAgentEventToThreadInRepositories({
      causationId: invocation.runId,
      correlationId: input.command.context.correlationId,
      createdAtMs: input.command.context.requestedAtMs,
      eventId: crypto.randomUUID(),
      eventType:
        input.command.status === 'succeeded'
          ? toolInvocationSucceededEventType
          : toolInvocationFailedEventType,
      idempotencyKey: requireIdempotency(input.command.context),
      occurredAtMs: input.command.context.requestedAtMs,
      payloadRef: input.command.outputRef,
      repositories,
      requestDigest: input.command.context.bodyDigest.digestHex,
      source: 'agent.tool',
      target: {
        mode: 'thread_id',
        normalizedThreadKey: thread.normalizedThreadKey,
        threadId: thread.threadId,
        threadKey: thread.threadKey,
      },
    });
    return { event: mapEventRow(input.agentId, persisted.event), runId: persisted.run.runId };
  });
}

function mapEventRow(
  agentId: string,
  row: {
    readonly agentSequence: number;
    readonly causationId: string | null;
    readonly correlationId: string | null;
    readonly eventId: string;
    readonly eventType: string;
    readonly idempotencyKey: string;
    readonly normalizedThreadKey: string;
    readonly occurredAtMs: number;
    readonly payloadRef: string | null;
    readonly runId: string | null;
    readonly sectionId: string;
    readonly source: string;
    readonly threadId: string;
    readonly threadKey: string;
    readonly threadSequence: number;
  }
): AgentEventView {
  return {
    agentId,
    agentSequence: row.agentSequence,
    causationId: row.causationId ?? undefined,
    correlationId: row.correlationId ?? undefined,
    eventId: row.eventId,
    eventType: row.eventType,
    idempotencyKey: row.idempotencyKey,
    normalizedThreadKey: row.normalizedThreadKey,
    occurredAtMs: row.occurredAtMs,
    payloadRef: row.payloadRef ?? undefined,
    runId: row.runId ?? undefined,
    sectionId: row.sectionId,
    source: row.source,
    threadId: row.threadId,
    threadKey: row.threadKey,
    threadSequence: row.threadSequence,
  };
}
