import { and, eq } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from './schema';

import type { AgentStorageDatabase } from './database';

/**
 * Row stored for an Agent-local principal.
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
 * Input for upserting an Agent-local principal.
 */
export interface UpsertAgentPrincipalInput {
  readonly principalId: string;
  readonly principalType: string;
  readonly displayName?: string;
  readonly status: string;
  readonly nowMs: number;
}

/**
 * Repository for Agent-local principal records.
 */
export interface AgentPrincipalsRepository {
  readonly tableName: 'agent_principals';
  findPrincipal(principalId: string): AgentPrincipalRow | undefined;
  upsertPrincipal(input: UpsertAgentPrincipalInput): void;
}

/**
 * Create a repository for Agent-local principal records.
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
