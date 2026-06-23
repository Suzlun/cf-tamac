import { and, asc, eq, gt, like } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from './schema';

import type { AgentStorageDatabase } from './database';

/**
 * Row stored for an Agent-local Thread identity.
 */
export interface AgentThreadRow {
  readonly threadId: string;
  readonly threadKey: string;
  readonly normalizedThreadKey: string;
  readonly status: string;
  readonly currentSectionId: string | null;
  readonly priority: number;
  readonly lastServedAtMs: number | null;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

/**
 * Input for inserting an Agent-local Thread identity.
 */
export interface InsertAgentThreadInput {
  readonly threadId: string;
  readonly threadKey: string;
  readonly normalizedThreadKey: string;
  readonly status?: string;
  readonly currentSectionId?: string;
  readonly priority?: number;
  readonly nowMs: number;
}

/**
 * Input for updating current Thread section metadata.
 */
export interface UpdateAgentThreadSectionInput {
  readonly threadId: string;
  readonly currentSectionId: string;
  readonly nowMs: number;
}

/**
 * Input for recording scheduler service time on a Thread.
 */
export interface MarkAgentThreadServedInput {
  readonly nowMs: number;
  readonly threadId: string;
}

/**
 * Repository for Agent-local Thread identity records.
 */
export interface AgentThreadsRepository {
  readonly tableName: 'agent_threads';
  findByThreadId(threadId: string): AgentThreadRow | undefined;
  findByNormalizedThreadKey(normalizedThreadKey: string): AgentThreadRow | undefined;
  insertThread(input: InsertAgentThreadInput): void;
  listThreads(input: {
    readonly afterCreatedAtMs?: number;
    readonly limit: number;
    readonly normalizedThreadKeyPrefix?: string;
    readonly status?: string;
  }): AgentThreadRow[];
  markThreadServed(input: MarkAgentThreadServedInput): void;
  updateCurrentSection(input: UpdateAgentThreadSectionInput): void;
}

/**
 * Create a repository for Agent-local Thread identity records.
 */
export function createAgentThreadsRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentThreadsRepository {
  const table = agentStorageDrizzleSchema.agentThreads;
  return {
    tableName: 'agent_threads',
    findByThreadId(threadId) {
      return database
        .select()
        .from(table)
        .where(and(eq(table.agentId, agentId), eq(table.threadId, threadId)))
        .limit(1)
        .get();
    },
    findByNormalizedThreadKey(normalizedThreadKey) {
      return database
        .select()
        .from(table)
        .where(and(eq(table.agentId, agentId), eq(table.normalizedThreadKey, normalizedThreadKey)))
        .limit(1)
        .get();
    },
    insertThread(input) {
      database
        .insert(table)
        .values({
          agentId,
          createdAtMs: input.nowMs,
          currentSectionId: input.currentSectionId ?? null,
          lastServedAtMs: null,
          normalizedThreadKey: input.normalizedThreadKey,
          priority: input.priority ?? 0,
          status: input.status ?? 'active',
          threadId: input.threadId,
          threadKey: input.threadKey,
          updatedAtMs: input.nowMs,
        })
        .run();
    },
    listThreads(input) {
      const afterCreatedAtMs = input.afterCreatedAtMs ?? -1;
      return database
        .select()
        .from(table)
        .where(
          and(
            eq(table.agentId, agentId),
            gt(table.createdAtMs, afterCreatedAtMs),
            input.status === undefined ? undefined : eq(table.status, input.status),
            input.normalizedThreadKeyPrefix === undefined
              ? undefined
              : like(table.normalizedThreadKey, `${input.normalizedThreadKeyPrefix}%`)
          )
        )
        .orderBy(asc(table.createdAtMs), asc(table.threadId))
        .limit(input.limit)
        .all();
    },
    markThreadServed(input) {
      database
        .update(table)
        .set({ lastServedAtMs: input.nowMs, updatedAtMs: input.nowMs })
        .where(and(eq(table.agentId, agentId), eq(table.threadId, input.threadId)))
        .run();
    },
    updateCurrentSection(input) {
      database
        .update(table)
        .set({ currentSectionId: input.currentSectionId, updatedAtMs: input.nowMs })
        .where(and(eq(table.agentId, agentId), eq(table.threadId, input.threadId)))
        .run();
    },
  };
}
