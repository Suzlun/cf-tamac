import { and, eq } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from './schema';

import type { AgentStorageDatabase } from './database';

/**
 * Row stored for request nonce replay protection.
 */
export interface AgentRequestNonceRow {
  readonly principalId: string;
  readonly nonce: string;
  readonly expiresAtMs: number;
  readonly createdAtMs: number;
}

/**
 * Input for recording a replay-protection nonce.
 */
export interface InsertAgentRequestNonceInput {
  readonly principalId: string;
  readonly nonce: string;
  readonly expiresAtMs: number;
  readonly createdAtMs: number;
}

/**
 * Result of reserving a nonce in Agent-owned storage.
 */
export type AgentRequestNonceReservation =
  | { readonly status: 'reserved' }
  | { readonly firstSeenAtMs: number; readonly status: 'replay' };

/**
 * Repository for Agent request nonce replay protection.
 */
export interface AgentRequestNoncesRepository {
  readonly tableName: 'agent_request_nonces';
  findNonce(principalId: string, nonce: string): AgentRequestNonceRow | undefined;
  insertNonce(input: InsertAgentRequestNonceInput): void;
  reserveNonce(input: InsertAgentRequestNonceInput): AgentRequestNonceReservation;
}

/**
 * Create a repository for Agent request nonce replay protection.
 */
export function createAgentRequestNoncesRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentRequestNoncesRepository {
  const table = agentStorageDrizzleSchema.agentRequestNonces;
  return {
    tableName: 'agent_request_nonces',
    findNonce(principalId, nonce) {
      return database
        .select()
        .from(table)
        .where(
          and(
            eq(table.agentId, agentId),
            eq(table.principalId, principalId),
            eq(table.nonce, nonce)
          )
        )
        .limit(1)
        .get();
    },
    insertNonce(input) {
      database
        .insert(table)
        .values({
          agentId,
          createdAtMs: input.createdAtMs,
          expiresAtMs: input.expiresAtMs,
          nonce: input.nonce,
          principalId: input.principalId,
        })
        .run();
    },
    reserveNonce(input) {
      const existing = this.findNonce(input.principalId, input.nonce);
      if (existing !== undefined && existing.expiresAtMs > input.createdAtMs) {
        return { firstSeenAtMs: existing.createdAtMs, status: 'replay' };
      }
      if (existing === undefined) {
        this.insertNonce(input);
        return { status: 'reserved' };
      }
      database
        .update(table)
        .set({ createdAtMs: input.createdAtMs, expiresAtMs: input.expiresAtMs })
        .where(
          and(
            eq(table.agentId, agentId),
            eq(table.principalId, input.principalId),
            eq(table.nonce, input.nonce)
          )
        )
        .run();
      return { status: 'reserved' };
    },
  };
}
