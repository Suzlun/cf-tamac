import { and, asc, eq } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from '../schema/agent-storage';

import type { AgentStorageDatabase } from '../database';

/**
 * `AgentGrantRow` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentGrantRow {
  readonly grantId: string;
  readonly principalId: string;
  readonly capability: string;
  readonly scopeRef: string | null;
  readonly status: string;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

/**
 * `InsertAgentGrantInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface InsertAgentGrantInput {
  readonly grantId: string;
  readonly principalId: string;
  readonly capability: string;
  readonly scopeRef?: string;
  readonly status: string;
  readonly nowMs: number;
}

/**
 * `AgentGrantsRepository` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentGrantsRepository {
  readonly tableName: 'agent_grants';
  insertGrant(input: InsertAgentGrantInput): void;
  listGrantsForPrincipal(principalId: string): AgentGrantRow[];
  upsertGrant(input: InsertAgentGrantInput): void;
}

/**
 * `createAgentGrantsRepository` は Agent Service の内部境界で利用する exported 関数です。
 *
 * @remarks
 * この関数は Agent-owned Durable Object / storage / RPC adapter の責務内で呼び出されます。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 * @param agentId repository が所属する Agent aggregate ID です。
 * @param database Agent-owned Durable Object SQLite に接続した Drizzle adapter です。
 * @returns Agent principal grant 操作を Agent ID に束縛した repository object です。
 * 返却された method が query/transaction を実行して失敗した場合は、各 method の呼び出し元へ伝播します。
 * @throws この factory 自体は query/transaction を実行せず、repository object を組み立てるだけのため例外を投げません。
 */
export function createAgentGrantsRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentGrantsRepository {
  const table = agentStorageDrizzleSchema.agentGrants;
  return {
    tableName: 'agent_grants',
    insertGrant(input) {
      database
        .insert(table)
        .values({
          agentId,
          capability: input.capability,
          createdAtMs: input.nowMs,
          grantId: input.grantId,
          principalId: input.principalId,
          scopeRef: input.scopeRef ?? null,
          status: input.status,
          updatedAtMs: input.nowMs,
        })
        .run();
    },
    listGrantsForPrincipal(principalId) {
      return database
        .select()
        .from(table)
        .where(and(eq(table.agentId, agentId), eq(table.principalId, principalId)))
        .orderBy(asc(table.createdAtMs), asc(table.grantId))
        .all();
    },
    upsertGrant(input) {
      const existing = database
        .select({ grantId: table.grantId })
        .from(table)
        .where(and(eq(table.agentId, agentId), eq(table.grantId, input.grantId)))
        .limit(1)
        .get();
      if (existing === undefined) {
        this.insertGrant(input);
        return;
      }
      database
        .update(table)
        .set({
          capability: input.capability,
          principalId: input.principalId,
          scopeRef: input.scopeRef ?? null,
          status: input.status,
          updatedAtMs: input.nowMs,
        })
        .where(and(eq(table.agentId, agentId), eq(table.grantId, input.grantId)))
        .run();
    },
  };
}
