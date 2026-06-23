import { and, eq } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from './schema';

import type { AgentStorageDatabase } from './database';

/**
 * Row stored for command idempotency replay.
 */
export interface AgentIdempotencyRecordRow {
  readonly principalId: string;
  readonly idempotencyKey: string;
  readonly operationName: string;
  readonly requestDigest: string;
  readonly responseRef: string | null;
  readonly status: string;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
}

/**
 * Input for recording command idempotency state.
 */
export interface InsertAgentIdempotencyRecordInput {
  readonly principalId: string;
  readonly idempotencyKey: string;
  readonly operationName: string;
  readonly requestDigest: string;
  readonly responseRef?: string;
  readonly status: string;
  readonly createdAtMs: number;
  readonly expiresAtMs: number;
}

/**
 * Repository for command idempotency records.
 */
export interface AgentIdempotencyRepository {
  readonly tableName: 'agent_idempotency_records';
  findRecord(principalId: string, idempotencyKey: string): AgentIdempotencyRecordRow | undefined;
  insertRecord(input: InsertAgentIdempotencyRecordInput): void;
  updateRecordResponse(input: {
    readonly idempotencyKey: string;
    readonly principalId: string;
    readonly responseRef: string;
    readonly status: string;
  }): void;
}

/**
 * Create a repository for command idempotency records.
 */
export function createAgentIdempotencyRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentIdempotencyRepository {
  const table = agentStorageDrizzleSchema.agentIdempotencyRecords;
  return {
    tableName: 'agent_idempotency_records',
    findRecord(principalId, idempotencyKey) {
      return database
        .select()
        .from(table)
        .where(
          and(
            eq(table.agentId, agentId),
            eq(table.principalId, principalId),
            eq(table.idempotencyKey, idempotencyKey)
          )
        )
        .limit(1)
        .get();
    },
    insertRecord(input) {
      database
        .insert(table)
        .values({
          agentId,
          createdAtMs: input.createdAtMs,
          expiresAtMs: input.expiresAtMs,
          idempotencyKey: input.idempotencyKey,
          operationName: input.operationName,
          principalId: input.principalId,
          requestDigest: input.requestDigest,
          responseRef: input.responseRef ?? null,
          status: input.status,
        })
        .run();
    },
    updateRecordResponse(input) {
      database
        .update(table)
        .set({ responseRef: input.responseRef, status: input.status })
        .where(
          and(
            eq(table.agentId, agentId),
            eq(table.principalId, input.principalId),
            eq(table.idempotencyKey, input.idempotencyKey)
          )
        )
        .run();
    },
  };
}
