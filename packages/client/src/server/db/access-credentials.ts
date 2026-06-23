import { drizzle } from 'drizzle-orm/d1';
import { and, eq } from 'drizzle-orm/sql/expressions/conditions';
import { asc } from 'drizzle-orm/sql/expressions/select';

import { clientAgentCredentialRefsTable } from './schema';

/**
 * credential references table から Drizzle が推論する select row 型です。
 *
 * @remarks
 * repository 内部だけで使い、public API へ raw Drizzle row を露出しません。browser-safe 変換の前段として schema 境界を固定します。
 */
type CredentialReferenceRow = typeof clientAgentCredentialRefsTable.$inferSelect;

/**
 * secret material を含まない Client-owned credential reference record です。
 *
 * @remarks
 * Client D1 の `client_agent_credential_refs` table から作られる credential lookup metadata です。`credentialRef` は
 * server-side secret 解決用の reference であり、Browser に返す型へ変換するときは除外します。private key、raw shared secret、
 * Provider secret は保持しません。
 *
 * @example
 * ```ts
 * const record: CredentialReferenceRecord = {
 *   agentId: 'agent-alpha',
 *   credentialRef: 'wrangler-secret:agent-alpha',
 *   keyId: 'key-2026-06',
 *   publicFingerprint: 'sha256:abc123',
 *   maskedHint: 'ed25519:ab…12',
 *   status: 'active',
 *   createdAtMs: Date.now(),
 *   updatedAtMs: Date.now(),
 * };
 * ```
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
 * credential reference を作成または更新する入力です。
 *
 * @remarks
 * secret 本体ではなく lookup reference と operator 向け metadata だけを受け取ります。`agentId` と `credentialRef` の組で upsert し、
 * 平文 secret や raw JWT 署名 material は D1 に保存しません。
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
 * Client-owned credential reference repository operations です。
 *
 * @remarks
 * すべての method は `client_agent_credential_refs` table だけを扱います。Agent domain snapshot table、Agent runtime source、
 * secret material は扱いません。Browser へ返す場合は caller が `toBrowserSafeCredentialReference` で lookup fields を除外します。
 *
 * @example
 * ```ts
 * const repo = createCredentialReferenceRepository(env.CLIENT_DB);
 * const refs = await repo.listCredentialReferences('agent-alpha');
 * ```
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
 * Drizzle ORM を使う credential references 用 Client D1 repository を作成します。
 *
 * @param d1 - Cloudflare Worker の `CLIENT_DB` D1 binding です。
 * @returns `client_agent_credential_refs` table だけを操作する `CredentialReferenceRepository` を返します。
 * @throws repository 作成時には通常 error を投げませんが、返された method の実行時に D1/validation error が発生し得ます。
 * @remarks
 * Drizzle D1 driver はこの server-only repository layer に閉じ込めます。raw Drizzle row は `CredentialReferenceRecord` へ変換し、
 * secret material は model/query しません。
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
