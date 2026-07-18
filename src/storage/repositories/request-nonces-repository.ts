import { and, eq } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from '../schema/agent-storage';

import type { AgentStorageDatabase } from '../database';

/**
 * `AgentRequestNonceRow` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentRequestNonceRow {
  readonly principalId: string;
  readonly nonce: string;
  readonly expiresAtMs: number;
  readonly createdAtMs: number;
}

/**
 * `InsertAgentRequestNonceInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface InsertAgentRequestNonceInput {
  readonly principalId: string;
  readonly nonce: string;
  readonly expiresAtMs: number;
  readonly createdAtMs: number;
}

/**
 * `AgentRequestNonceReservation` は Agent Service の内部境界で共有する exported 型です。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export type AgentRequestNonceReservation =
  | { readonly status: 'reserved' }
  | { readonly firstSeenAtMs: number; readonly status: 'replay' };

/**
 * `AgentRequestNoncesRepository` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentRequestNoncesRepository {
  readonly tableName: 'agent_request_nonces';
  findNonce(principalId: string, nonce: string): AgentRequestNonceRow | undefined;
  insertNonce(input: InsertAgentRequestNonceInput): void;
  reserveNonce(input: InsertAgentRequestNonceInput): AgentRequestNonceReservation;
}

/**
 * `createAgentRequestNoncesRepository` は Agent Service の内部境界で利用する exported 関数です。
 *
 * @remarks
 * この関数は Agent-owned Durable Object / storage / RPC adapter の責務内で呼び出されます。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 * @param agentId repository が所属する Agent aggregate ID です。
 * @param database Agent-owned Durable Object SQLite に接続した Drizzle adapter です。
 * @returns control-plane request nonce 操作を Agent ID に束縛した repository object です。
 * 返却された method が query/transaction を実行して失敗した場合は、各 method の呼び出し元へ伝播します。
 * @throws この factory 自体は query/transaction を実行せず、repository object を組み立てるだけのため例外を投げません。
 */
export function createAgentRequestNoncesRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentRequestNoncesRepository {
  const table = agentStorageDrizzleSchema.agentRequestNonces;
  return {
    tableName: 'agent_request_nonces',
    findNonce(principalId, nonce) {
      return database
        .select()
        .from(table)
        .where(
          and(
            eq(table.agentId, agentId),
            eq(table.principalId, principalId),
            eq(table.nonce, nonce)
          )
        )
        .limit(1)
        .get();
    },
    insertNonce(input) {
      database
        .insert(table)
        .values({
          agentId,
          createdAtMs: input.createdAtMs,
          expiresAtMs: input.expiresAtMs,
          nonce: input.nonce,
          principalId: input.principalId,
        })
        .run();
    },
    reserveNonce(input) {
      const existing = this.findNonce(input.principalId, input.nonce);
      if (existing !== undefined && existing.expiresAtMs > input.createdAtMs) {
        return { firstSeenAtMs: existing.createdAtMs, status: 'replay' };
      }
      if (existing === undefined) {
        this.insertNonce(input);
        return { status: 'reserved' };
      }
      database
        .update(table)
        .set({ createdAtMs: input.createdAtMs, expiresAtMs: input.expiresAtMs })
        .where(
          and(
            eq(table.agentId, agentId),
            eq(table.principalId, input.principalId),
            eq(table.nonce, input.nonce)
          )
        )
        .run();
      return { status: 'reserved' };
    },
  };
}
