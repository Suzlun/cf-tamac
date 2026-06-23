import {
  checkAgentIdempotency,
  recordAgentIdempotency,
  reserveAgentNonce,
} from '../domain/agent-operation-utils';
import { createAgentDomainError } from '../domain/errors';

import { mapToolDefinitionRow } from './catalog';
import { assertToolInvocationStatus, assertToolInvocationStatusTransition } from './foundation';

import type { AgentCoreRequestContext } from '../domain';
import type {
  AgentProviderOperationRow,
  AgentStorageRepositories,
  AgentToolInvocationRow,
} from '../storage';
import type { AgentToolDefinitionView } from './catalog';
import type { ToolInvocationStatus } from './foundation';
import type { ToolInvocationMutationResult } from './operation-types';

/**
 * Provider-backed ToolDefinition を必須条件として取得します。
 *
 * @param repositories Agent-owned storage repository set です。
 * @param toolId 取得対象の Tool ID です。
 * @returns Provider target と installation を持つ ToolDefinition view です。
 * @throws ToolDefinition が存在しない、または Provider-backed でない場合に domain error を投げます。
 * @example
 * ```ts
 * const definition = requireProviderDefinition(repositories, toolId);
 * ```
 */
export function requireProviderDefinition(
  repositories: AgentStorageRepositories,
  toolId: string
): AgentToolDefinitionView {
  const row = repositories.tools.findDefinition(toolId);
  if (row === undefined)
    throw createAgentDomainError({ kind: 'not_found', message: 'ToolDefinition not found.' });
  const definition = mapToolDefinitionRow(row.agentId, row);
  if (definition.providerTargetRef === undefined || definition.installationId === undefined) {
    throw createAgentDomainError({
      kind: 'precondition',
      message: 'ToolDefinition is not Provider-backed.',
    });
  }
  return definition;
}

/**
 * ToolInvocation を必須条件として取得します。
 *
 * @param repositories Agent-owned storage repository set です。
 * @param invocationId 取得対象の ToolInvocation ID です。
 * @returns 対象 ToolInvocation の永続行です。
 * @throws ToolInvocation が存在しない場合に not_found domain error を投げます。
 * @example
 * ```ts
 * const invocation = requireInvocation(repositories, invocationId);
 * ```
 */
export function requireInvocation(
  repositories: AgentStorageRepositories,
  invocationId: string
): AgentToolInvocationRow {
  const row = repositories.tools.findInvocation(invocationId);
  if (row === undefined)
    throw createAgentDomainError({ kind: 'not_found', message: 'ToolInvocation not found.' });
  return row;
}

/**
 * ToolInvocation に紐づく Provider operation を必須条件として取得します。
 *
 * @param repositories Agent-owned storage repository set です。
 * @param invocationId Provider operation を検索する ToolInvocation ID です。
 * @returns 対象 Provider operation の永続行です。
 * @throws Provider operation が存在しない場合に not_found domain error を投げます。
 * @example
 * ```ts
 * const operation = requireProviderOperationForInvocation(repositories, invocationId);
 * ```
 */
export function requireProviderOperationForInvocation(
  repositories: AgentStorageRepositories,
  invocationId: string
): AgentProviderOperationRow {
  const row = repositories.tools.findProviderOperationByInvocation(invocationId);
  if (row === undefined)
    throw createAgentDomainError({ kind: 'not_found', message: 'Provider operation not found.' });
  return row;
}

/**
 * ToolDefinition が invocation 可能な active 状態であることを検証します。
 *
 * @param definition catalog assembly から得た ToolDefinition view です。
 * @param toolId エラー説明に含める要求 Tool ID です。
 * @throws definition 不在、または status が active でない場合に domain error を投げます。
 * @example
 * ```ts
 * assertInvokableDefinition(definition, toolId);
 * ```
 */
export function assertInvokableDefinition(
  definition: AgentToolDefinitionView | undefined,
  toolId: string
): asserts definition is AgentToolDefinitionView {
  if (definition === undefined)
    throw createAgentDomainError({
      kind: 'not_found',
      message: `ToolDefinition not found: ${toolId}`,
    });
  if (definition.status !== 'active')
    throw createAgentDomainError({
      kind: 'precondition',
      message: 'ToolDefinition is not active.',
    });
}

