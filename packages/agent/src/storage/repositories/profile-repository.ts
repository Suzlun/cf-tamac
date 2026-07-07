import { eq } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from '../schema/agent-storage';

import type { AgentStorageDatabase } from '../database';

/**
 * `AgentProfileRow` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentProfileRow {
  readonly agentId: string;
  readonly lifecycleStatus: string;
  readonly displayName: string | null;
  readonly configVersion: number;
  readonly credentialGeneration: number;
  readonly systemThreadId: string | null;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

/**
 * `UpsertAgentProfileInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface UpsertAgentProfileInput {
  readonly lifecycleStatus: string;
  readonly displayName?: string;
  readonly configVersion: number;
  readonly credentialGeneration: number;
  readonly systemThreadId?: string;
  readonly nowMs: number;
}

/**
 * `AgentProfileRepository` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentProfileRepository {
  readonly tableName: 'agent_profile';
  getProfile(): AgentProfileRow | undefined;
  upsertProfile(input: UpsertAgentProfileInput): void;
}

/**
 * `createAgentProfileRepository` は Agent Service の内部境界で利用する exported 関数です。
 *
 * @remarks
 * この関数は Agent-owned Durable Object / storage / RPC adapter の責務内で呼び出されます。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 * @param agentId repository が所属する Agent aggregate ID です。
 * @param database Agent-owned Durable Object SQLite に接続した Drizzle adapter です。
 * @returns Agent profile 操作を Agent ID に束縛した repository object です。
 * 返却された method が query/transaction を実行して失敗した場合は、各 method の呼び出し元へ伝播します。
 * @throws この factory 自体は query/transaction を実行せず、repository object を組み立てるだけのため例外を投げません。
 */
export function createAgentProfileRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentProfileRepository {
  const table = agentStorageDrizzleSchema.agentProfile;
  return {
    tableName: 'agent_profile',
    getProfile() {
      return database.select().from(table).where(eq(table.agentId, agentId)).limit(1).get();
    },
    upsertProfile(input) {
      const existing = this.getProfile();
      if (existing === undefined) {
        database
          .insert(table)
          .values({
            agentId,
            configVersion: input.configVersion,
            createdAtMs: input.nowMs,
            credentialGeneration: input.credentialGeneration,
            displayName: input.displayName ?? null,
            lifecycleStatus: input.lifecycleStatus,
            systemThreadId: input.systemThreadId ?? null,
            updatedAtMs: input.nowMs,
          })
          .run();
        return;
      }
      database
        .update(table)
        .set({
          configVersion: input.configVersion,
          credentialGeneration: input.credentialGeneration,
          displayName: input.displayName ?? existing.displayName,
          lifecycleStatus: input.lifecycleStatus,
          systemThreadId: input.systemThreadId ?? existing.systemThreadId,
          updatedAtMs: input.nowMs,
        })
        .where(eq(table.agentId, agentId))
        .run();
    },
  };
}
