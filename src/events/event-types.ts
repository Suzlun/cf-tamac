import type { ThreadKeyIdentity } from '../threads';

/**
 * Agent foundation が Event acceptance で受け取る最小入力です。
 *
 * @remarks
 * Thread identity、冪等 key、Event type、payload 参照だけを持たせ、Event source of truth を
 * AIAgent Durable Object SQLite に閉じます。Cloudflare Queues や Client D1 はこの入力に含めません。
 */
export interface EventAcceptanceInput {
  readonly identity: ThreadKeyIdentity;
  readonly idempotencyKey: string;
  readonly eventType: string;
  readonly payloadRef?: string;
}

/**
 * Agent-owned storage に保存する Event acceptance status 一覧です。
 *
 * @remarks
 * 新規受理と冪等 replay の結果だけを区別します。mailbox 処理や scheduler wake の状態は
 * 別 ledger で扱い、Event row の保存状態へ混在させません。
 */
export const eventStorageStatuses = ['accepted', 'replayed'] as const;

/**
 * Event storage status の union 型です。
 *
 * @remarks
 * `eventStorageStatuses` から導出し、repository と domain result が同じ保存結果だけを返すようにします。
 */
export type EventStorageStatus = (typeof eventStorageStatuses)[number];
