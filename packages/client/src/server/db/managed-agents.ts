import { drizzle } from 'drizzle-orm/d1';
import { eq } from 'drizzle-orm/sql/expressions/conditions';
import { asc, desc } from 'drizzle-orm/sql/expressions/select';

import { clientManagedAgentsTable } from './schema';

/**
 * Inferred select row type for the managed agents table.
 */
type ManagedAgentRow = typeof clientManagedAgentsTable.$inferSelect;

/**
 * Client-owned managed Agent registry record.
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
 * Input for creating or updating a managed Agent registry record.
 */
export interface UpsertManagedAgentInput {
  readonly agentId: string;
  readonly agentRpcOrigin: string;
  readonly displayName: string;
  readonly displayOrder?: number;
}

/**
 * Input for renaming a managed Agent without changing order or pin state.
 */
export interface RenameManagedAgentInput {
  readonly agentId: string;
  readonly displayName: string;
}

/**
 * Ordered entry for bulk reorder operations.
 */
export interface ManagedAgentOrderEntry {
  readonly agentId: string;
  readonly displayOrder: number;
}

/**
 * Client-owned managed Agent repository operations.
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
 * Create a Client D1 repository for managed Agent records using Drizzle ORM.
 *
 * The Drizzle D1 driver is confined to this server-only repository layer.
 * Repository callers receive `ManagedAgentRecord` browser-safe types, never
 * raw Drizzle rows.
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
