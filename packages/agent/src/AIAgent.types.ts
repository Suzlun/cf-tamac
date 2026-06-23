import type { AgentLifecycleStatus } from './domain';
import type { EventStorageStatus } from './events';
import type { ThreadKeyIdentity } from './threads';

/**
 * AIAgent Durable Object が安全に公開する health 状態です。
 *
 * Agent ID、lifecycle status、storage 種別、queue 種別だけを返し、secret や binding の詳細は含めません。
 * 呼び出し側はこの情報を health RPC の応答 shape へ変換し、外部へ漏らしてよい最小限の稼働情報として扱います。
 *
 * @example
 * ```ts
 * const health: AgentFoundationHealth = agent.checkHealth();
 * ```
 */
export interface AgentFoundationHealth {
  readonly agentId: string;
  readonly queue: 'agent_local';
  readonly status: AgentLifecycleStatus;
  readonly storage: 'sqlite';
}

/**
 * AIAgent Durable Object の SDK state shape です。
 *
 * Agents SDK の `state` に保存する値を lifecycle status だけへ限定し、Agent profile の詳細情報は
 * Durable Object SQLite 側の repository に集約します。
 *
 * @example
 * ```ts
 * const state: AIAgentState = { lifecycleStatus: 'initializing' };
 * ```
 */
export interface AIAgentState {
  readonly lifecycleStatus: AgentLifecycleStatus;
}

/**
 * foundation seam が受け取る internal Event 入力です。
 *
 * RPC 実装前後で共通して使う受理入力で、Thread key、idempotency key、event type、payload ref だけを
 * Durable Object 内部に渡します。payload body 自体はこの型に含めず、blob ref だけを扱います。
 *
 * @example
 * ```ts
 * agent.acceptFoundationEvent({ eventType: 'example', idempotencyKey: 'key', threadKey: 'main' });
 * ```
 */
export interface AgentFoundationEventInput {
  readonly eventType: string;
  readonly idempotencyKey: string;
  readonly payloadRef?: string;
  readonly threadKey: string;
}

/**
 * foundation seam が返す Event 受理結果です。
 *
 * Thread 解決、Event append、pending Run 作成、scheduler wake の結果をまとめて返します。
 * 呼び出し側はこの結果を観測やテストに使えますが、secret や payload body は含めません。
 *
 * @example
 * ```ts
 * const accepted = agent.acceptFoundationEvent(input);
 * ```
 */
export interface AgentFoundationEventAcceptance {
  readonly eventId: string;
  readonly eventType: string;
  readonly identity: ThreadKeyIdentity;
  readonly idempotencyKey: string;
  readonly payloadRef?: string;
  readonly runId: string;
  readonly sectionId: string;
  readonly storageStatus: EventStorageStatus;
  readonly threadId: string;
  readonly wake: AgentSchedulerWakeRecord;
}

/**
 * Agent-local Queue wake の coalescing 状態です。
 *
 * pending Run を Durable Object SQLite に保存した後、scheduler wake を 1 本へまとめられたかを表します。
 * Queue は source of truth ではなく wake boundary だけであることをこの型で明示します。
 *
 * @example
 * ```ts
 * const wake = agent.requestSchedulerWake({ reason: 'event_accepted' });
 * ```
 */
export interface AgentSchedulerWakeRecord {
  readonly coalesced: boolean;
  readonly pendingCount: number;
  readonly wakeStatus: 'pending' | 'running';
}

/**
 * scheduler wake を要求する Worker-internal payload です。
 *
 * Event 受理、手動起動、retry のいずれで wake が必要になったかを Durable Object 内部へ渡します。
 * `requestedAtMs` は監査・観測用の時刻で、省略時は呼び出し側の現在時刻を使います。
 *
 * @example
 * ```ts
 * agent.requestSchedulerWake({ reason: 'manual', requestedAtMs: Date.now() });
 * ```
 */
export interface AgentLocalQueueWakePayload {
  readonly reason: 'event_accepted' | 'manual' | 'retry';
  readonly requestedAtMs?: number;
}

/**
 * Agent-local Queue callback が Run scheduler へ渡す payload です。
 *
 * wake callback が一度に処理する pending Run 数を制御し、unbounded processing を防ぎます。
 * reason は scheduler wake に固定し、Queue が業務 Event の source にならないことを保証します。
 *
 * @example
 * ```ts
 * agent.processPendingRuns({ reason: 'scheduler_wake', maxRuns: 10 });
 * ```
 */
export interface AgentLocalQueueProcessPayload {
  readonly maxRuns?: number;
  readonly reason: 'scheduler_wake';
}

/**
 * scheduler wake callback の bounded processing 結果です。
 *
 * 処理前後の pending 数、処理件数、再 wake の必要性、最終状態を返します。
 * 呼び出し側はこの結果で coalescing と backpressure の挙動を検証できます。
 *
 * @example
 * ```ts
 * const result = agent.processPendingRuns({ reason: 'scheduler_wake' });
 * ```
 */
export interface AgentLocalQueueProcessResult {
  readonly agentId: string;
  readonly pendingCount: number;
  readonly processedCount: number;
  readonly queue: 'agent_local';
  readonly reason: 'scheduler_wake';
  readonly reenqueue: boolean;
  readonly remainingPendingCount: number;
  readonly requestedMaxRuns: number;
  readonly status: 'active_blocked' | 'idle' | 'processed';
}
