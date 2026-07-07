import type {
  AgentLocalQueueProcessPayload,
  AgentLocalQueueWakePayload,
  AgentSchedulerWakeRecord,
} from '../AIAgent.types';
import type { AgentStorageRepositories } from '../storage';

const deliveryResumeWakeActions = ['follow_up_event', 'resume'] as const;

/**
 * Agent-local Queue の `processPendingRuns` callback を起動する関数型です。
 *
 * @remarks
 * Durable Object helper は Agents SDK の `queue` method 自体を所有せず、AIAgent からこの関数を
 * 注入されます。helper 側では method 名を `processPendingRuns` に固定し、Queue が Event source of
 * truth にならないよう payload を scheduler wake 用に限定します。
 *
 * @example
 * ```ts
 * const queue: AgentLocalQueueMethodInvoker = (methodName, payload) => agent.queue(methodName, payload);
 * ```
 */
export type AgentLocalQueueMethodInvoker = (
  methodName: 'processPendingRuns',
  payload: AgentLocalQueueProcessPayload
) => Promise<unknown>;

/**
 * scheduler wake 要求を SQLite coalescing ledger に記録する入力です。
 *
 * @remarks
 * `repositories` は Agent-owned Durable Object SQLite の source of truth で、`enqueueSchedulerWake` は
 * ledger が新規 pending 状態へ進んだ場合だけ呼ばれます。`nowMs` はテストや再現性が必要な境界だけで
 * 注入し、通常は Durable Object の現在時刻を使います。
 *
 * @example
 * ```ts
 * requestAgentSchedulerWake({ payload, repositories, enqueueSchedulerWake: () => undefined });
 * ```
 */
export interface AgentSchedulerWakeRequestInput {
  /** wake を要求した理由と観測時刻です。 */
  readonly payload: AgentLocalQueueWakePayload;
  /** wake coalescing と pending Run 数を読む Agent-owned repository set です。 */
  readonly repositories: AgentStorageRepositories;
  /** 新規 wake が必要な場合に Agent-local Queue へ callback を積む境界関数です。 */
  readonly enqueueSchedulerWake: () => void;
  /** `requestedAtMs` が省略された場合だけ使う現在時刻 provider です。 */
  readonly nowMs?: () => number;
}

/**
 * Agent-local Queue へ `processPendingRuns` callback を enqueue する入力です。
 *
 * @remarks
 * Queue enqueue に失敗した場合でも pending Run の source of truth は SQLite に残るため、fallback は
 * scheduler wake ledger を pending に戻し、後続 wake が再度 callback を積める状態へ戻します。
 *
 * @example
 * ```ts
 * enqueueAgentSchedulerWake({ maxRuns: undefined, queue, repositories });
 * ```
 */
export interface AgentSchedulerWakeEnqueueInput {
  /** 一度の callback で処理したい最大 Run 数です。未指定時は callback 側の既定値を使います。 */
  readonly maxRuns: number | undefined;
  /** Agents SDK queue method を Durable Object から注入した関数です。 */
  readonly queue: AgentLocalQueueMethodInvoker;
  /** fallback markPending と pending count 読み取りに使う Agent-owned repository set です。 */
  readonly repositories: AgentStorageRepositories;
  /** enqueue 失敗時の観測時刻 provider です。 */
  readonly nowMs?: () => number;
}

/**
 * Delivery result 後に scheduler wake を要求するかを判定する入力です。
 *
 * @remarks
 * Integration Provider からの Delivery callback は replay 時に重複 wake してはいけません。
 * `resumeAction` が follow-up Event または Run resume を意味する場合だけ pending Run scheduler を起こします。
 *
 * @example
 * ```ts
 * if (shouldRequestDeliveryResumeWake(result)) requestWake();
 * ```
 */
export interface AgentDeliveryResumeWakeInput {
  /** idempotency replay の場合は true です。 */
  readonly replayed: boolean;
  /** Delivery result 分類が返した resume/follow-up action です。 */
  readonly resumeAction?: string;
}

/**
 * scheduler wake 要求を coalescing ledger に記録し、新規 wake の場合だけ Queue callback を積みます。
 *
 * @param input wake payload、Agent-owned repository set、Queue enqueue 境界、現在時刻 provider です。
 * @returns SQLite ledger へ記録された wake 状態です。
 * @throws repository 操作が失敗した場合に呼び出し元へ伝播します。
 * @example
 * ```ts
 * const wake = requestAgentSchedulerWake({ payload, repositories, enqueueSchedulerWake });
 * ```
 */
export function requestAgentSchedulerWake(
  input: AgentSchedulerWakeRequestInput
): AgentSchedulerWakeRecord {
  // requestedAtMs を ledger の基準時刻にして、RPC/Provider 受理時刻と wake 観測を揃えます。
  const wake = input.repositories.schedulerWakes.recordWake(
    input.payload.requestedAtMs ?? readNow(input.nowMs)
  );
  if (!wake.coalesced) {
    // coalesced でない最初の要求だけ Queue callback を積み、unbounded wake 増殖を防ぎます。
    input.enqueueSchedulerWake();
  }
  return wake;
}

/**
 * Agent-local Queue に `processPendingRuns` callback を積み、失敗時は wake ledger を pending に戻します。
 *
 * @param input Queue 呼び出し境界、repository set、最大処理数、現在時刻 provider です。
 * @returns 非同期 enqueue を fire-and-observe するため戻り値はありません。
 * @throws Queue 呼び出し関数が同期例外を投げた場合に呼び出し元へ伝播します。非同期失敗は ledger を pending に戻します。
 * @example
 * ```ts
 * enqueueAgentSchedulerWake({ maxRuns: 1, queue, repositories });
 * ```
 */
export function enqueueAgentSchedulerWake(input: AgentSchedulerWakeEnqueueInput): void {
  const payload = createAgentLocalQueueProcessPayload(input.maxRuns);
  void input.queue('processPendingRuns', payload).catch(() => {
    // Queue enqueue 失敗時は SQLite ledger を pending に戻し、次の wake 要求で再 enqueue できるようにします。
    input.repositories.schedulerWakes.markPending(
      readNow(input.nowMs),
      input.repositories.pendingRuns.countPendingRuns()
    );
  });
}

/**
 * Delivery result が follow-up Event または Run resume を発生させた場合だけ scheduler wake を要求します。
 *
 * @param input Delivery result の replay 状態と resume action です。
 * @returns scheduler wake が必要な場合は true、不要な場合は false です。
 * @throws この関数は入力済み metadata の純粋判定だけを行うため例外を投げません。
 * @example
 * ```ts
 * const needsWake = shouldRequestDeliveryResumeWake({ replayed: false, resumeAction: 'resume' });
 * ```
 */
export function shouldRequestDeliveryResumeWake(input: AgentDeliveryResumeWakeInput): boolean {
  // replay は既に保存済みの応答を返すだけなので、scheduler wake を重複発行しません。
  if (input.replayed || input.resumeAction === undefined) return false;
  // wake 対象 action を狭く固定し、terminal/stale callback では Run scheduler を起こしません。
  return deliveryResumeWakeActions.some((action) => action === input.resumeAction);
}

function createAgentLocalQueueProcessPayload(
  maxRuns: number | undefined
): AgentLocalQueueProcessPayload {
  return maxRuns === undefined
    ? { reason: 'scheduler_wake' }
    : { maxRuns, reason: 'scheduler_wake' };
}

function readNow(nowMs: (() => number) | undefined): number {
  return nowMs === undefined ? Date.now() : nowMs();
}
