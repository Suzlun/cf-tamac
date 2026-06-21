interface CredentialReferenceRow {
  readonly agent_id: string;
  readonly credential_ref: string;
  readonly key_id: string;
  readonly public_fingerprint: string;
  readonly masked_hint: string;
  readonly status: string;
  readonly created_at_ms: number;
  readonly updated_at_ms: number;
}

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
}

/**
 * Create a Client D1 repository for credential references.
 */
export function createCredentialReferenceRepository(db: D1Database): CredentialReferenceRepository {
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
  };
}

async function upsertCredentialReference(
  db: D1Database,
  input: UpsertCredentialReferenceInput
): Promise<CredentialReferenceRecord> {
  assertCredentialReferenceInput(input);
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO client_agent_credential_refs (
        agent_id,
        credential_ref,
        key_id,
        public_fingerprint,
        masked_hint,
        status,
        created_at_ms,
        updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(agent_id, credential_ref) DO UPDATE SET
        key_id = excluded.key_id,
        public_fingerprint = excluded.public_fingerprint,
        masked_hint = excluded.masked_hint,
        status = excluded.status,
        updated_at_ms = excluded.updated_at_ms`
    )
    .bind(
      input.agentId,
      input.credentialRef,
      input.keyId,
      input.publicFingerprint,
      input.maskedHint,
      input.status,
      now,
      now
    )
    .run();
  const record = await getCredentialReference(db, input.agentId, input.credentialRef);
  if (record === undefined) {
    throw new TypeError('credential reference was not persisted.');
  }
  return record;
}

async function getCredentialReference(
  db: D1Database,
  agentId: string,
  credentialRef: string
): Promise<CredentialReferenceRecord | undefined> {
  const row = await db
    .prepare(
      `SELECT agent_id, credential_ref, key_id, public_fingerprint, masked_hint, status,
        created_at_ms, updated_at_ms
      FROM client_agent_credential_refs
      WHERE agent_id = ? AND credential_ref = ?`
    )
    .bind(agentId, credentialRef)
    .first<CredentialReferenceRow>();
  return row === null ? undefined : toCredentialReferenceRecord(row);
}

async function listCredentialReferences(
  db: D1Database,
  agentId: string
): Promise<readonly CredentialReferenceRecord[]> {
  const result = await db
    .prepare(
      `SELECT agent_id, credential_ref, key_id, public_fingerprint, masked_hint, status,
        created_at_ms, updated_at_ms
      FROM client_agent_credential_refs
      WHERE agent_id = ?
      ORDER BY credential_ref ASC`
    )
    .bind(agentId)
    .all<CredentialReferenceRow>();
  return result.results.map(toCredentialReferenceRecord);
}

function toCredentialReferenceRecord(row: CredentialReferenceRow): CredentialReferenceRecord {
  return {
    agentId: row.agent_id,
    credentialRef: row.credential_ref,
    keyId: row.key_id,
    publicFingerprint: row.public_fingerprint,
    maskedHint: row.masked_hint,
    status: row.status,
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
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
