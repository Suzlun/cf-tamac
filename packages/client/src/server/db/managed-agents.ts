interface ManagedAgentRow {
  readonly agent_id: string;
  readonly agent_rpc_origin: string;
  readonly display_name: string;
  readonly display_order: number;
  readonly last_opened_at_ms: number | null;
  readonly created_at_ms: number;
  readonly updated_at_ms: number;
}

/**
 * Client-owned managed Agent registry record.
 */
export interface ManagedAgentRecord {
  readonly agentId: string;
  readonly agentRpcOrigin: string;
  readonly displayName: string;
  readonly displayOrder: number;
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
 * Client-owned managed Agent repository operations.
 */
export interface ManagedAgentRepository {
  readonly upsertManagedAgent: (input: UpsertManagedAgentInput) => Promise<ManagedAgentRecord>;
  readonly getManagedAgent: (agentId: string) => Promise<ManagedAgentRecord | undefined>;
  readonly listManagedAgents: () => Promise<readonly ManagedAgentRecord[]>;
  readonly markManagedAgentOpened: (agentId: string) => Promise<ManagedAgentRecord | undefined>;
}

/**
 * Create a Client D1 repository for managed Agent records.
 */
export function createManagedAgentRepository(db: D1Database): ManagedAgentRepository {
  return {
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
  };
}

async function upsertManagedAgent(
  db: D1Database,
  input: UpsertManagedAgentInput
): Promise<ManagedAgentRecord> {
  assertManagedAgentInput(input);
  const now = Date.now();
  await db
    .prepare(
      `INSERT INTO client_managed_agents (
        agent_id,
        agent_rpc_origin,
        display_name,
        display_order,
        created_at_ms,
        updated_at_ms
      ) VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(agent_id) DO UPDATE SET
        agent_rpc_origin = excluded.agent_rpc_origin,
        display_name = excluded.display_name,
        display_order = excluded.display_order,
        updated_at_ms = excluded.updated_at_ms`
    )
    .bind(input.agentId, input.agentRpcOrigin, input.displayName, input.displayOrder ?? 0, now, now)
    .run();
  const record = await getManagedAgent(db, input.agentId);
  if (record === undefined) {
    throw new TypeError('managed Agent record was not persisted.');
  }
  return record;
}

async function getManagedAgent(
  db: D1Database,
  agentId: string
): Promise<ManagedAgentRecord | undefined> {
  const row = await db
    .prepare(
      `SELECT agent_id, agent_rpc_origin, display_name, display_order, last_opened_at_ms,
        created_at_ms, updated_at_ms
      FROM client_managed_agents
      WHERE agent_id = ?`
    )
    .bind(agentId)
    .first<ManagedAgentRow>();
  return row === null ? undefined : toManagedAgentRecord(row);
}

async function listManagedAgents(db: D1Database): Promise<readonly ManagedAgentRecord[]> {
  const result = await db
    .prepare(
      `SELECT agent_id, agent_rpc_origin, display_name, display_order, last_opened_at_ms,
        created_at_ms, updated_at_ms
      FROM client_managed_agents
      ORDER BY display_order ASC, display_name ASC`
    )
    .all<ManagedAgentRow>();
  return result.results.map(toManagedAgentRecord);
}

async function markManagedAgentOpened(
  db: D1Database,
  agentId: string
): Promise<ManagedAgentRecord | undefined> {
  const now = Date.now();
  await db
    .prepare(
      `UPDATE client_managed_agents
      SET last_opened_at_ms = ?, updated_at_ms = ?
      WHERE agent_id = ?`
    )
    .bind(now, now, agentId)
    .run();
  return getManagedAgent(db, agentId);
}

function toManagedAgentRecord(row: ManagedAgentRow): ManagedAgentRecord {
  return {
    agentId: row.agent_id,
    agentRpcOrigin: row.agent_rpc_origin,
    displayName: row.display_name,
    displayOrder: row.display_order,
    lastOpenedAtMs: row.last_opened_at_ms ?? undefined,
    createdAtMs: row.created_at_ms,
    updatedAtMs: row.updated_at_ms,
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
