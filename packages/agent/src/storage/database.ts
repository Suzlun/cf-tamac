import { drizzle, type DrizzleSqliteDODatabase } from 'drizzle-orm/durable-sqlite';

import { agentStorageDrizzleSchema, type AgentStorageDrizzleSchema } from './schema/agent-storage';

/**
 * `AgentStorageDatabase` は Agent Service の内部境界で共有する exported 型です。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export type AgentStorageDatabase = DrizzleSqliteDODatabase<AgentStorageDrizzleSchema>;

/**
 * `createAgentStorageDatabase` は Agent Service の内部境界で利用する exported 関数です。
 *
 * @remarks
 * この関数は Agent-owned Durable Object / storage / RPC adapter の責務内で呼び出されます。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 * @param storage AIAgent Durable Object が所有する SQLite storage です。
 * @returns Agent storage schema を型付けした Drizzle Durable SQLite database adapter です。
 * @throws Drizzle Durable SQLite adapter の作成が失敗した場合に呼び出し元へ伝播します。
 */
export function createAgentStorageDatabase(storage: DurableObjectStorage): AgentStorageDatabase {
  return drizzle(storage, { schema: agentStorageDrizzleSchema });
}
