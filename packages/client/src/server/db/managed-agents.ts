import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm/sql/expressions/conditions';
import { asc, desc } from 'drizzle-orm/sql/expressions/select';

import { clientManagedAgentsTable } from './schema';

/**
 * managed agents table から Drizzle が推論する select row 型です。
 *
 * @remarks
 * repository 内部だけで使い、public API には raw Drizzle row を露出しません。Client D1 schema と TypeScript record 変換の境界を明確にします。
 */
type ManagedAgentRow = typeof clientManagedAgentsTable.$inferSelect;

/**
 * Client-owned managed Agent registry record です。
 *
 * @remarks
 * Client D1 の `client_managed_agents` table だけから作られる表示 metadata です。Agent Worker の authoritative domain state、
 * credential secret、Agent domain snapshot は含みません。`lastOpenedAtMs` は未閲覧の場合 `undefined` になります。
 *
 * @example
 * ```ts
 * const record: ManagedAgentRecord = {
 *   agentId: 'agent-alpha',
 *   agentRpcOrigin: 'https://agent.example.com',
 *   displayName: 'Agent Alpha',
 *   displayOrder: 0,
 *   pinned: false,
 *   createdAtMs: Date.now(),
 *   updatedAtMs: Date.now(),
 * };
 * ```
 */
