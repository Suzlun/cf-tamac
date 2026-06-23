/**
 * Compaction の永続状態として許可する値一覧です。
 *
 * `pending` は Section を閉じたあと出力生成の開始を待つ状態、`running` は出力生成中、
 * `ready` は Handoff/History/Memory などの参照が利用可能な成功状態、`failed` と
 * `cancelled` は再開文脈として採用してはならない終端状態を表します。
 *
 * @example
 * ```ts
 * if (compactionStatuses.includes(row.status as CompactionStatus)) {
 *   // 永続値を状態機械へ渡せます。
 * }
 * ```
 */
export const compactionStatuses = ['pending', 'running', 'ready', 'failed', 'cancelled'] as const;

/**
 * Compaction 状態機械で扱う永続 status 型です。
 *
 * DB から復元した文字列は `assertCompactionStatus` で検証してからこの型として扱います。
 */
export type CompactionStatus = (typeof compactionStatuses)[number];

/**
 * 出力生成が未完了で、次の状態へ進められる Compaction status です。
 *
 * `pending` と `running` のみを unfinished とし、Event 受理は別の open Section に継続します。
 */
export const unfinishedCompactionStatuses = [
  'pending',
  'running',
] as const satisfies readonly CompactionStatus[];

/**
 * 出力生成が確定し、以後の status 変更を拒否する Compaction status です。
 *
 * `ready` だけが再開文脈として参照可能で、`failed` と `cancelled` は監査・診断用に保持します。
 */
export const terminalCompactionStatuses = [
  'ready',
  'failed',
  'cancelled',
] as const satisfies readonly CompactionStatus[];

/**
 * Compaction status transition の検証入力です。
 *
 * @property from 永続化済みの現在 status です。
 * @property to 要求された遷移先 status です。
 */
export interface CompactionStatusTransition {
  readonly from: CompactionStatus;
  readonly to: CompactionStatus;
}

/**
 * 指定 status が終端状態かどうかを返します。
 *
 * @param status 検査対象の Compaction status です。
 * @returns `ready`、`failed`、`cancelled` のいずれかであれば `true` を返します。
 *
 * @example
 * ```ts
 * if (isTerminalCompactionStatus(row.status)) {
 *   // 以後の output 変更を拒否できます。
 * }
 * ```
 */
export function isTerminalCompactionStatus(status: CompactionStatus): boolean {
  return terminalCompactionStatuses.includes(status as (typeof terminalCompactionStatuses)[number]);
}

/**
 * 指定 status が未完了状態かどうかを返します。
 *
 * @param status 検査対象の Compaction status です。
 * @returns `pending` または `running` であれば `true` を返します。
 */
export function isUnfinishedCompactionStatus(status: CompactionStatus): boolean {
  return unfinishedCompactionStatuses.includes(
    status as (typeof unfinishedCompactionStatuses)[number]
  );
}

/**
 * Compaction status transition が許可されるかを判定します。
 *
 * @param transition 現在 status と遷移先 status の組です。
 * @returns 許可される遷移であれば `true`、終端状態からの変更や不正な短絡であれば `false` です。
 *
 * @example
 * ```ts
 * canTransitionCompactionStatus({ from: 'pending', to: 'running' }); // true
 * canTransitionCompactionStatus({ from: 'ready', to: 'failed' }); // false
 * ```
 */
export function canTransitionCompactionStatus(transition: CompactionStatusTransition): boolean {
  if (transition.from === transition.to) {
    return true;
  }
  if (isTerminalCompactionStatus(transition.from)) {
    return false;
  }
  if (transition.from === 'pending') {
    return (
      transition.to === 'running' || transition.to === 'failed' || transition.to === 'cancelled'
    );
  }
  if (transition.from === 'running') {
    return transition.to === 'ready' || transition.to === 'failed' || transition.to === 'cancelled';
  }
  return false;
}

/**
 * DB などから取得した文字列が既知の Compaction status であることを検証します。
 *
 * @param value 検証対象の文字列です。
 * @throws TypeError 未知の status が渡された場合に発生します。
 */
export function assertCompactionStatus(value: string): asserts value is CompactionStatus {
  if (!compactionStatuses.includes(value as CompactionStatus)) {
    throw new TypeError(`Unsupported Compaction status: ${value}`);
  }
}

/**
 * Compaction status transition が状態機械に従うことを検証します。
 *
 * @param transition 現在 status と遷移先 status の組です。
 * @throws TypeError 許可されない遷移が要求された場合に発生します。
 */
export function assertCompactionStatusTransition(transition: CompactionStatusTransition): void {
  if (!canTransitionCompactionStatus(transition)) {
    throw new TypeError(`Invalid Compaction transition: ${transition.from} -> ${transition.to}`);
  }
}
