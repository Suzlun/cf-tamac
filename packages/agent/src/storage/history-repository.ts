import { and, asc, eq, gt, gte, like, lte, or } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from './schema';

import type { AgentStorageDatabase } from './database';

/**
 * Row stored for a ThreadHistory search index entry.
 */
export interface AgentHistoryIndexRow {
  readonly bodyByteSize: number | null;
  readonly bodyContentType: string | null;
  readonly bodyRef: string | null;
  readonly bodySha256: string | null;
  readonly bodyStorageClass: string | null;
  readonly compactionId: string | null;
  readonly createdAtMs: number;
  readonly endThreadSequence: number;
  readonly historyId: string;
  readonly historyRef: string;
  readonly provenanceRef: string | null;
  readonly queryText: string | null;
  readonly retentionStatus: string;
  readonly sectionId: string | null;
  readonly startThreadSequence: number;
  readonly summary: string | null;
  readonly threadId: string;
}

/**
 * Input used to write a ThreadHistory index entry.
 */
export interface InsertAgentHistoryIndexInput {
  readonly bodyByteSize?: number;
  readonly bodyContentType?: string;
  readonly bodyRef?: string;
  readonly bodySha256?: string;
  readonly bodyStorageClass?: string;
  readonly compactionId?: string;
  readonly createdAtMs: number;
  readonly endThreadSequence: number;
  readonly historyId: string;
  readonly historyRef: string;
  readonly provenanceRef?: string;
  readonly queryText?: string;
  readonly retentionStatus?: string;
  readonly sectionId?: string;
  readonly startThreadSequence: number;
  readonly summary?: string;
  readonly threadId: string;
}

/**
 * Input used to search ThreadHistory index rows.
 */
export interface SearchAgentHistoryIndexesInput {
  readonly afterCreatedAtMs?: number;
  readonly afterHistoryId?: string;
  readonly compactionId?: string;
  /** History index の created_at_ms 上限です。 */
  readonly endCreatedAtMs?: number;
  readonly endThreadSequence?: number;
  readonly limit: number;
  readonly provenanceContains?: string;
  readonly query?: string;
  readonly sectionId?: string;
  /** History index の created_at_ms 下限です。 */
  readonly startCreatedAtMs?: number;
  readonly startThreadSequence?: number;
  readonly threadId: string;
}

/**
 * Repository for ThreadHistory index and R2 body metadata rows.
 */
export interface AgentHistoryRepository {
  readonly tableName: 'agent_history_indexes';
  findByHistoryId(historyId: string): AgentHistoryIndexRow | undefined;
  insertHistoryIndex(input: InsertAgentHistoryIndexInput): AgentHistoryIndexRow;
  listForCompaction(compactionId: string): AgentHistoryIndexRow[];
  searchHistoryIndexes(input: SearchAgentHistoryIndexesInput): AgentHistoryIndexRow[];
}

/**
 * Create a repository for ThreadHistory index and R2 body metadata rows.
 */
export function createAgentHistoryRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentHistoryRepository {
  return {
    tableName: 'agent_history_indexes',
    findByHistoryId: (historyId) => findByHistoryId(agentId, database, historyId),
    insertHistoryIndex: (input) => insertHistoryIndex(agentId, database, input),
    listForCompaction: (compactionId) => listForCompaction(agentId, database, compactionId),
    searchHistoryIndexes: (input) => searchHistoryIndexes(agentId, database, input),
  };
}

function findByHistoryId(
  agentId: string,
  database: AgentStorageDatabase,
  historyId: string
): AgentHistoryIndexRow | undefined {
  const table = agentStorageDrizzleSchema.agentHistoryIndexes;
  return database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.historyId, historyId)))
    .limit(1)
    .get();
}

