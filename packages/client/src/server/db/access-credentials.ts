import { drizzle } from 'drizzle-orm/d1';
import { and, eq } from 'drizzle-orm/sql/expressions/conditions';
import { asc } from 'drizzle-orm/sql/expressions/select';

import { clientAgentCredentialRefsTable } from './schema';

/**
 * Inferred select row type for the credential references table.
 */
type CredentialReferenceRow = typeof clientAgentCredentialRefsTable.$inferSelect;

/**
 * Client-owned credential reference record without secret material.
 */
export interface CredentialReferenceRecord {
  readonly agentId: string;
  readonly credentialRef: string;
  readonly keyId: string;
  readonly publicFingerprint: string;
  readonly maskedHint: string;
  readonly status: string;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

/**
 * Input for creating or updating a credential reference.
 */
export interface UpsertCredentialReferenceInput {
  readonly agentId: string;
  readonly credentialRef: string;
  readonly keyId: string;
  readonly publicFingerprint: string;
  readonly maskedHint: string;
  readonly status: string;
}

/**
 * Client-owned credential reference repository operations.
 */
export interface CredentialReferenceRepository {
  readonly upsertCredentialReference: (
    input: UpsertCredentialReferenceInput
  ) => Promise<CredentialReferenceRecord>;
  readonly getCredentialReference: (
    agentId: string,
    credentialRef: string
  ) => Promise<CredentialReferenceRecord | undefined>;
  readonly listCredentialReferences: (
    agentId: string
  ) => Promise<readonly CredentialReferenceRecord[]>;
  readonly deleteCredentialReference: (agentId: string, credentialRef: string) => Promise<void>;
}

/**
 * Create a Client D1 repository for credential references using Drizzle ORM.
 *
 * The Drizzle D1 driver is confined to this server-only repository layer.
 * Repository callers receive `CredentialReferenceRecord` browser-safe types,
 * never raw Drizzle rows or secret material.
 */
export function createCredentialReferenceRepository(d1: D1Database): CredentialReferenceRepository {
  const db = drizzle(d1, { schema: { clientAgentCredentialRefsTable } });
  return {
    upsertCredentialReference(input) {
      return upsertCredentialReference(db, input);
    },
    getCredentialReference(agentId, credentialRef) {
      return getCredentialReference(db, agentId, credentialRef);
    },
    listCredentialReferences(agentId) {
      return listCredentialReferences(db, agentId);
    },
    deleteCredentialReference(agentId, credentialRef) {
      return deleteCredentialReference(db, agentId, credentialRef);
    },
  };
}

/**
 * Drizzle D1 database type bound to the credential refs schema.
 */
type CredentialRefDb = ReturnType<
  typeof drizzle<{ clientAgentCredentialRefsTable: typeof clientAgentCredentialRefsTable }>
>;

async function upsertCredentialReference(
  db: CredentialRefDb,
  input: UpsertCredentialReferenceInput
): Promise<CredentialReferenceRecord> {
  assertCredentialReferenceInput(input);
  const now = Date.now();
  await db
    .insert(clientAgentCredentialRefsTable)
    .values({
      agentId: input.agentId,
      credentialRef: input.credentialRef,
      keyId: input.keyId,
      publicFingerprint: input.publicFingerprint,
      maskedHint: input.maskedHint,
      status: input.status,
      createdAtMs: now,
      updatedAtMs: now,
    })
    .onConflictDoUpdate({
      target: [
        clientAgentCredentialRefsTable.agentId,
        clientAgentCredentialRefsTable.credentialRef,
      ],
      set: {
        keyId: input.keyId,
        publicFingerprint: input.publicFingerprint,
        maskedHint: input.maskedHint,
        status: input.status,
        updatedAtMs: now,
      },
    })
    .run();
  const record = await getCredentialReference(db, input.agentId, input.credentialRef);
  if (record === undefined) {
    throw new TypeError('credential reference was not persisted.');
  }
  return record;
}

async function getCredentialReference(
  db: CredentialRefDb,
  agentId: string,
  credentialRef: string
): Promise<CredentialReferenceRecord | undefined> {
  const rows = await db
    .select()
    .from(clientAgentCredentialRefsTable)
    .where(
      and(
        eq(clientAgentCredentialRefsTable.agentId, agentId),
        eq(clientAgentCredentialRefsTable.credentialRef, credentialRef)
      )
    )
    .limit(1);
  return rows[0] === undefined ? undefined : toCredentialReferenceRecord(rows[0]);
}

async function listCredentialReferences(
  db: CredentialRefDb,
  agentId: string
): Promise<readonly CredentialReferenceRecord[]> {
  const rows = await db
    .select()
    .from(clientAgentCredentialRefsTable)
    .where(eq(clientAgentCredentialRefsTable.agentId, agentId))
    .orderBy(asc(clientAgentCredentialRefsTable.credentialRef));
  return rows.map(toCredentialReferenceRecord);
}

async function deleteCredentialReference(
  db: CredentialRefDb,
  agentId: string,
  credentialRef: string
): Promise<void> {
  if (agentId === '') {
    throw new TypeError('agentId must not be empty.');
  }
  if (credentialRef === '') {
    throw new TypeError('credentialRef must not be empty.');
  }
  await db
    .delete(clientAgentCredentialRefsTable)
    .where(
      and(
        eq(clientAgentCredentialRefsTable.agentId, agentId),
        eq(clientAgentCredentialRefsTable.credentialRef, credentialRef)
      )
    )
    .run();
}

function toCredentialReferenceRecord(row: CredentialReferenceRow): CredentialReferenceRecord {
  return {
    agentId: row.agentId,
    credentialRef: row.credentialRef,
    keyId: row.keyId,
    publicFingerprint: row.publicFingerprint,
    maskedHint: row.maskedHint,
    status: row.status,
    createdAtMs: row.createdAtMs,
    updatedAtMs: row.updatedAtMs,
  };
}

function assertCredentialReferenceInput(input: UpsertCredentialReferenceInput): void {
  if (input.agentId === '') {
    throw new TypeError('agentId must not be empty.');
  }
  if (input.credentialRef === '') {
    throw new TypeError('credentialRef must not be empty.');
  }
  if (input.keyId === '') {
    throw new TypeError('keyId must not be empty.');
  }
}