export interface ManagedAgentRecord {
  readonly agentId: string;
  readonly agentRpcOrigin: string;
  readonly displayName: string;
  readonly displayOrder: number;
  readonly pinned: boolean;
  readonly lastOpenedAtMs?: number;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

/**
 * managed Agent registry record を作成または更新する入力です。
 *
 * @remarks
 * `displayOrder` は省略時に `0` として扱います。入力は Client-owned 台帳 metadata に限定され、Agent RPC credential や
 * Agent domain snapshot は repository に渡しません。
 */
export interface UpsertManagedAgentInput {
  readonly agentId: string;
  readonly agentRpcOrigin: string;
  readonly displayName: string;
  readonly displayOrder?: number;
}

/**
 * managed Agent の表示名だけを変更する入力です。
 *
 * @remarks
 * rename は `displayName` と `updatedAtMs` だけを変更します。表示順、pin 状態、Agent Worker domain state には副作用を与えません。
 */
export interface RenameManagedAgentInput {
  readonly agentId: string;
  readonly displayName: string;
}

/**
 * bulk reorder operation の 1 行分を表す入力です。
 *
 * @remarks
 * `agentId` と `displayOrder` のみを持ちます。Client UI の並び順 metadata を更新するための値で、Agent Service には送信しません。
 */
export interface ManagedAgentOrderEntry {
  readonly agentId: string;
  readonly displayOrder: number;
}

/**
 * Client-owned managed Agent repository operations です。
 *
 * @remarks
 * すべての method は Drizzle D1 adapter を server-only repository layer に閉じ込め、caller には `ManagedAgentRecord` だけを返します。
 * Agent domain snapshot table を扱わず、`client_managed_agents` table だけを読み書きします。
 *
 * @example
 * ```ts
 * const repo = createManagedAgentRepository(env.CLIENT_DB);
 * const agents = await repo.listManagedAgents();
 * ```
 */
export interface ManagedAgentRepository {
  readonly createManagedAgent: (input: UpsertManagedAgentInput) => Promise<ManagedAgentRecord>;
  readonly upsertManagedAgent: (input: UpsertManagedAgentInput) => Promise<ManagedAgentRecord>;
  readonly getManagedAgent: (agentId: string) => Promise<ManagedAgentRecord | undefined>;
  readonly listManagedAgents: () => Promise<readonly ManagedAgentRecord[]>;
  readonly markManagedAgentOpened: (agentId: string) => Promise<ManagedAgentRecord | undefined>;
  readonly renameManagedAgent: (
    input: RenameManagedAgentInput
  ) => Promise<ManagedAgentRecord | undefined>;
  readonly setManagedAgentPinned: (
    agentId: string,
    pinned: boolean
  ) => Promise<ManagedAgentRecord | undefined>;
  readonly reorderManagedAgents: (
    entries: readonly ManagedAgentOrderEntry[]
  ) => Promise<readonly ManagedAgentRecord[]>;
  readonly deleteManagedAgent: (agentId: string) => Promise<void>;
}

/**
 * Drizzle ORM を使う managed Agent records 用 Client D1 repository を作成します。
 *
 * @param d1 - Cloudflare Worker の `CLIENT_DB` D1 binding です。
 * @returns `client_managed_agents` table だけを操作する `ManagedAgentRepository` を返します。
 * @throws repository 作成時には通常 error を投げませんが、返された method の実行時に D1/validation error が発生し得ます。
 * @remarks
 * Drizzle D1 driver はこの server-only repository layer に閉じ込めます。caller には raw row を返さず、browser-safe な
 * `ManagedAgentRecord` へ変換します。Agent domain snapshot や credential secret を model/query しません。
 */
export function createManagedAgentRepository(d1: D1Database): ManagedAgentRepository {
  const db = drizzle(d1, { schema: { clientManagedAgentsTable } });
  return {
    createManagedAgent(input) {
      return createManagedAgent(db, input);
    },
    upsertManagedAgent(input) {
      return upsertManagedAgent(db, input);
    },
    getManagedAgent(agentId) {
      return getManagedAgent(db, agentId);
    },
    listManagedAgents() {
      return listManagedAgents(db);
    },
    markManagedAgentOpened(agentId) {
      return markManagedAgentOpened(db, agentId);
    },
    renameManagedAgent(input) {
      return renameManagedAgent(db, input);
    },
    setManagedAgentPinned(agentId, pinned) {
      return setManagedAgentPinned(db, agentId, pinned);
    },
    reorderManagedAgents(entries) {
      return reorderManagedAgents(db, entries);
    },
    deleteManagedAgent(agentId) {
      return deleteManagedAgent(db, agentId);
    },
  };
}

/**
 * Drizzle D1 database type bound to the managed agents schema.
 */
type ManagedAgentDb = ReturnType<
  typeof drizzle<{ clientManagedAgentsTable: typeof clientManagedAgentsTable }>
>;

async function createManagedAgent(
  db: ManagedAgentDb,
  input: UpsertManagedAgentInput
): Promise<ManagedAgentRecord> {
  assertManagedAgentInput(input);
  const now = Date.now();
  await db
    .insert(clientManagedAgentsTable)
    .values({
      agentId: input.agentId,
      agentRpcOrigin: input.agentRpcOrigin,
      displayName: input.displayName,
      displayOrder: input.displayOrder ?? 0,
      pinned: false,
      createdAtMs: now,
      updatedAtMs: now,
    })
    .run();
  const record = await getManagedAgent(db, input.agentId);
  if (record === undefined) {
    throw new TypeError('managed Agent record was not persisted.');
  }
  return record;
}

async function upsertManagedAgent(
  db: ManagedAgentDb,
  input: UpsertManagedAgentInput
): Promise<ManagedAgentRecord> {
  assertManagedAgentInput(input);
  const now = Date.now();
  await db
    .insert(clientManagedAgentsTable)
    .values({
      agentId: input.agentId,
      agentRpcOrigin: input.agentRpcOrigin,
      displayName: input.displayName,
      displayOrder: input.displayOrder ?? 0,
      pinned: false,
      createdAtMs: now,
      updatedAtMs: now,
    })
    .onConflictDoUpdate({
      target: clientManagedAgentsTable.agentId,
      set: {
        agentRpcOrigin: input.agentRpcOrigin,
        displayName: input.displayName,
        displayOrder: input.displayOrder ?? 0,
        updatedAtMs: now,
      },
    })
    .run();
  const record = await getManagedAgent(db, input.agentId);
  if (record === undefined) {
    throw new TypeError('managed Agent record was not persisted.');
  }
  return record;
}

async function getManagedAgent(
  db: ManagedAgentDb,
  agentId: string
): Promise<ManagedAgentRecord | undefined> {
  const rows = await db
    .select()
    .from(clientManagedAgentsTable)
    .where(eq(clientManagedAgentsTable.agentId, agentId))
    .limit(1);
  return rows[0] === undefined ? undefined : toManagedAgentRecord(rows[0]);
}

async function listManagedAgents(db: ManagedAgentDb): Promise<readonly ManagedAgentRecord[]> {
  const rows = await db
    .select()
    .from(clientManagedAgentsTable)
    .orderBy(
      desc(clientManagedAgentsTable.pinned),
      asc(clientManagedAgentsTable.displayOrder),
      desc(clientManagedAgentsTable.lastOpenedAtMs),
      asc(clientManagedAgentsTable.displayName)
    );
  return rows.map(toManagedAgentRecord);
}

async function markManagedAgentOpened(
  db: ManagedAgentDb,
  agentId: string
): Promise<ManagedAgentRecord | undefined> {
  const now = Date.now();
  await db
    .update(clientManagedAgentsTable)
    .set({ lastOpenedAtMs: now, updatedAtMs: now })
    .where(eq(clientManagedAgentsTable.agentId, agentId))
    .run();
  return getManagedAgent(db, agentId);
}

async function renameManagedAgent(
  db: ManagedAgentDb,
  input: RenameManagedAgentInput
): Promise<ManagedAgentRecord | undefined> {
  if (input.agentId === '') {
    throw new TypeError('agentId must not be empty.');
  }
  if (input.displayName === '') {
    throw new TypeError('displayName must not be empty.');
  }
  const now = Date.now();
  await db
    .update(clientManagedAgentsTable)
    .set({ displayName: input.displayName, updatedAtMs: now })
    .where(eq(clientManagedAgentsTable.agentId, input.agentId))
    .run();
  return getManagedAgent(db, input.agentId);
}

async function setManagedAgentPinned(
  db: ManagedAgentDb,
  agentId: string,
  pinned: boolean
): Promise<ManagedAgentRecord | undefined> {
  const now = Date.now();
  await db
    .update(clientManagedAgentsTable)
    .set({ pinned, updatedAtMs: now })
    .where(eq(clientManagedAgentsTable.agentId, agentId))
    .run();
  return getManagedAgent(db, agentId);
}

async function reorderManagedAgents(
  db: ManagedAgentDb,
  entries: readonly ManagedAgentOrderEntry[]
): Promise<readonly ManagedAgentRecord[]> {
  if (entries.length === 0) {
    return listManagedAgents(db);
  }
  const now = Date.now();
  for (const entry of entries) {
    if (entry.agentId === '') {
      throw new TypeError('agentId must not be empty.');
    }
    await db
      .update(clientManagedAgentsTable)
      .set({ displayOrder: entry.displayOrder, updatedAtMs: now })
      .where(eq(clientManagedAgentsTable.agentId, entry.agentId))
      .run();
  }
  return listManagedAgents(db);
}

async function deleteManagedAgent(db: ManagedAgentDb, agentId: string): Promise<void> {
  if (agentId === '') {
    throw new TypeError('agentId must not be empty.');
  }
  await db
    .delete(clientManagedAgentsTable)
    .where(eq(clientManagedAgentsTable.agentId, agentId))
    .run();
}

function toManagedAgentRecord(row: ManagedAgentRow): ManagedAgentRecord {
  return {
    agentId: row.agentId,
    agentRpcOrigin: row.agentRpcOrigin,
    displayName: row.displayName,
    displayOrder: row.displayOrder,
    pinned: row.pinned,
    lastOpenedAtMs: row.lastOpenedAtMs ?? undefined,
    createdAtMs: row.createdAtMs,
    updatedAtMs: row.updatedAtMs,
  };
}

function assertManagedAgentInput(input: UpsertManagedAgentInput): void {
  if (input.agentId === '') {
    throw new TypeError('agentId must not be empty.');
  }
  if (input.agentRpcOrigin === '') {
    throw new TypeError('agentRpcOrigin must not be empty.');
  }
  if (input.displayName === '') {
    throw new TypeError('displayName must not be empty.');
  }
}
