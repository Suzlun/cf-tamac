import { and, desc, eq } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from '../schema/agent-storage';

import type { AgentStorageDatabase } from '../database';

/**
 * `AgentConfigRow` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentConfigRow {
  readonly configVersion: number;
  readonly displayName: string | null;
  readonly modelPolicyRef: string | null;
  readonly budgetPolicyRef: string | null;
  readonly memoryPolicyRef: string | null;
  readonly toolPolicyRef: string | null;
  readonly schedulePolicyRef: string | null;
  readonly configBodyRef: string | null;
  readonly updatedByPrincipalId: string | null;
  readonly updatedAtMs: number;
}

/**
 * `InsertAgentConfigVersionInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface InsertAgentConfigVersionInput {
  readonly configVersion: number;
  readonly displayName?: string;
  readonly modelPolicyRef?: string;
  readonly budgetPolicyRef?: string;
  readonly memoryPolicyRef?: string;
  readonly toolPolicyRef?: string;
  readonly schedulePolicyRef?: string;
  readonly configBodyRef?: string;
  readonly updatedByPrincipalId?: string;
  readonly updatedAtMs: number;
}

/**
 * `AgentConfigRepository` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentConfigRepository {
  readonly tableName: 'agent_config_versions';
  findConfigVersion(configVersion: number): AgentConfigRow | undefined;
  getLatestConfig(): AgentConfigRow | undefined;
  insertConfigVersion(input: InsertAgentConfigVersionInput): void;
}

/**
 * `createAgentConfigRepository` は Agent Service の内部境界で利用する exported 関数です。
 *
 * @remarks
 * この関数は Agent-owned Durable Object / storage / RPC adapter の責務内で呼び出されます。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 * @param agentId repository が所属する Agent aggregate ID です。
 * @param database Agent-owned Durable Object SQLite に接続した Drizzle adapter です。
 * @returns Agent config の読み書き操作を Agent ID に束縛した repository object です。
 * 返却された method が query/transaction を実行して失敗した場合は、各 method の呼び出し元へ伝播します。
 * @throws この factory 自体は query/transaction を実行せず、repository object を組み立てるだけのため例外を投げません。
 */
export function createAgentConfigRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentConfigRepository {
  const table = agentStorageDrizzleSchema.agentConfigVersions;
  return {
    tableName: 'agent_config_versions',
    findConfigVersion(configVersion) {
      return database
        .select()
        .from(table)
        .where(and(eq(table.agentId, agentId), eq(table.configVersion, configVersion)))
        .limit(1)
        .get();
    },
    getLatestConfig() {
      return database
        .select()
        .from(table)
        .where(eq(table.agentId, agentId))
        .orderBy(desc(table.configVersion))
        .limit(1)
        .get();
    },
    insertConfigVersion(input) {
      database
        .insert(table)
        .values({
          agentId,
          budgetPolicyRef: input.budgetPolicyRef ?? null,
          configBodyRef: input.configBodyRef ?? null,
          configVersion: input.configVersion,
          displayName: input.displayName ?? null,
          memoryPolicyRef: input.memoryPolicyRef ?? null,
          modelPolicyRef: input.modelPolicyRef ?? null,
          schedulePolicyRef: input.schedulePolicyRef ?? null,
          toolPolicyRef: input.toolPolicyRef ?? null,
          updatedAtMs: input.updatedAtMs,
          updatedByPrincipalId: input.updatedByPrincipalId ?? null,
        })
        .run();
    },
  };
}
