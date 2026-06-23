import { and, asc, eq } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from './schema';

import type { AgentStorageDatabase } from './database';

/**
 * Row stored for an Agent-local grant.
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
 * Input for inserting an Agent-local grant.
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
 * Repository for Agent-local grants and capability scopes.
 */
export interface AgentGrantsRepository {
  readonly tableName: 'agent_grants';
  insertGrant(input: InsertAgentGrantInput): void;
  listGrantsForPrincipal(principalId: string): AgentGrantRow[];
  upsertGrant(input: InsertAgentGrantInput): void;
}

/**
 * Create a repository for Agent-local grants and capability scopes.
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
