import 'server-only';

import { drizzle } from 'drizzle-orm/d1';
import { and, eq, ne } from 'drizzle-orm/sql/expressions/conditions';
import { asc, desc } from 'drizzle-orm/sql/expressions/select';

import { clientManagedAgentsTable, clientSigningKeysTable } from './schema';

import type { ClientSigningKeyStatus } from '../credentials/signing-keys';

/**
 * `client_signing_keys` table から Drizzle が推論する select row 型。
 *
 * @remarks
 * repository 内部だけで使い、public API へ raw Drizzle row を露出しない。
 * 平文 private JWK は envelope のまま扱い、復号は server-only credentials module で行う。
 */
type SigningKeyRow = typeof clientSigningKeysTable.$inferSelect;

/**
 * Client Service signing key record (private material は暗号化 envelope のまま保持)。
 *
 * @remarks
 * `privateJwkCiphertext` は `CLIENT_CREDENTIAL_ENCRYPTION_KEY` で暗号化した private JWK envelope 文字列。
 * 平文の秘密鍵、raw shared secret、JWT body は一切含まず、復号は server-only scope 内だけで行う。
 * browser へ渡す場合は `toBrowserSafeSigningKey` で private material と内部 envelope を除外する。
 */
export interface ClientSigningKeyRecord {
  readonly issuer: string;
  readonly keyId: string;
  readonly publicJwk: string;
  readonly publicFingerprint: string;
  readonly privateJwkCiphertext: string;
  readonly status: ClientSigningKeyStatus;
  readonly isDefault: boolean;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
  readonly lastUsedAtMs?: number;
}

/**
 * Client Service signing key を新規作成する入力。
 *
 * @remarks
 * 呼び出し元は `generateEd25519SigningKeyMaterial` で生成した暗号化済み private JWK をそのまま渡す。
 * repository は暗号化/復号を行わず、暗号化 envelope をそのまま保存する。
 */
export interface CreateSigningKeyInput {
  readonly issuer: string;
  readonly keyId: string;
  readonly publicJwk: string;
  readonly publicFingerprint: string;
  readonly privateJwkCiphertext: string;
}

/**
 * Client-owned signing key repository operations。
 *
 * @remarks
 * すべての method は `client_signing_keys` table を正本にし、失効・削除時だけ `client_managed_agents` の参照有無を確認する。
 * Agent domain snapshot、Agent runtime source、平文秘密鍵 plaintext は扱わない。`active` key だけが署名に使われる。
 */
export interface ClientSigningKeyRepository {
  readonly createSigningKey: (input: CreateSigningKeyInput) => Promise<ClientSigningKeyRecord>;
  readonly getSigningKey: (
    issuer: string,
    keyId: string
  ) => Promise<ClientSigningKeyRecord | undefined>;
  readonly getDefaultSigningKey: () => Promise<ClientSigningKeyRecord | undefined>;
  readonly getDefaultSigningKeyForIssuer: (
    issuer: string
  ) => Promise<ClientSigningKeyRecord | undefined>;
  readonly listSigningKeys: () => Promise<readonly ClientSigningKeyRecord[]>;
  readonly listSigningKeysByStatus: (
    status: ClientSigningKeyStatus
  ) => Promise<readonly ClientSigningKeyRecord[]>;
  readonly updateSigningKeyStatus: (
    issuer: string,
    keyId: string,
    status: ClientSigningKeyStatus
  ) => Promise<ClientSigningKeyRecord | undefined>;
  readonly setDefaultSigningKey: (
    issuer: string,
    keyId: string
  ) => Promise<ClientSigningKeyRecord | undefined>;
  readonly touchSigningKeyLastUsed: (issuer: string, keyId: string) => Promise<void>;
  readonly deleteSigningKey: (issuer: string, keyId: string) => Promise<void>;
}

