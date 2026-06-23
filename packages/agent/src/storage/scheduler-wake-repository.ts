import { eq } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from './schema';

import type { AgentStorageDatabase } from './database';

/**
 * Scheduler wake status stored by the Agent-local Queue foundation.
 */
export type AgentSchedulerWakeStatus = 'idle' | 'pending' | 'running';

/**
 * Row stored for scheduler wake coalescing.
 */
export interface AgentSchedulerWakeStateRow {
  readonly wakeStatus: AgentSchedulerWakeStatus;
  readonly pendingCount: number;
}

/**
 * Result of recording a scheduler wake intent.
 */
export interface AgentSchedulerWakeIntent {
  readonly wakeStatus: 'pending' | 'running';
  readonly coalesced: boolean;
  readonly pendingCount: number;
}

/**
 * Repository for Agent-local Queue scheduler wake coalescing state.
 */
export interface AgentSchedulerWakeRepository {
  readonly tableName: 'agent_scheduler_wake_state';
  markIdle(nowMs: number): void;
  markPending(nowMs: number, pendingCount: number): void;
  markRunning(nowMs: number): void;
  readWakeState(): AgentSchedulerWakeStateRow | undefined;
  recordWake(nowMs: number): AgentSchedulerWakeIntent;
}

/**
 * Create a repository for Agent-local Queue scheduler wake coalescing state.
 */
export function createAgentSchedulerWakeRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentSchedulerWakeRepository {
  const table = agentStorageDrizzleSchema.agentSchedulerWakeState;
  return {
    tableName: 'agent_scheduler_wake_state',
    markIdle(nowMs) {
      upsertWakeState(agentId, database, 'idle', 0, nowMs);
    },
    markPending(nowMs, pendingCount) {
      upsertWakeState(agentId, database, 'pending', pendingCount, nowMs);
    },
    markRunning(nowMs) {
      const current = this.readWakeState();
      upsertWakeState(agentId, database, 'running', current?.pendingCount ?? 0, nowMs);
    },
    readWakeState() {
      return database
        .select({ pendingCount: table.pendingCount, wakeStatus: table.wakeStatus })
        .from(table)
        .where(eq(table.agentId, agentId))
        .limit(1)
        .get();
    },
    recordWake(nowMs) {
      const current = this.readWakeState();
      if (current === undefined || current.wakeStatus === 'idle') {
        upsertWakeState(agentId, database, 'pending', 1, nowMs);
        return { wakeStatus: 'pending', coalesced: false, pendingCount: 1 };
      }
      const pendingCount = current.pendingCount + 1;
      upsertWakeState(agentId, database, current.wakeStatus, pendingCount, nowMs);
      return { wakeStatus: current.wakeStatus, coalesced: true, pendingCount };
    },
  };
}

function upsertWakeState(
  agentId: string,
  database: AgentStorageDatabase,
  wakeStatus: AgentSchedulerWakeStatus,
  pendingCount: number,
  nowMs: number
): void {
  const table = agentStorageDrizzleSchema.agentSchedulerWakeState;
  const existing = database
    .select({ agentId: table.agentId })
    .from(table)
    .where(eq(table.agentId, agentId))
    .limit(1)
    .get();
  if (existing === undefined) {
    database.insert(table).values({ agentId, pendingCount, updatedAtMs: nowMs, wakeStatus }).run();
    return;
  }
  database
    .update(table)
    .set({ pendingCount, updatedAtMs: nowMs, wakeStatus })
    .where(eq(table.agentId, agentId))
    .run();
}
