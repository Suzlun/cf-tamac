/**
 * ToolInvocation の永続 lifecycle status 一覧です。
 *
 * @remarks
 * Run が Tool を提案してから Provider 実行、結果不明、取消、成功/失敗へ収束するまでの
 * 状態を Agent-owned storage で追跡します。
 */
export const toolInvocationStatuses = [
  'proposed',
  'pending_approval',
  'approved',
  'running',
  'succeeded',
  'failed',
  'outcome_unknown',
  'cancelled',
] as const;

/**
 * ToolInvocation status の union 型です。
 */
export type ToolInvocationStatus = (typeof toolInvocationStatuses)[number];

/**
 * ToolDefinition の可用性 status 一覧です。
 */
export const toolDefinitionStatuses = ['active', 'disabled', 'revoked', 'uninstalled'] as const;

/**
 * ToolDefinition status の union 型です。
 */
export type ToolDefinitionStatus = (typeof toolDefinitionStatuses)[number];

/**
 * Provider operation の追跡 status 一覧です。
 */
export const providerOperationStatuses = [
  'pending',
  'running',
  'succeeded',
  'failed',
  'outcome_unknown',
  'cancel_requested',
  'cancelled',
] as const;

/**
 * Provider operation status の union 型です。
 */
export type ProviderOperationStatus = (typeof providerOperationStatuses)[number];

/**
 * Tool 成功時に同一 Thread へ追加する Event type です。
 */
export const toolInvocationSucceededEventType = 'tool.invocation.succeeded';

/**
 * Tool 失敗時に同一 Thread へ追加する Event type です。
 */
export const toolInvocationFailedEventType = 'tool.invocation.failed';

/**
 * ToolInvocation の terminal status 一覧です。
 */
export const terminalToolInvocationStatuses = [
  'succeeded',
  'failed',
  'cancelled',
] as const satisfies readonly ToolInvocationStatus[];

/**
 * ToolInvocation の状態遷移が許可されるかを返します。
 *
 * @param from 現在の ToolInvocation status です。
 * @param to 遷移先の ToolInvocation status です。
 * @returns 許可される遷移なら `true`、不正な遷移なら `false` です。
 * @example
 * ```ts
 * canTransitionToolInvocationStatus('pending_approval', 'approved');
 * ```
 */
export function canTransitionToolInvocationStatus(
  from: ToolInvocationStatus,
  to: ToolInvocationStatus
): boolean {
  if (from === to) return true;
  if (
    terminalToolInvocationStatuses.includes(from as (typeof terminalToolInvocationStatuses)[number])
  ) {
    return false;
  }
  if (from === 'proposed')
    return to === 'pending_approval' || to === 'approved' || to === 'cancelled';
  if (from === 'pending_approval')
    return to === 'approved' || to === 'cancelled' || to === 'failed';
  if (from === 'approved') return to === 'running' || to === 'failed' || to === 'cancelled';
  if (from === 'running')
    return to === 'succeeded' || to === 'failed' || to === 'outcome_unknown' || to === 'cancelled';
  if (from === 'outcome_unknown')
    return to === 'succeeded' || to === 'failed' || to === 'cancelled';
  return false;
}

/**
 * 保存済み文字列が ToolInvocation status として有効であることを検証します。
 *
 * @param value 検証対象の status 文字列です。
 * @throws TypeError 未知の status の場合に発生します。
 */
export function assertToolInvocationStatus(value: string): asserts value is ToolInvocationStatus {
  if (!toolInvocationStatuses.includes(value as ToolInvocationStatus)) {
    throw new TypeError(`Unsupported ToolInvocation status: ${value}`);
  }
}

/**
 * ToolInvocation の status transition を検証します。
 *
 * @param from 現在 status です。
 * @param to 遷移先 status です。
 * @throws TypeError 許可されていない遷移の場合に発生します。
 */
export function assertToolInvocationStatusTransition(
  from: ToolInvocationStatus,
  to: ToolInvocationStatus
): void {
  if (!canTransitionToolInvocationStatus(from, to)) {
    throw new TypeError(`Invalid ToolInvocation transition: ${from} -> ${to}`);
  }
}