/**
 * Drizzle ORM を使う Client Service signing key repository を作成する。
 *
 * @param d1 - Cloudflare Worker の `CLIENT_DB` D1 binding。
 * @returns `client_signing_keys` を操作し、失効時に managed Agent 参照を検査する `ClientSigningKeyRepository`。
 * @remarks
 * Drizzle D1 driver はこの server-only repository layer に閉じ込める。
 * raw Drizzle row は `ClientSigningKeyRecord` へ変換し、平文秘密鍵 plaintext は扱わない。
 */
export function createSigningKeyRepository(d1: D1Database): ClientSigningKeyRepository {
  const db = drizzle(d1, { schema: { clientManagedAgentsTable, clientSigningKeysTable } });
  return {
    createSigningKey(input) {
      return createSigningKey(db, input);
    },
    getSigningKey(issuer, keyId) {
      return getSigningKey(db, issuer, keyId);
    },
    getDefaultSigningKey() {
      return getDefaultSigningKey(db);
    },
    getDefaultSigningKeyForIssuer(issuer) {
      return getDefaultSigningKeyForIssuer(db, issuer);
    },
    listSigningKeys() {
      return listSigningKeys(db);
    },
    listSigningKeysByStatus(status) {
      return listSigningKeysByStatus(db, status);
    },
    updateSigningKeyStatus(issuer, keyId, status) {
      return updateSigningKeyStatus(db, issuer, keyId, status);
    },
    setDefaultSigningKey(issuer, keyId) {
      return setDefaultSigningKey(db, issuer, keyId);
    },
    touchSigningKeyLastUsed(issuer, keyId) {
      return touchSigningKeyLastUsed(db, issuer, keyId);
    },
    deleteSigningKey(issuer, keyId) {
      return deleteSigningKey(db, issuer, keyId);
    },
  };
}

type SigningKeyDb = ReturnType<
  typeof drizzle<{
    clientManagedAgentsTable: typeof clientManagedAgentsTable;
    clientSigningKeysTable: typeof clientSigningKeysTable;
  }>
>;

async function createSigningKey(
  db: SigningKeyDb,
  input: CreateSigningKeyInput
): Promise<ClientSigningKeyRecord> {
  assertCreateSigningKeyInput(input);
  const now = Date.now();
  await db
    .insert(clientSigningKeysTable)
    .values({
      issuer: input.issuer,
      keyId: input.keyId,
      publicJwk: input.publicJwk,
      publicFingerprint: input.publicFingerprint,
      privateJwkCiphertext: input.privateJwkCiphertext,
      status: 'active',
      isDefault: false,
      createdAtMs: now,
      updatedAtMs: now,
    })
    .run();
  const record = await getSigningKey(db, input.issuer, input.keyId);
  if (record === undefined) {
    throw new TypeError('Client signing key record was not persisted.');
  }
  return record;
}

async function getSigningKey(
  db: SigningKeyDb,
  issuer: string,
  keyId: string
): Promise<ClientSigningKeyRecord | undefined> {
  const rows = await db
    .select()
    .from(clientSigningKeysTable)
    .where(and(eq(clientSigningKeysTable.issuer, issuer), eq(clientSigningKeysTable.keyId, keyId)))
    .limit(1);
  return rows[0] === undefined ? undefined : toSigningKeyRecord(rows[0]);
}

async function getDefaultSigningKey(db: SigningKeyDb): Promise<ClientSigningKeyRecord | undefined> {
  const rows = await db
    .select()
    .from(clientSigningKeysTable)
    .where(eq(clientSigningKeysTable.isDefault, true))
    .orderBy(desc(clientSigningKeysTable.updatedAtMs))
    .limit(1);
  return rows[0] === undefined ? undefined : toSigningKeyRecord(rows[0]);
}

