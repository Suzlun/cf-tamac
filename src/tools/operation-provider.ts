import { createAgentDomainError } from '../domain/errors';

import {
  assertTransition,
  createProviderNonce,
  normalizeProviderTerminalStatus,
  requireIdempotency,
} from './operation-guards';
import { createInvocationResult } from './operation-mappers';
import { getIntegrationToolProviderRequestRecord } from './provider-client';

import type {
  AgentProviderOperationRow,
  AgentStorageRepositories,
  AgentToolInvocationRow,
} from '../storage';
import type { AgentToolDefinitionView } from './catalog';
import type {
  CancelToolInvocationCommand,
  ExecuteToolInvocationCommand,
  RecordToolResultCommand,
  ToolInvocationMutationResult,
} from './operation-types';
import type {
  CancelIntegrationToolOperationResult,
  IntegrationToolProviderRequestRecord,
  InvokeIntegrationToolResult,
} from './provider-client';

/**
 * 内部 result 永続化 callback です。
 *
 * @remarks
 * Provider 呼び出し結果が同期的に terminal になった場合でも、公開 `PublishToolResult` の
 * idempotency wrapper を二重に通さず、呼び出し元 command の idempotency の中で Event 化します。
 */
export type RecordToolResultCore = (input: {
  readonly agentId: string;
  readonly command: RecordToolResultCommand;
  readonly repositories: AgentStorageRepositories;
}) => ToolInvocationMutationResult;

/**
 * Provider InvokeTool に送る domain-safe 入力を作成します。
 *
 * @param input Agent ID と Execute command context です。
 * @param invocation 実行対象 ToolInvocation 行です。
 * @param definition Provider-backed ToolDefinition view です。
 * @returns Provider client seam に渡す InvokeTool 入力です。
 * @throws command context に idempotency key がない場合は validation domain error を投げます。
 */
export function createInvokeProviderInput(
  input: { readonly agentId: string; readonly command: ExecuteToolInvocationCommand },
  invocation: AgentToolInvocationRow,
  definition: AgentToolDefinitionView
) {
  return {
    agentId: input.agentId,
    idempotencyKey: requireIdempotency(input.command.context),
    inputRef: invocation.inputRef ?? undefined,
    installationId: invocation.installationId ?? '',
    invocationId: invocation.invocationId,
    nonce: createProviderNonce(input.command.context, invocation.invocationId, 'invoke'),
    providerTargetRef: definition.providerTargetRef ?? '',
    runId: invocation.runId,
    threadId: invocation.threadId,
    timestampUnixMs: input.command.context.requestedAtMs,
    toolId: invocation.toolId,
  };
}

/**
 * Provider InvokeTool 成功応答を outgoing ledger / operation ledger / ToolInvocation に反映します。
 *
 * @param input Execute command と repository set です。
 * @param invocation `running` へ遷移済みの ToolInvocation 行です。
 * @param provider Provider client が返した response と署名済み request record です。
 * @param definition Provider-backed ToolDefinition view です。
 * @param recordToolResult terminal 応答を Event 化する内部 callback です。
 * @returns 更新後の ToolInvocation view です。
 */
export function commitProviderInvokeResult(
  input: {
    readonly agentId: string;
    readonly command: ExecuteToolInvocationCommand;
    readonly repositories: AgentStorageRepositories;
  },
  invocation: AgentToolInvocationRow,
  provider: InvokeIntegrationToolResult,
  definition: AgentToolDefinitionView,
  recordToolResult: RecordToolResultCore
): ToolInvocationMutationResult {
  const operationId =
    provider.response.operation?.operationId ?? `operation:${invocation.invocationId}`;
  input.repositories.tools.insertOutgoingRequest({
    attempt: invocation.attemptCount,
    errorCode: null,
    idempotencyKey: requireIdempotency(input.command.context),
    invocationId: invocation.invocationId,
    method: provider.record.method,
    nonce: provider.record.nonce,
    operationId,
    providerTargetRef: provider.record.requestUrl,
    rawBodyDigest: provider.record.rawBodyDigestHex,
    requestId: crypto.randomUUID(),
    responseAtMs: input.command.context.requestedAtMs,
    sentAtMs: input.command.context.requestedAtMs,
    signatureDigest: provider.record.signatureDigestHex,
    status: 'succeeded',
  });
  input.repositories.tools.upsertProviderOperation({
    attemptCount: invocation.attemptCount,
    cancellationSupported: provider.response.operation?.status === 'running',
    createdAtMs: input.command.context.requestedAtMs,
    idempotencyKey: requireIdempotency(input.command.context),
    installationId: invocation.installationId ?? '',
    invocationId: invocation.invocationId,
    method: 'InvokeTool',
    nonce: provider.record.nonce,
    operationId,
    providerOperationRef: provider.response.operation?.providerOperationRef,
    providerTargetRef: definition.providerTargetRef,
    requestDigest: provider.record.rawBodyDigestHex,
    status:
      provider.response.invocationStatus === 'succeeded'
        ? 'succeeded'
        : (provider.response.operation?.status ?? 'running'),
    toolId: invocation.toolId,
    updatedAtMs: input.command.context.requestedAtMs,
  });
  const rawProviderStatus =
    provider.response.invocationStatus === ''
      ? (provider.response.operation?.status ?? 'running')
      : provider.response.invocationStatus;
  const status = normalizeProviderTerminalStatus(rawProviderStatus);
  if (status === 'succeeded' || status === 'failed') {
    return recordToolResult({
      agentId: input.agentId,
      command: {
        context: input.command.context,
        invocationId: invocation.invocationId,
        outputRef: provider.response.outputRef,
        providerOperationId: operationId,
        status,
      },
      repositories: input.repositories,
    });
  }
  const row = input.repositories.tools.attachProviderOperation({
    invocationId: invocation.invocationId,
    operationId,
    status: 'running',
    updatedAtMs: input.command.context.requestedAtMs,
  });
  return { ...createInvocationResult(input.agentId, input.repositories, row), replayed: false };
}