/**
 * ToolInvocation status の状態遷移が許可されていることを検証します。
 *
 * @param from 現在の ToolInvocation status です。
 * @param to 遷移先の ToolInvocation status です。
 * @throws 不明な status、または不正遷移の場合に domain error を投げます。
 * @example
 * ```ts
 * assertTransition(invocation.status, 'running');
 * ```
 */
export function assertTransition(from: string, to: ToolInvocationStatus): void {
  try {
    // lifecycle の破損は利用者入力・並行状態に起因するため、RPC で安全に返せる domain precondition に正規化します。
    assertToolInvocationStatus(from);
    assertToolInvocationStatusTransition(from, to);
  } catch (error) {
    throw createAgentDomainError({
      kind: 'precondition',
      message: error instanceof Error ? error.message : 'Invalid ToolInvocation transition.',
    });
  }
}

/**
 * Provider operation status を ToolInvocation terminal status へ正規化します。
 *
 * @param status Provider が返した status 文字列です。
 * @returns terminal status、outcome_unknown、または running へ正規化した status です。
 * @throws この関数は安全な fallback を返すため例外を投げません。
 * @example
 * ```ts
 * const status = normalizeProviderTerminalStatus(providerStatus);
 * ```
 */
export function normalizeProviderTerminalStatus(status: string): ToolInvocationStatus {
  if (status === 'succeeded' || status === 'failed' || status === 'cancelled') return status;
  return status === 'outcome_unknown' ? 'outcome_unknown' : 'running';
}

/**
 * Tool capability ownership context を作成します。
 *
 * @param agentId Durable Object が所有する Agent ID です。
 * @param definition capability 対象の ToolDefinition view です。
 * @returns final authorization へ渡す Tool capability ownership context です。
 * @throws この関数は純粋な値変換のみを行うため例外を投げません。
 * @example
 * ```ts
 * const capability = createToolCapability(agentId, definition);
 * ```
 */
export function createToolCapability(agentId: string, definition: AgentToolDefinitionView) {
  return {
    capabilityKind: 'tool' as const,
    installationId: definition.installationId,
    ownerAgentId: agentId,
    toolId: definition.toolId,
  };
}

/**
 * command context から必須 idempotency key を取得します。
 *
 * @param context Agent RPC command context です。
 * @returns 空でない idempotency key です。
 * @throws idempotency key が未指定または空の場合に validation domain error を投げます。
 * @example
 * ```ts
 * const key = requireIdempotency(context);
 * ```
 */
export function requireIdempotency(context: AgentCoreRequestContext): string {
  if (context.idempotencyKey === undefined || context.idempotencyKey === '') {
    throw createAgentDomainError({ kind: 'validation', message: 'idempotency_key is required.' });
  }
  return context.idempotencyKey;
}

/**
 * Provider request に使う nonce を command context から作成します。
 *
 * @param context Agent RPC command context です。
 * @param invocationId ToolInvocation ID です。
 * @param purpose nonce fallback に含める用途名です。
 * @returns request context の nonce、または deterministic fallback nonce です。
 * @throws この関数は純粋な値変換のみを行うため例外を投げません。
 * @example
 * ```ts
 * const nonce = createProviderNonce(context, invocationId, 'invoke');
 * ```
 */
export function createProviderNonce(
  context: AgentCoreRequestContext,
  invocationId: string,
  purpose: string
): string {
  return context.nonce ?? `${purpose}:${invocationId}:${String(context.requestedAtMs)}`;
}

/**
 * Tool mutation command の digest-aware idempotency を開始します。
 *
 * @param repositories Agent-owned repository set です。
 * @param context Agent RPC command context です。
 * @param operationName idempotency record に保存する stable operation 名です。
 * @returns replay 可能な保存済み response、または新規 command の場合は `undefined` です。
 */
