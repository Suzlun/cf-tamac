import { assertAgentContext } from '../domain/agent-operation-utils';

import { mapToolDefinitionRow } from './catalog';
import { authorizeToolOperation } from './operation-authorization';
import {
  assertProviderOperationBelongsToInvocation,
  assertTransition,
  beginToolMutationCommand,
  createProviderNonce,
  createToolCapability,
  normalizeProviderTerminalStatus,
  recordToolMutationResult,
  requireIdempotency,
  requireInvocation,
  requireProviderDefinition,
  requireProviderOperationForInvocation,
} from './operation-guards';
import { createInvocationResult } from './operation-mappers';
import { toolOperationNames } from './operation-names';
import {
  cancelProviderOperation,
  commitProviderInvokeFailure,
  commitProviderInvokeResult,
  createInvokeProviderInput,
} from './operation-provider';
import { recordToolResultCore } from './results';

import type { AgentStorageRepositories } from '../storage';
import type {
  CancelToolInvocationCommand,
  ExecuteToolInvocationCommand,
  ReconcileToolInvocationCommand,
  ToolInvocationMutationResult,
} from './operation-types';

/**
 * approved ToolInvocation を generated Provider RPC client で実行します。
 *
 * @param input Agent ID、Provider client を含む ExecuteToolInvocation command、Agent-owned repository set です。
 * @returns Provider 実行結果または失敗を反映した ToolInvocation mutation result です。
 * @throws Agent context、authorization、definition/operation lookup、repository 操作が失敗した場合に発生します。
 * @example
 * ```ts
 * const result = await executeToolInvocationWithProvider({ agentId, command, repositories });
 * ```
 */
export async function executeToolInvocationWithProvider(input: {
  readonly agentId: string;
  readonly command: ExecuteToolInvocationCommand;
  readonly repositories: AgentStorageRepositories;
}): Promise<ToolInvocationMutationResult> {
  assertAgentContext(input.agentId, input.command.context);
  const replay = beginToolMutationCommand(
    input.repositories,
    input.command.context,
    toolOperationNames.executeInvocation
  );
  if (replay !== undefined) return replay;
  const invocation = requireInvocation(input.repositories, input.command.invocationId);
  const definition = requireProviderDefinition(input.repositories, invocation.toolId);
  authorizeToolOperation(
    input.repositories,
    input.command.context,
    'tool.provider.invoke',
    'InvokeTool',
    'provider',
    createToolCapability(input.agentId, definition)
  );
  assertTransition(invocation.status, 'running');
  input.repositories.tools.incrementInvocationAttempt({
    invocationId: invocation.invocationId,
    updatedAtMs: input.command.context.requestedAtMs,
  });
  const running = input.repositories.tools.transitionInvocationStatus({
    fromStatus: invocation.status,
    invocationId: invocation.invocationId,
    status: 'running',
    updatedAtMs: input.command.context.requestedAtMs,
  });
  try {
    const provider = await input.command.providerClient.invokeTool(
      createInvokeProviderInput(input, running, definition)
    );
    return recordToolMutationResult(
      input.repositories,
      input.command.context,
      toolOperationNames.executeInvocation,
      commitProviderInvokeResult(input, running, provider, definition, recordToolResultCore)
    );
  } catch (error) {
    return recordToolMutationResult(
      input.repositories,
      input.command.context,
      toolOperationNames.executeInvocation,
      commitProviderInvokeFailure(input, running, definition, error)
    );
  }
}

/**
 * outcome_unknown の ToolInvocation を generated GetOperation で照合します。
 *
 * @param input Agent ID、Provider client を含む ReconcileToolInvocation command、Agent-owned repository set です。
 * @returns 照合結果を反映した ToolInvocation mutation result です。
 * @throws Agent context、authorization、Provider operation identity、Provider RPC、repository 操作が失敗した場合に発生します。
 * @example
 * ```ts
 * const result = await reconcileToolInvocationInStore({ agentId, command, repositories });
 * ```
 */