async function getDefaultSigningKeyForIssuer(
  db: SigningKeyDb,
  issuer: string
): Promise<ClientSigningKeyRecord | undefined> {
  const rows = await db
    .select()
    .from(clientSigningKeysTable)
    .where(
      and(eq(clientSigningKeysTable.issuer, issuer), eq(clientSigningKeysTable.isDefault, true))
    )
    .orderBy(desc(clientSigningKeysTable.updatedAtMs))
    .limit(1);
  return rows[0] === undefined ? undefined : toSigningKeyRecord(rows[0]);
}

async function listSigningKeys(db: SigningKeyDb): Promise<readonly ClientSigningKeyRecord[]> {
  const rows = await db
    .select()
    .from(clientSigningKeysTable)
    .orderBy(
      desc(clientSigningKeysTable.isDefault),
      asc(clientSigningKeysTable.issuer),
      asc(clientSigningKeysTable.keyId)
    );
  return rows.map(toSigningKeyRecord);
}

async function listSigningKeysByStatus(
  db: SigningKeyDb,
  status: ClientSigningKeyStatus
): Promise<readonly ClientSigningKeyRecord[]> {
  const rows = await db
    .select()
    .from(clientSigningKeysTable)
    .where(eq(clientSigningKeysTable.status, status))
    .orderBy(asc(clientSigningKeysTable.issuer), asc(clientSigningKeysTable.keyId));
  return rows.map(toSigningKeyRecord);
}

async function updateSigningKeyStatus(
  db: SigningKeyDb,
  issuer: string,
  keyId: string,
  status: ClientSigningKeyStatus
): Promise<ClientSigningKeyRecord | undefined> {
  assertSigningKeyTarget(issuer, keyId);
  const current = await getSigningKey(db, issuer, keyId);
  if (current === undefined) {
    return undefined;
  }
  if (current.status === 'deleted' && status !== 'deleted') {
    throw new TypeError('Deleted signing keys cannot be reactivated. Generate a new key instead.');
  }
  if (status !== 'active') {
    await assertSigningKeyCanBeInvalidated(db, current);
  }
  const now = Date.now();
  const set: Record<string, unknown> = { status, updatedAtMs: now };
  // 削除 tombstone: private material を復号不能な sentinel へ置換し、公開 tombstone metadata だけ残す。
  // trust config 上は revoked entry としてだけ参照できる。完全に行を消す場合は deleteSigningKey を使う。
  if (status === 'deleted') {
    set.privateJwkCiphertext = DELETED_KEY_TOMBSTONE;
    set.isDefault = false;
  } else if (status !== 'active') {
    set.isDefault = false;
  }
  await db
    .update(clientSigningKeysTable)
    .set(set)
    .where(and(eq(clientSigningKeysTable.issuer, issuer), eq(clientSigningKeysTable.keyId, keyId)))
    .run();
  return getSigningKey(db, issuer, keyId);
}

/**
 * `deleted` key の private JWK ciphertext を置き換える復号不能 tombstone。
 *
 * @remarks `parsePrivateJwkEnvelope` はこの文字列を malformed として拒否するため、
 * たとえ `CLIENT_CREDENTIAL_ENCRYPTION_KEY` があっても private JWK を復元できない。
 */
const DELETED_KEY_TOMBSTONE = '__client_signing_key_revoked_tombstone__';

async function setDefaultSigningKey(
  db: SigningKeyDb,
  issuer: string,
  keyId: string
): Promise<ClientSigningKeyRecord | undefined> {
  assertSigningKeyTarget(issuer, keyId);
  const now = Date.now();
  const target = await getSigningKey(db, issuer, keyId);
  if (target === undefined) {
    return undefined;
  }
  if (target.status !== 'active') {
    throw new TypeError('Only an active signing key can become the default.');
  }
  // 他の issuer 全体の既定鍵フラグを一度解除してから、対象を既定にする。
  await db
    .update(clientSigningKeysTable)
    .set({ isDefault: false, updatedAtMs: now })
    .where(ne(clientSigningKeysTable.keyId, ''))
    .run();
  await db
    .update(clientSigningKeysTable)
    .set({ isDefault: true, updatedAtMs: now })
    .where(and(eq(clientSigningKeysTable.issuer, issuer), eq(clientSigningKeysTable.keyId, keyId)))
    .run();
  return getSigningKey(db, issuer, keyId);
}