function insertHistoryIndex(
  agentId: string,
  database: AgentStorageDatabase,
  input: InsertAgentHistoryIndexInput
): AgentHistoryIndexRow {
  const table = agentStorageDrizzleSchema.agentHistoryIndexes;
  database
    .insert(table)
    .values({
      agentId,
      bodyByteSize: input.bodyByteSize ?? null,
      bodyContentType: input.bodyContentType ?? null,
      bodyRef: input.bodyRef ?? null,
      bodySha256: input.bodySha256 ?? null,
      bodyStorageClass: input.bodyStorageClass ?? null,
      compactionId: input.compactionId ?? null,
      createdAtMs: input.createdAtMs,
      endThreadSequence: input.endThreadSequence,
      historyId: input.historyId,
      historyRef: input.historyRef,
      provenanceRef: input.provenanceRef ?? null,
      queryText: input.queryText ?? null,
      retentionStatus: input.retentionStatus ?? 'active',
      sectionId: input.sectionId ?? null,
      startThreadSequence: input.startThreadSequence,
      summary: input.summary ?? null,
      threadId: input.threadId,
    })
    .run();
  return readHistoryIndex(agentId, database, input.historyId);
}

function listForCompaction(
  agentId: string,
  database: AgentStorageDatabase,
  compactionId: string
): AgentHistoryIndexRow[] {
  const table = agentStorageDrizzleSchema.agentHistoryIndexes;
  return database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.compactionId, compactionId)))
    .orderBy(asc(table.createdAtMs), asc(table.historyId))
    .all();
}

function searchHistoryIndexes(
  agentId: string,
  database: AgentStorageDatabase,
  input: SearchAgentHistoryIndexesInput
): AgentHistoryIndexRow[] {
  const table = agentStorageDrizzleSchema.agentHistoryIndexes;
  return database
    .select()
    .from(table)
    .where(
      and(
        eq(table.agentId, agentId),
        eq(table.threadId, input.threadId),
        createHistoryCursorCondition(input),
        input.compactionId === undefined ? undefined : eq(table.compactionId, input.compactionId),
        input.sectionId === undefined ? undefined : eq(table.sectionId, input.sectionId),
        input.startCreatedAtMs === undefined
          ? undefined
          : gte(table.createdAtMs, input.startCreatedAtMs),
        input.endCreatedAtMs === undefined
          ? undefined
          : lte(table.createdAtMs, input.endCreatedAtMs),
        input.startThreadSequence === undefined
          ? undefined
          : gte(table.endThreadSequence, input.startThreadSequence),
        input.endThreadSequence === undefined
          ? undefined
          : lte(table.startThreadSequence, input.endThreadSequence),
        createQueryContainsCondition(input.query),
        createProvenanceContainsCondition(input.provenanceContains)
      )
    )
    .orderBy(asc(table.createdAtMs), asc(table.historyId))
    .limit(input.limit)
    .all();
}

function createHistoryCursorCondition(input: SearchAgentHistoryIndexesInput) {
  const table = agentStorageDrizzleSchema.agentHistoryIndexes;
  if (input.afterCreatedAtMs === undefined) return undefined;
  if (input.afterHistoryId === undefined) return gt(table.createdAtMs, input.afterCreatedAtMs);
  return or(
    gt(table.createdAtMs, input.afterCreatedAtMs),
    and(eq(table.createdAtMs, input.afterCreatedAtMs), gt(table.historyId, input.afterHistoryId))
  );
}

function createQueryContainsCondition(value: string | undefined) {
  const table = agentStorageDrizzleSchema.agentHistoryIndexes;
  if (value === undefined || value === '') return undefined;
  return like(table.queryText, `%${value}%`);
}

function createProvenanceContainsCondition(value: string | undefined) {
  const table = agentStorageDrizzleSchema.agentHistoryIndexes;
  if (value === undefined || value === '') return undefined;
  return like(table.provenanceRef, `%${value}%`);
}

function readHistoryIndex(
  agentId: string,
  database: AgentStorageDatabase,
  historyId: string
): AgentHistoryIndexRow {
  const row = findByHistoryId(agentId, database, historyId);
  if (row === undefined) throw new Error('History index insert did not return a row.');
  return row;
}