export async function reconcileToolInvocationInStore(input: {
  readonly agentId: string;
  readonly command: ReconcileToolInvocationCommand;
  readonly repositories: AgentStorageRepositories;
}): Promise<ToolInvocationMutationResult> {
  assertAgentContext(input.agentId, input.command.context);
  const replay = beginToolMutationCommand(
    input.repositories,
    input.command.context,
    toolOperationNames.reconcileInvocation
  );
  if (replay !== undefined) return replay;
  const invocation = requireInvocation(input.repositories, input.command.invocationId);
  const operation = requireProviderOperationForInvocation(
    input.repositories,
    invocation.invocationId
  );
  assertProviderOperationBelongsToInvocation(invocation, operation);
  const definition = requireProviderDefinition(input.repositories, invocation.toolId);
  authorizeToolOperation(
    input.repositories,
    input.command.context,
    'tool.provider.reconcile',
    'GetOperation',
    'provider',
    createToolCapability(input.agentId, definition)
  );
  const provider = await input.command.providerClient.getOperation({
    agentId: input.agentId,
    idempotencyKey: requireIdempotency(input.command.context),
    installationId: operation.installationId,
    invocationId: invocation.invocationId,
    nonce: createProviderNonce(input.command.context, invocation.invocationId, 'reconcile'),
    operationId: operation.providerOperationRef ?? operation.operationId,
    providerTargetRef: definition.providerTargetRef ?? '',
    timestampUnixMs: input.command.context.requestedAtMs,
    toolId: invocation.toolId,
  });
  input.repositories.tools.insertOutgoingRequest({
    attempt: operation.attemptCount + 1,
    errorCode: null,
    idempotencyKey: requireIdempotency(input.command.context),
    invocationId: invocation.invocationId,
    method: provider.record.method,
    nonce: provider.record.nonce,
    operationId: operation.operationId,
    providerTargetRef: provider.record.requestUrl,
    rawBodyDigest: provider.record.rawBodyDigestHex,
    requestId: crypto.randomUUID(),
    responseAtMs: input.command.context.requestedAtMs,
    sentAtMs: input.command.context.requestedAtMs,
    signatureDigest: provider.record.signatureDigestHex,
    status: 'succeeded',
  });
  const status = normalizeProviderTerminalStatus(
    provider.response.operation?.status ?? operation.status
  );
  input.repositories.tools.updateProviderOperationStatus({
    operationId: operation.operationId,
    providerOperationRef: provider.response.operation?.providerOperationRef,
    status,
    updatedAtMs: input.command.context.requestedAtMs,
  });
  if (status === 'succeeded' || status === 'failed') {
    return recordToolMutationResult(
      input.repositories,
      input.command.context,
      toolOperationNames.reconcileInvocation,
      recordToolResultCore({
        agentId: input.agentId,
        command: {
          context: input.command.context,
          invocationId: invocation.invocationId,
          outputRef: provider.response.outputRef,
          providerOperationId: operation.operationId,
          status,
        },
        repositories: input.repositories,
      })
    );
  }
  assertTransition(invocation.status, status);
  const row = input.repositories.tools.transitionInvocationStatus({
    fromStatus: invocation.status,
    invocationId: invocation.invocationId,
    status,
    updatedAtMs: input.command.context.requestedAtMs,
  });
  return recordToolMutationResult(
    input.repositories,
    input.command.context,
    toolOperationNames.reconcileInvocation,
    {
      ...createInvocationResult(input.agentId, input.repositories, row),
      replayed: false,
    }
  );
}

/**
 * ToolInvocation cancellation を Provider operation へ伝播します。
 *
 * @param input Agent ID、CancelToolInvocation command、Agent-owned repository set です。
 * @returns 取消後または outcome_unknown の ToolInvocation mutation result です。
 * @throws Agent context、authorization、状態遷移、Provider cancellation、repository 操作が失敗した場合に発生します。
 * @example
 * ```ts
 * const result = await cancelToolInvocationInStore({ agentId, command, repositories });
 * ```
 */
export async function cancelToolInvocationInStore(input: {
  readonly agentId: string;
  readonly command: CancelToolInvocationCommand;
  readonly repositories: AgentStorageRepositories;
}): Promise<ToolInvocationMutationResult> {
  assertAgentContext(input.agentId, input.command.context);
  const replay = beginToolMutationCommand(
    input.repositories,
    input.command.context,
    toolOperationNames.cancelInvocation
  );
  if (replay !== undefined) return replay;
  const invocation = requireInvocation(input.repositories, input.command.invocationId);
  assertTransition(invocation.status, 'cancelled');
  const operation = input.repositories.tools.findProviderOperationByInvocation(
    invocation.invocationId
  );
  if (operation !== undefined) assertProviderOperationBelongsToInvocation(invocation, operation);
  const definition = input.repositories.tools.findDefinition(invocation.toolId);
  const capability =
    definition === undefined
      ? undefined
      : createToolCapability(input.agentId, mapToolDefinitionRow(input.agentId, definition));
  authorizeToolOperation(
    input.repositories,
    input.command.context,
    'tool.invocation.cancel',
    'CancelOperation',
    'provider',
    capability
  );
  if (
    operation !== undefined &&
    definition?.cancellationSupported === 1 &&
    input.command.providerClient !== undefined
  ) {
    const cancelled = await cancelProviderOperation(
      input,
      invocation,
      operation,
      mapToolDefinitionRow(input.agentId, definition)
    );
    input.repositories.tools.insertOutgoingRequest({
      attempt: operation.attemptCount + 1,
      errorCode: null,
      idempotencyKey: requireIdempotency(input.command.context),
      invocationId: invocation.invocationId,
      method: cancelled.record.method,
      nonce: cancelled.record.nonce,
      operationId: operation.operationId,
      providerTargetRef: cancelled.record.requestUrl,
      rawBodyDigest: cancelled.record.rawBodyDigestHex,
      requestId: crypto.randomUUID(),
      responseAtMs: input.command.context.requestedAtMs,
      sentAtMs: input.command.context.requestedAtMs,
      signatureDigest: cancelled.record.signatureDigestHex,
      status: 'succeeded',
    });
    input.repositories.tools.markProviderOperationCancellation({
      operationId: operation.operationId,
      requestedAtMs: input.command.context.requestedAtMs,
      status:
        cancelled.response.cancellationStatus === 'cancelled' ? 'cancelled' : 'outcome_unknown',
    });
  }
  const row = input.repositories.tools.transitionInvocationStatus({
    fromStatus: invocation.status,
    invocationId: invocation.invocationId,
    status: 'cancelled',
    updatedAtMs: input.command.context.requestedAtMs,
  });
  return recordToolMutationResult(
    input.repositories,
    input.command.context,
    toolOperationNames.cancelInvocation,
    {
      ...createInvocationResult(input.agentId, input.repositories, row),
      replayed: false,
    }
  );
}
