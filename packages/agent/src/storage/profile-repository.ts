import { eq } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from './schema';

import type { AgentStorageDatabase } from './database';

/**
 * Row stored in the Agent profile table.
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
 * Input for creating or updating the Agent profile row.
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
 * Repository for the Agent aggregate profile row.
 */
export interface AgentProfileRepository {
  readonly tableName: 'agent_profile';
  getProfile(): AgentProfileRow | undefined;
  upsertProfile(input: UpsertAgentProfileInput): void;
}

/**
 * Create a repository for the Agent aggregate profile row.
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
