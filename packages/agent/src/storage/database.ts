import { drizzle, type DrizzleSqliteDODatabase } from 'drizzle-orm/durable-sqlite';

import { agentStorageDrizzleSchema, type AgentStorageDrizzleSchema } from './schema';

/**
 * Typed Drizzle database adapter for one AIAgent Durable Object SQLite store.
 */
export type AgentStorageDatabase = DrizzleSqliteDODatabase<AgentStorageDrizzleSchema>;

/**
 * Create the Drizzle Durable Object SQLite adapter for one Agent aggregate root.
 */
export function createAgentStorageDatabase(storage: DurableObjectStorage): AgentStorageDatabase {
  return drizzle(storage, { schema: agentStorageDrizzleSchema });
}