export function beginToolMutationCommand(
  repositories: AgentStorageRepositories,
  context: AgentCoreRequestContext,
  operationName: string
): ToolInvocationMutationResult | undefined {
  // 先に body digest 付き idempotency record を確認し、同一 key + 異なる body を conflict にします。
  const replay = checkAgentIdempotency<ToolInvocationMutationResult>({
    context,
    operationName,
    repositories,
  });
  if (replay.status === 'replay') return { ...replay.response, replayed: true };
  // 新規 command だけ nonce を予約し、replay が nonce replay と誤判定されることを避けます。
  reserveAgentNonce(repositories, context);
  return undefined;
}

/**
 * Tool mutation command の idempotency response を保存します。
 *
 * @param repositories Agent-owned repository set です。
 * @param context Agent RPC command context です。
 * @param operationName idempotency record に保存する stable operation 名です。
 * @param result 永続化済み mutation result です。
 * @returns 入力 result をそのまま返します。
 */
export function recordToolMutationResult(
  repositories: AgentStorageRepositories,
  context: AgentCoreRequestContext,
  operationName: string,
  result: ToolInvocationMutationResult
): ToolInvocationMutationResult {
  // mutation 完了後の安全な view を保存し、Provider 再送や Event 重複 append を replay で止めます。
  recordAgentIdempotency({ context, operationName, repositories, response: result });
  return result;
}

/**
 * Provider operation が対象 ToolInvocation に属することを検証します。
 *
 * @param invocation ToolInvocation の永続行です。
 * @param operation Provider operation ledger 行です。
 * @throws invocation / tool / installation identity が一致しない場合に precondition domain error を投げます。
 */
export function assertProviderOperationBelongsToInvocation(
  invocation: AgentToolInvocationRow,
  operation: AgentProviderOperationRow
): void {
  // invocation 側と operation 側の双方向 identity を照合し、別 Tool / 別 installation の操作混入を拒否します。
  if (operation.invocationId !== null && operation.invocationId !== invocation.invocationId) {
    throw createAgentDomainError({
      kind: 'precondition',
      message: 'Provider operation does not belong to this ToolInvocation.',
    });
  }
  if (
    invocation.providerOperationId !== null &&
    invocation.providerOperationId !== operation.operationId
  ) {
    throw createAgentDomainError({
      kind: 'precondition',
      message: 'ToolInvocation is attached to a different Provider operation.',
    });
  }
  if (operation.toolId !== null && operation.toolId !== invocation.toolId) {
    throw createAgentDomainError({
      kind: 'precondition',
      message: 'Provider operation tool identity does not match ToolInvocation.',
    });
  }
  if (operation.installationId !== invocation.installationId) {
    throw createAgentDomainError({
      kind: 'precondition',
      message: 'Provider operation installation identity does not match ToolInvocation.',
    });
  }
}

/**
 * Provider result callback の operation identity を検証します。
 *
 * @param repositories Agent-owned repository set です。
 * @param invocation result 対象 ToolInvocation 行です。
 * @param providerOperationId Provider から渡された operation identity です。
 * @throws 登録済み Provider operation と一致しない場合に precondition domain error を投げます。
 */
export function assertProviderResultIdentity(
  repositories: AgentStorageRepositories,
  invocation: AgentToolInvocationRow,
  providerOperationId: string | undefined
): void {
  const operation = repositories.tools.findProviderOperationByInvocation(invocation.invocationId);
  if (operation === undefined) {
    if (providerOperationId !== undefined) {
      throw createAgentDomainError({
        kind: 'precondition',
        message: 'Provider operation is not registered for this ToolInvocation.',
      });
    }
    return;
  }
  assertProviderOperationBelongsToInvocation(invocation, operation);
  if (providerOperationId === undefined) {
    throw createAgentDomainError({
      kind: 'precondition',
      message: 'Provider operation identity is required for Provider Tool result.',
    });
  }
  const acceptedOperationIds = [operation.operationId, operation.providerOperationRef].filter(
    (value): value is string => value !== null && value !== ''
  );
  if (!acceptedOperationIds.includes(providerOperationId)) {
    throw createAgentDomainError({
      kind: 'precondition',
      message: 'Provider Tool result operation identity does not match.',
    });
  }
}
