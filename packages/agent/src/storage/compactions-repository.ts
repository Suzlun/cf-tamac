import { and, asc, desc, eq, gt, max } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from './schema';

import type { AgentStorageDatabase } from './database';

/**
 * Row stored for a Thread compaction record.
 */
export interface AgentThreadCompactionRow {
  readonly archiveRef: string | null;
  readonly completedAtMs: number | null;
  readonly compactionId: string;
  readonly compactionOrdinal: number;
  readonly createdAtMs: number;
  readonly digestSha256: string | null;
  readonly endThreadSequence: number;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly handoffRef: string | null;
  readonly historyRef: string | null;
  readonly memoryDeltaRef: string | null;
  readonly outputRef: string | null;
  readonly provenanceRef: string | null;
  readonly r2ObjectRef: string | null;
  readonly sectionId: string;
  readonly sectionOrdinal: number;
  readonly startThreadSequence: number;
  readonly startedAtMs: number | null;
  readonly status: string;
  readonly threadId: string;
  readonly updatedAtMs: number;
}

/**
 * Input used to insert a Thread compaction shell.
 */
export interface InsertAgentThreadCompactionInput {
  readonly compactionId: string;
  readonly compactionOrdinal: number;
  readonly createdAtMs: number;
  readonly endThreadSequence: number;
  readonly provenanceRef?: string;
  readonly sectionId: string;
  readonly sectionOrdinal: number;
  readonly startThreadSequence: number;
  readonly startedAtMs?: number;
  readonly status: string;
  readonly threadId: string;
}

/**
 * Input used to attach generated compaction outputs and terminal metadata.
 */
export interface UpdateAgentThreadCompactionOutputInput {
  readonly archiveRef?: string;
  readonly completedAtMs?: number;
  readonly compactionId: string;
  readonly digestSha256?: string;
  readonly errorCode?: string;
  readonly errorMessage?: string;
  readonly handoffRef?: string;
  readonly historyRef?: string;
  readonly memoryDeltaRef?: string;
  readonly outputRef?: string;
  readonly provenanceRef?: string;
  readonly r2ObjectRef?: string;
  readonly status: string;
  readonly updatedAtMs: number;
}

/**
 * Compaction の status/timestamp だけを前進させるための入力です。
 *
 * 出力参照は未作成のまま保持し、`pending` から `running` へ移る時刻などを記録します。
 */
export interface UpdateAgentThreadCompactionStatusInput {
  readonly completedAtMs?: number;
  readonly compactionId: string;
  readonly startedAtMs?: number;
  readonly status: string;
  readonly updatedAtMs: number;
}

/**
 * Input used to list compactions for one Thread.
 */
export interface ListAgentThreadCompactionsInput {
  readonly afterCompactionOrdinal?: number;
  readonly limit: number;
  readonly status?: string;
  readonly threadId: string;
}

/**
 * Repository for Thread compaction state and output references.
 */
export interface AgentCompactionsRepository {
  readonly tableName: 'agent_thread_compactions';
  findByCompactionId(compactionId: string): AgentThreadCompactionRow | undefined;
  findBySectionId(threadId: string, sectionId: string): AgentThreadCompactionRow | undefined;
  findLatestReadyCompaction(threadId: string): AgentThreadCompactionRow | undefined;
  /**
   * Thread 内の次 Compaction ordinal を返します。
   */
  getNextCompactionOrdinal(threadId: string): number;
  insertCompaction(input: InsertAgentThreadCompactionInput): AgentThreadCompactionRow;
  listCompactions(input: ListAgentThreadCompactionsInput): AgentThreadCompactionRow[];
  /**
   * 出力参照を変更せずに status/timestamp を更新します。
   */
  updateCompactionStatus(input: UpdateAgentThreadCompactionStatusInput): AgentThreadCompactionRow;
  updateCompactionOutput(input: UpdateAgentThreadCompactionOutputInput): AgentThreadCompactionRow;
}

/**
 * Create a repository for Thread compaction state and output references.
 */
export function createAgentCompactionsRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentCompactionsRepository {
  return {
    tableName: 'agent_thread_compactions',
    findByCompactionId: (compactionId) => findByCompactionId(agentId, database, compactionId),
    findBySectionId: (threadId, sectionId) =>
      findBySectionId(agentId, database, threadId, sectionId),
    findLatestReadyCompaction: (threadId) => findLatestReadyCompaction(agentId, database, threadId),
    getNextCompactionOrdinal: (threadId) => getNextCompactionOrdinal(agentId, database, threadId),
    insertCompaction: (input) => insertCompaction(agentId, database, input),
    listCompactions: (input) => listCompactions(agentId, database, input),
    updateCompactionStatus: (input) => updateCompactionStatus(agentId, database, input),
    updateCompactionOutput: (input) => updateCompactionOutput(agentId, database, input),
  };
}

function findByCompactionId(
  agentId: string,
  database: AgentStorageDatabase,
  compactionId: string
): AgentThreadCompactionRow | undefined {
  const table = agentStorageDrizzleSchema.agentThreadCompactions;
  return database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.compactionId, compactionId)))
    .limit(1)
    .get();
}