/**
 * Provider InvokeTool 失敗時に照合可能な fallback operation を永続化します。
 *
 * @param input Execute command と repository set です。
 * @param invocation `running` へ遷移済みの ToolInvocation 行です。
 * @param definition Provider-backed ToolDefinition view です。
 * @param error Provider client が投げた error です。
 * @returns `outcome_unknown` へ遷移した ToolInvocation view です。
 */
export function commitProviderInvokeFailure(
  input: {
    readonly agentId: string;
    readonly command: ExecuteToolInvocationCommand;
    readonly repositories: AgentStorageRepositories;
  },
  invocation: AgentToolInvocationRow,
  definition: AgentToolDefinitionView,
  error: unknown
): ToolInvocationMutationResult {
  const operationId = `operation:${invocation.invocationId}`;
  const record =
    getIntegrationToolProviderRequestRecord(error) ??
    createFallbackProviderRequestRecord(input, invocation, definition);
  input.repositories.tools.insertOutgoingRequest({
    attempt: invocation.attemptCount,
    errorCode: error instanceof Error ? error.name : 'provider_error',
    idempotencyKey: requireIdempotency(input.command.context),
    invocationId: invocation.invocationId,
    method: record.method,
    nonce: record.nonce,
    operationId,
    providerTargetRef: record.requestUrl,
    rawBodyDigest: record.rawBodyDigestHex,
    requestId: crypto.randomUUID(),
    responseAtMs: input.command.context.requestedAtMs,
    sentAtMs: input.command.context.requestedAtMs,
    signatureDigest: record.signatureDigestHex,
    status: 'failed',
  });
  input.repositories.tools.upsertProviderOperation({
    attemptCount: invocation.attemptCount,
    cancellationSupported: false,
    createdAtMs: input.command.context.requestedAtMs,
    idempotencyKey: requireIdempotency(input.command.context),
    installationId: invocation.installationId ?? '',
    invocationId: invocation.invocationId,
    method: 'InvokeTool',
    nonce: record.nonce,
    operationId,
    providerTargetRef: definition.providerTargetRef,
    requestDigest: record.rawBodyDigestHex,
    status: 'outcome_unknown',
    toolId: invocation.toolId,
    updatedAtMs: input.command.context.requestedAtMs,
  });
  assertTransition(invocation.status, 'outcome_unknown');
  const row = input.repositories.tools.transitionInvocationStatus({
    failureReason: error instanceof Error ? error.message : 'provider_error',
    fromStatus: invocation.status,
    invocationId: invocation.invocationId,
    providerOperationId: operationId,
    status: 'outcome_unknown',
    updatedAtMs: input.command.context.requestedAtMs,
  });
  return { ...createInvocationResult(input.agentId, input.repositories, row), replayed: false };
}

/**
 * Provider CancelOperation を呼び出します。
 *
 * @param input Cancel command と Agent ID です。
 * @param invocation 取消対象 ToolInvocation 行です。
 * @param operation Provider operation ledger 行です。
 * @param definition Provider-backed ToolDefinition view です。
 * @returns Provider cancellation response と request record です。
 * @throws Provider client が未注入の場合は precondition domain error を投げます。
 */
export async function cancelProviderOperation(
  input: { readonly agentId: string; readonly command: CancelToolInvocationCommand },
  invocation: AgentToolInvocationRow,
  operation: AgentProviderOperationRow,
  definition: AgentToolDefinitionView
): Promise<CancelIntegrationToolOperationResult> {
  if (input.command.providerClient === undefined) {
    throw createAgentDomainError({ kind: 'precondition', message: 'Provider client is required.' });
  }
  return input.command.providerClient.cancelOperation({
    agentId: input.agentId,
    idempotencyKey: requireIdempotency(input.command.context),
    installationId: operation.installationId,
    invocationId: invocation.invocationId,
    nonce: createProviderNonce(input.command.context, invocation.invocationId, 'cancel'),
    operationId: operation.providerOperationRef ?? operation.operationId,
    providerTargetRef: definition.providerTargetRef ?? '',
    reason: input.command.reason,
    timestampUnixMs: input.command.context.requestedAtMs,
    toolId: invocation.toolId,
  });
}

function createFallbackProviderRequestRecord(
  input: { readonly command: ExecuteToolInvocationCommand },
  invocation: AgentToolInvocationRow,
  definition: AgentToolDefinitionView
): IntegrationToolProviderRequestRecord {
  // 署名前に失敗した場合でも、同じ nonce / target / attempt を監査 ledger と照合 ledger に残します。
  return {
    bodyByteLength: input.command.context.bodyDigest.byteLength,
    method: 'InvokeTool',
    nonce: createProviderNonce(input.command.context, invocation.invocationId, 'invoke'),
    rawBodyDigestHex: input.command.context.bodyDigest.digestHex,
    requestUrl: definition.providerTargetRef ?? '',
    signatureDigestHex: '',
  };
}
