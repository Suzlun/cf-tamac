import { and, eq } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from '../schema/agent-storage';

import type { AgentStorageDatabase } from '../database';

/**
 * `AgentPrincipalRow` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentPrincipalRow {
  readonly principalId: string;
  readonly principalType: string;
  readonly displayName: string | null;
  readonly status: string;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

/**
 * `UpsertAgentPrincipalInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface UpsertAgentPrincipalInput {
  readonly principalId: string;
  readonly principalType: string;
  readonly displayName?: string;
  readonly status: string;
  readonly nowMs: number;
}

/**
 * `AgentPrincipalsRepository` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentPrincipalsRepository {
  readonly tableName: 'agent_principals';
  findPrincipal(principalId: string): AgentPrincipalRow | undefined;
  upsertPrincipal(input: UpsertAgentPrincipalInput): void;
}

/**
 * `createAgentPrincipalsRepository` は Agent Service の内部境界で利用する exported 関数です。
 *
 * @remarks
 * この関数は Agent-owned Durable Object / storage / RPC adapter の責務内で呼び出されます。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 * @param agentId repository が所属する Agent aggregate ID です。
 * @param database Agent-owned Durable Object SQLite に接続した Drizzle adapter です。
 * @returns Agent principal 操作を Agent ID に束縛した repository object です。
 * 返却された method が query/transaction を実行して失敗した場合は、各 method の呼び出し元へ伝播します。
 * @throws この factory 自体は query/transaction を実行せず、repository object を組み立てるだけのため例外を投げません。
 */
export function createAgentPrincipalsRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentPrincipalsRepository {
  const table = agentStorageDrizzleSchema.agentPrincipals;
  return {
    tableName: 'agent_principals',
    findPrincipal(principalId) {
      return database
        .select()
        .from(table)
        .where(and(eq(table.agentId, agentId), eq(table.principalId, principalId)))
        .limit(1)
        .get();
    },
    upsertPrincipal(input) {
      const existing = this.findPrincipal(input.principalId);
      if (existing === undefined) {
        database
          .insert(table)
          .values({
            agentId,
            createdAtMs: input.nowMs,
            displayName: input.displayName ?? null,
            principalId: input.principalId,
            principalType: input.principalType,
            status: input.status,
            updatedAtMs: input.nowMs,
          })
          .run();
        return;
      }
      database
        .update(table)
        .set({
          displayName: input.displayName ?? existing.displayName,
          principalType: input.principalType,
          status: input.status,
          updatedAtMs: input.nowMs,
        })
        .where(and(eq(table.agentId, agentId), eq(table.principalId, input.principalId)))
        .run();
    },
  };
}