function findBySectionId(
  agentId: string,
  database: AgentStorageDatabase,
  threadId: string,
  sectionId: string
): AgentThreadCompactionRow | undefined {
  const table = agentStorageDrizzleSchema.agentThreadCompactions;
  return database
    .select()
    .from(table)
    .where(
      and(eq(table.agentId, agentId), eq(table.threadId, threadId), eq(table.sectionId, sectionId))
    )
    .limit(1)
    .get();
}

function findLatestReadyCompaction(
  agentId: string,
  database: AgentStorageDatabase,
  threadId: string
): AgentThreadCompactionRow | undefined {
  const table = agentStorageDrizzleSchema.agentThreadCompactions;
  return database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.threadId, threadId), eq(table.status, 'ready')))
    .orderBy(desc(table.compactionOrdinal), desc(table.completedAtMs), desc(table.compactionId))
    .limit(1)
    .get();
}

function getNextCompactionOrdinal(
  agentId: string,
  database: AgentStorageDatabase,
  threadId: string
): number {
  const table = agentStorageDrizzleSchema.agentThreadCompactions;
  const row = database
    .select({ lastOrdinal: max(table.compactionOrdinal) })
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.threadId, threadId)))
    .get();
  return (row?.lastOrdinal ?? 0) + 1;
}

function insertCompaction(
  agentId: string,
  database: AgentStorageDatabase,
  input: InsertAgentThreadCompactionInput
): AgentThreadCompactionRow {
  const table = agentStorageDrizzleSchema.agentThreadCompactions;
  database.insert(table).values(createInsertValues(agentId, input)).run();
  return readCompaction(agentId, database, input.compactionId);
}

function listCompactions(
  agentId: string,
  database: AgentStorageDatabase,
  input: ListAgentThreadCompactionsInput
): AgentThreadCompactionRow[] {
  const table = agentStorageDrizzleSchema.agentThreadCompactions;
  return database
    .select()
    .from(table)
    .where(
      and(
        eq(table.agentId, agentId),
        eq(table.threadId, input.threadId),
        gt(table.compactionOrdinal, input.afterCompactionOrdinal ?? 0),
        input.status === undefined ? undefined : eq(table.status, input.status)
      )
    )
    .orderBy(asc(table.compactionOrdinal), asc(table.compactionId))
    .limit(input.limit)
    .all();
}

function updateCompactionStatus(
  agentId: string,
  database: AgentStorageDatabase,
  input: UpdateAgentThreadCompactionStatusInput
): AgentThreadCompactionRow {
  const table = agentStorageDrizzleSchema.agentThreadCompactions;
  const current = readCompaction(agentId, database, input.compactionId);
  database
    .update(table)
    .set({
      completedAtMs: input.completedAtMs ?? current.completedAtMs,
      startedAtMs: input.startedAtMs ?? current.startedAtMs,
      status: input.status,
      updatedAtMs: input.updatedAtMs,
    })
    .where(and(eq(table.agentId, agentId), eq(table.compactionId, input.compactionId)))
    .run();
  return readCompaction(agentId, database, input.compactionId);
}

function updateCompactionOutput(
  agentId: string,
  database: AgentStorageDatabase,
  input: UpdateAgentThreadCompactionOutputInput
): AgentThreadCompactionRow {
  const table = agentStorageDrizzleSchema.agentThreadCompactions;
  const current = readCompaction(agentId, database, input.compactionId);
  database
    .update(table)
    .set({
      archiveRef: input.archiveRef ?? null,
      completedAtMs: input.completedAtMs ?? null,
      digestSha256: input.digestSha256 ?? null,
      errorCode: input.errorCode ?? null,
      errorMessage: input.errorMessage ?? null,
      handoffRef: input.handoffRef ?? null,
      historyRef: input.historyRef ?? null,
      memoryDeltaRef: input.memoryDeltaRef ?? null,
      outputRef: input.outputRef ?? null,
      provenanceRef: input.provenanceRef ?? current.provenanceRef,
      r2ObjectRef: input.r2ObjectRef ?? null,
      status: input.status,
      updatedAtMs: input.updatedAtMs,
    })
    .where(and(eq(table.agentId, agentId), eq(table.compactionId, input.compactionId)))
    .run();
  return readCompaction(agentId, database, input.compactionId);
}

function createInsertValues(agentId: string, input: InsertAgentThreadCompactionInput) {
  return {
    agentId,
    archiveRef: null,
    completedAtMs: null,
    compactionId: input.compactionId,
    compactionOrdinal: input.compactionOrdinal,
    createdAtMs: input.createdAtMs,
    digestSha256: null,
    endThreadSequence: input.endThreadSequence,
    errorCode: null,
    errorMessage: null,
    handoffRef: null,
    historyRef: null,
    memoryDeltaRef: null,
    outputRef: null,
    provenanceRef: input.provenanceRef ?? null,
    r2ObjectRef: null,
    sectionId: input.sectionId,
    sectionOrdinal: input.sectionOrdinal,
    startThreadSequence: input.startThreadSequence,
    startedAtMs: input.startedAtMs ?? null,
    status: input.status,
    threadId: input.threadId,
    updatedAtMs: input.createdAtMs,
  };
}

function readCompaction(
  agentId: string,
  database: AgentStorageDatabase,
  compactionId: string
): AgentThreadCompactionRow {
  const row = findByCompactionId(agentId, database, compactionId);
  if (row === undefined) throw new Error('Compaction insert or update did not return a row.');
  return row;
}