async function touchSigningKeyLastUsed(
  db: SigningKeyDb,
  issuer: string,
  keyId: string
): Promise<void> {
  assertSigningKeyTarget(issuer, keyId);
  const now = Date.now();
  await db
    .update(clientSigningKeysTable)
    .set({ lastUsedAtMs: now })
    .where(and(eq(clientSigningKeysTable.issuer, issuer), eq(clientSigningKeysTable.keyId, keyId)))
    .run();
}

async function deleteSigningKey(db: SigningKeyDb, issuer: string, keyId: string): Promise<void> {
  assertSigningKeyTarget(issuer, keyId);
  const current = await getSigningKey(db, issuer, keyId);
  if (current === undefined) {
    return;
  }
  await assertSigningKeyCanBeInvalidated(db, current);
  // 完全削除: private material を含め行全体を取り除く。tombstone を残す場合は
  // updateSigningKeyStatus('deleted') を使う。
  await db
    .delete(clientSigningKeysTable)
    .where(and(eq(clientSigningKeysTable.issuer, issuer), eq(clientSigningKeysTable.keyId, keyId)))
    .run();
}

async function assertSigningKeyCanBeInvalidated(
  db: SigningKeyDb,
  record: ClientSigningKeyRecord
): Promise<void> {
  if (record.isDefault) {
    throw new TypeError(
      'The default signing key cannot be disabled or deleted. Set another default key first.'
    );
  }
  const referencingAgents = await db
    .select({ agentId: clientManagedAgentsTable.agentId })
    .from(clientManagedAgentsTable)
    .where(
      and(
        eq(clientManagedAgentsTable.signingIssuer, record.issuer),
        eq(clientManagedAgentsTable.signingKeyId, record.keyId)
      )
    )
    .limit(1);
  if (referencingAgents[0] !== undefined) {
    throw new TypeError(
      'Signing keys assigned to managed Agents cannot be disabled or deleted. Unassign or rotate the Agent first.'
    );
  }
}

function toSigningKeyRecord(row: SigningKeyRow): ClientSigningKeyRecord {
  return {
    issuer: row.issuer,
    keyId: row.keyId,
    publicJwk: row.publicJwk,
    publicFingerprint: row.publicFingerprint,
    privateJwkCiphertext: row.privateJwkCiphertext,
    status: assertSigningKeyStatus(row.status),
    isDefault: row.isDefault,
    createdAtMs: row.createdAtMs,
    updatedAtMs: row.updatedAtMs,
    lastUsedAtMs: row.lastUsedAtMs ?? undefined,
  };
}

function assertSigningKeyStatus(value: string): ClientSigningKeyStatus {
  if (value === 'active' || value === 'disabled' || value === 'deleted') {
    return value;
  }
  throw new TypeError(`Unknown signing key status: ${value}`);
}

function assertSigningKeyTarget(issuer: string, keyId: string): void {
  if (issuer === '') {
    throw new TypeError('issuer must not be empty.');
  }
  if (keyId === '') {
    throw new TypeError('keyId must not be empty.');
  }
}

function assertCreateSigningKeyInput(input: CreateSigningKeyInput): void {
  if (input.issuer === '') {
    throw new TypeError('issuer must not be empty.');
  }
  if (input.keyId === '') {
    throw new TypeError('keyId must not be empty.');
  }
  if (input.publicJwk === '') {
    throw new TypeError('publicJwk must not be empty.');
  }
  if (input.publicFingerprint === '') {
    throw new TypeError('publicFingerprint must not be empty.');
  }
  if (input.privateJwkCiphertext === '') {
    throw new TypeError('privateJwkCiphertext must not be empty.');
  }
}
