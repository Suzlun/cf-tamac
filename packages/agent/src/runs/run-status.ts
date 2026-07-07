/**
 * AgentRun scheduler が永続状態として扱う status 一覧です。
 *
 * @remarks
 * pending から running / waiting を経て、completed・failed・cancelled・interrupted の終端状態へ進みます。
 * Agent-local Queue は wake 境界だけであり、この status が Run source of truth として SQLite に残ります。
 */
export const runStatuses = [
  'pending',
  'running',
  'waiting',
  'completed',
  'failed',
  'cancelled',
  'interrupted',
] as const;

/**
 * AgentRun status の union 型です。
 *
 * @remarks
 * `runStatuses` から導出し、repository row、scheduler、RPC view が同じ状態集合だけを扱うようにします。
 */
export type RunStatus = (typeof runStatuses)[number];

/**
 * Agent aggregate の単一 active Run slot を占有する status 一覧です。
 *
 * @remarks
 * 現時点では `running` だけが active slot を占有します。waiting は Provider/Tool 結果待ちで slot を解放し、
 * 後続 Run の scheduling を妨げない状態として扱います。
 */
export const activeRunStatuses = ['running'] as const satisfies readonly RunStatus[];

/**
 * pending Run を開始する時点で固定する input snapshot 参照です。
 *
 * @remarks
 * Trigger Event 範囲、config/model/tool/integration 世代、Thread memory 版を一つの snapshot として固定します。
 * Run 実行中に storage が更新されても、同じ入力条件で replay / audit できるようにするための境界型です。
 */
export interface RunInputSnapshot {
  readonly runId: string;
  readonly agentId: string;
  readonly threadId: string;
  readonly triggerEventId: string;
  readonly triggerEventEndSequence: number;
  readonly triggerEventStartSequence: number;
  readonly configVersion: number;
  readonly integrationVersion: number;
  readonly toolSetVersion: number;
  readonly uncompactedUpperSequence: number;
  readonly latestReadyCompactionRef?: string;
  readonly snapshotRef?: string;
  readonly threadMemoryRef?: string;
  readonly threadMemoryVersion: number;
}

/**
 * まだ future work を表す AgentRun status 一覧です。
 *
 * @remarks
 * scheduler wake や list query が未完了 Run を判定するための集合です。終端状態は含めません。
 */
export const unfinishedRunStatuses = ['pending', 'running', 'waiting'] as const;

/**
 * stale result commit を拒否する AgentRun terminal status 一覧です。
 *
 * @remarks
 * terminal status になった Run は Provider/Tool/Model から遅延 result が届いても状態を戻しません。
 */
export const terminalRunStatuses = ['completed', 'failed', 'cancelled', 'interrupted'] as const;

/**
 * AgentRun state machine の遷移検証入力です。
 *
 * @remarks
 * `from` は永続化済みの現在 status、`to` は command や scheduler が要求する遷移先 status です。
 * 状態名は `RunStatus` に固定し、未知 status の文字列を混ぜないようにします。
 */
export interface AgentRunStateTransition {
  readonly from: RunStatus;
  readonly to: RunStatus;
}

/**
 * scheduler fairness comparator が参照する最小 Run 候補情報です。
 *
 * @remarks
 * 優先度、前回 service 時刻、pending 開始時刻、Run ID だけで順序を決めます。payload や secret を
 * comparator へ渡さず、scheduling 判定を純粋な storage metadata に閉じます。
 */
export interface AgentRunSchedulingCandidate {
  readonly lastServedAtMs: number | null;
  readonly pendingSinceMs: number;
  readonly priority: number;
  readonly runId: string;
}

/**
 * Run status が終端状態かどうかを判定します。
 *
 * @param status 判定対象の AgentRun status です。
 * @returns completed、failed、cancelled、interrupted のいずれかであれば `true` です。
 * @throws この関数は集合 membership の純粋判定だけを行うため例外を投げません。
 * @example
 * ```ts
 * if (isTerminalRunStatus(row.status)) return row.updatedAtMs;
 * ```
 */
export function isTerminalRunStatus(status: RunStatus): boolean {
  return terminalRunStatuses.includes(status as (typeof terminalRunStatuses)[number]);
}

