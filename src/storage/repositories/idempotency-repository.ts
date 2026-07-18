import { and, eq } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from '../schema/agent-storage';

import type { AgentStorageDatabase } from '../database';

/**
 * `AgentIdempotencyRecordRow` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentIdempotencyRecordRow {
  readonly principalId: string;
  readonly idempotencyKey: string;
  readonly operationName: string;
  readonly requestDigest: string;
  readonly responseRef: string | null;
  readonly status: string;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
}

/**
 * `InsertAgentIdempotencyRecordInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface InsertAgentIdempotencyRecordInput {
  readonly principalId: string;
  readonly idempotencyKey: string;
  readonly operationName: string;
  readonly requestDigest: string;
  readonly responseRef?: string;
  readonly status: string;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
}

/**
 * `AgentIdempotencyRepository` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentIdempotencyRepository {
  readonly tableName: 'agent_idempotency_records';
  findRecord(principalId: string, idempotencyKey: string): AgentIdempotencyRecordRow | undefined;
  insertRecord(input: InsertAgentIdempotencyRecordInput): void;
  updateRecordResponse(input: {
    readonly idempotencyKey: string;
    readonly principalId: string;
    readonly responseRef: string;
    readonly status: string;
  }): void;
}

/**
 * `createAgentIdempotencyRepository` は Agent Service の内部境界で利用する exported 関数です。
 *
 * @remarks
 * この関数は Agent-owned Durable Object / storage / RPC adapter の責務内で呼び出されます。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 * @param agentId repository が所属する Agent aggregate ID です。
 * @param database Agent-owned Durable Object SQLite に接続した Drizzle adapter です。
 * @returns idempotency ledger 操作を Agent ID に束縛した repository object です。
 * 返却された method が query/transaction を実行して失敗した場合は、各 method の呼び出し元へ伝播します。
 * @throws この factory 自体は query/transaction を実行せず、repository object を組み立てるだけのため例外を投げません。
 */
export function createAgentIdempotencyRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentIdempotencyRepository {
  const table = agentStorageDrizzleSchema.agentIdempotencyRecords;
  return {
    tableName: 'agent_idempotency_records',
    findRecord(principalId, idempotencyKey) {
      return database
        .select()
        .from(table)
        .where(
          and(
            eq(table.agentId, agentId),
            eq(table.principalId, principalId),
            eq(table.idempotencyKey, idempotencyKey)
          )
        )
        .limit(1)
        .get();
    },
    insertRecord(input) {
      database
        .insert(table)
        .values({
          agentId,
          createdAtMs: input.createdAtMs,
          expiresAtMs: input.expiresAtMs,
          idempotencyKey: input.idempotencyKey,
          operationName: input.operationName,
          principalId: input.principalId,
          requestDigest: input.requestDigest,
          responseRef: input.responseRef ?? null,
          status: input.status,
        })
        .run();
    },
    updateRecordResponse(input) {
      database
        .update(table)
        .set({ responseRef: input.responseRef, status: input.status })
        .where(
          and(
            eq(table.agentId, agentId),
            eq(table.principalId, input.principalId),
            eq(table.idempotencyKey, input.idempotencyKey)
          )
        )
        .run();
    },
  };
}
