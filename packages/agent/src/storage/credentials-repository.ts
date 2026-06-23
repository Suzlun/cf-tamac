import { and, desc, eq, gt, inArray, isNull, lte, or } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from './schema';

import type { AgentStorageDatabase } from './database';

/**
 * Row stored for an Agent credential reference.
 */
export interface AgentCredentialRow {
  readonly credentialId: string;
  readonly generation: number;
  readonly status: string;
  readonly verifierRef: string | null;
  readonly publicFingerprint: string | null;
  readonly secretReference: string | null;
  readonly notBeforeMs: number | null;
  readonly expiresAtMs: number | null;
  readonly revokedAtMs: number | null;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

/**
 * Input for inserting an Agent credential record.
 */
export interface InsertAgentCredentialInput {
  readonly credentialId: string;
  readonly generation: number;
  readonly status: string;
  readonly verifierRef?: string;
  readonly publicFingerprint?: string;
  readonly secretReference?: string;
  readonly notBeforeMs?: number;
  readonly expiresAtMs?: number;
  readonly revokedAtMs?: number;
  readonly nowMs: number;
}

/**
 * Input for changing an Agent credential status.
 */
export interface UpdateAgentCredentialStatusInput {
  readonly credentialId: string;
  readonly status: string;
  readonly expiresAtMs?: number;
  readonly revokedAtMs?: number;
  readonly nowMs: number;
}

/**
 * Repository for Agent credential references and rotation generations.
 */
export interface AgentCredentialsRepository {
  readonly tableName: 'agent_credentials';
  findActiveCredential(nowMs: number): AgentCredentialRow | undefined;
  findCredential(credentialId: string): AgentCredentialRow | undefined;
  findCredentialByGeneration(generation: number): AgentCredentialRow | undefined;
  insertCredential(input: InsertAgentCredentialInput): void;
  listCredentials(): AgentCredentialRow[];
  updateCredentialStatus(input: UpdateAgentCredentialStatusInput): void;
}

/**
 * Create a repository for Agent credential references and rotation generations.
 */
export function createAgentCredentialsRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentCredentialsRepository {
  const table = agentStorageDrizzleSchema.agentCredentials;
  return {
    tableName: 'agent_credentials',
    findActiveCredential(nowMs) {
      return database
        .select()
        .from(table)
        .where(
          and(
            eq(table.agentId, agentId),
            inArray(table.status, ['active', 'overlap']),
            or(isNull(table.notBeforeMs), lte(table.notBeforeMs, nowMs)),
            or(isNull(table.expiresAtMs), gt(table.expiresAtMs, nowMs))
          )
        )
        .orderBy(desc(table.generation))
        .limit(1)
        .get();
    },
    findCredential(credentialId) {
      return database
        .select()
        .from(table)
        .where(and(eq(table.agentId, agentId), eq(table.credentialId, credentialId)))
        .limit(1)
        .get();
    },
    findCredentialByGeneration(generation) {
      return database
        .select()
        .from(table)
        .where(and(eq(table.agentId, agentId), eq(table.generation, generation)))
        .limit(1)
        .get();
    },
    insertCredential(input) {
      database
        .insert(table)
        .values({
          agentId,
          createdAtMs: input.nowMs,
          credentialId: input.credentialId,
          expiresAtMs: input.expiresAtMs ?? null,
          generation: input.generation,
          notBeforeMs: input.notBeforeMs ?? null,
          publicFingerprint: input.publicFingerprint ?? null,
          revokedAtMs: input.revokedAtMs ?? null,
          secretReference: input.secretReference ?? null,
          status: input.status,
          updatedAtMs: input.nowMs,
          verifierRef: input.verifierRef ?? null,
        })
        .run();
    },
    listCredentials() {
      return database
        .select()
        .from(table)
        .where(eq(table.agentId, agentId))
        .orderBy(table.generation)
        .all();
    },
    updateCredentialStatus(input) {
      database
        .update(table)
        .set({
          expiresAtMs: input.expiresAtMs ?? null,
          revokedAtMs: input.revokedAtMs ?? null,
          status: input.status,
          updatedAtMs: input.nowMs,
        })
        .where(and(eq(table.agentId, agentId), eq(table.credentialId, input.credentialId)))
        .run();
    },
  };
}