/**
 * Run status が Agent の active Run slot を占有しているかを判定します。
 *
 * @param status 判定対象の AgentRun status です。
 * @returns scheduler が新しい Run を開始してはいけない active status なら `true` です。
 * @throws この関数は status 集合を参照するだけのため例外を投げません。
 * @example
 * ```ts
 * if (isActiveRunStatus(activeRun.status)) return { status: 'active_blocked' };
 * ```
 */
export function isActiveRunStatus(status: RunStatus): boolean {
  return activeRunStatuses.includes(status as (typeof activeRunStatuses)[number]);
}

/**
 * Run status が Agent の active Run slot を解放済みかどうかを返します。
 *
 * @param status 判定対象の AgentRun status です。
 * @returns waiting または terminal status であれば `true` です。
 * @throws この関数は純粋判定だけを行うため例外を投げません。
 * @example
 * ```ts
 * const released = hasReleasedActiveRunSlot(nextStatus);
 * ```
 */
export function hasReleasedActiveRunSlot(status: RunStatus): boolean {
  return status === 'waiting' || isTerminalRunStatus(status);
}

/**
 * pending Run を scheduler fairness rule に従って比較します。
 *
 * @param left 比較対象の左側 Run 候補です。
 * @param right 比較対象の右側 Run 候補です。
 * @returns `Array.prototype.sort` で使える昇順 comparator 値です。
 * @throws この関数は数値と Run ID の比較だけを行うため例外を投げません。
 * @example
 * ```ts
 * const ordered = candidates.toSorted(compareAgentRunsForScheduling);
 * ```
 */
export function compareAgentRunsForScheduling(
  left: AgentRunSchedulingCandidate,
  right: AgentRunSchedulingCandidate
): number {
  const priorityDiff = right.priority - left.priority;
  if (priorityDiff !== 0) return priorityDiff;
  const lastServedDiff =
    normalizeLastServedAt(left.lastServedAtMs) - normalizeLastServedAt(right.lastServedAtMs);
  if (lastServedDiff !== 0) return lastServedDiff;
  const pendingDiff = left.pendingSinceMs - right.pendingSinceMs;
  if (pendingDiff !== 0) return pendingDiff;
  return left.runId.localeCompare(right.runId);
}

/**
 * 要求された AgentRun status transition が状態機械で許可されるかを判定します。
 *
 * @param transition 現在 status と遷移先 status の組です。
 * @returns 許可される遷移または同一 status なら `true`、逆行や terminal からの変更なら `false` です。
 * @throws この関数は純粋判定だけを行うため例外を投げません。
 * @example
 * ```ts
 * if (!canTransitionAgentRunStatus({ from: row.status, to: 'running' })) throw new TypeError('invalid');
 * ```
 */
export function canTransitionAgentRunStatus(transition: AgentRunStateTransition): boolean {
  if (transition.from === transition.to) {
    return true;
  }
  if (isTerminalRunStatus(transition.from)) {
    return false;
  }
  if (transition.from === 'pending') {
    return transition.to === 'running' || transition.to === 'cancelled';
  }
  if (transition.from === 'running' || transition.from === 'waiting') {
    return transition.to !== 'pending';
  }
  return false;
}

/**
 * 永続化済み文字列が既知の AgentRun status であることを検証します。
 *
 * @param value SQLite row などから復元した status 文字列です。
 * @returns TypeScript の型を `RunStatus` へ narrow します。
 * @throws TypeError 未知の status が渡された場合に発生します。
 * @example
 * ```ts
 * assertRunStatus(row.status);
 * ```
 */
export function assertRunStatus(value: string): asserts value is RunStatus {
  if (!runStatuses.includes(value as RunStatus)) {
    throw new TypeError(`Unsupported AgentRun status: ${value}`);
  }
}

/**
 * AgentRun state machine が要求 transition を許可することを検証します。
 *
 * @param transition 現在 status と遷移先 status の組です。
 * @returns 許可された遷移では値を返さず、呼び出し元の処理を継続させます。
 * @throws TypeError terminal からの変更など、許可されない遷移の場合に発生します。
 * @example
 * ```ts
 * assertAgentRunStatusTransition({ from: row.status, to: 'cancelled' });
 * ```
 */
export function assertAgentRunStatusTransition(transition: AgentRunStateTransition): void {
  if (!canTransitionAgentRunStatus(transition)) {
    throw new TypeError(`Invalid AgentRun transition: ${transition.from} -> ${transition.to}`);
  }
}

function normalizeLastServedAt(value: number | null): number {
  return value ?? Number.NEGATIVE_INFINITY;
}
