import { and, desc, eq } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from './schema';

import type { AgentStorageDatabase } from './database';

/**
 * Row stored for a versioned Agent configuration snapshot.
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
 * Input for inserting a versioned Agent configuration snapshot.
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
 * Repository for versioned Agent configuration snapshots.
 */
export interface AgentConfigRepository {
  readonly tableName: 'agent_config_versions';
  findConfigVersion(configVersion: number): AgentConfigRow | undefined;
  getLatestConfig(): AgentConfigRow | undefined;
  insertConfigVersion(input: InsertAgentConfigVersionInput): void;
}

/**
 * Create a repository for versioned Agent configuration snapshots.
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
