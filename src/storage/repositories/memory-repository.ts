import { and, asc, desc, eq } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from '../schema/agent-storage';

import type { AgentStorageDatabase } from '../database';

/**
 * `AgentThreadMemoryVersionRow` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentThreadMemoryVersionRow {
  readonly createdAtMs: number;
  readonly itemCount: number;
  readonly latestCompactionId: string | null;
  readonly memoryId: string;
  readonly memoryRef: string | null;
  readonly provenanceRef: string | null;
  readonly rebaseStatus: string | null;
  readonly snapshotRef: string | null;
  readonly status: string;
  readonly threadId: string;
  readonly updatedAtMs: number;
  readonly version: number;
}

/**
 * `AgentThreadMemoryItemRow` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentThreadMemoryItemRow {
  readonly contentRef: string | null;
  readonly contentSha256: string | null;
  readonly contentText: string | null;
  readonly createdAtMs: number;
  readonly invalidatesItemId: string | null;
  readonly memoryId: string;
  readonly memoryItemId: string;
  readonly provenanceRef: string | null;
  readonly sourceCompactionId: string | null;
  readonly sourceEventId: string | null;
  readonly sourceHistoryId: string | null;
  readonly status: string;
  readonly supersedesItemId: string | null;
  readonly threadId: string;
  readonly updatedAtMs: number;
}

/**
 * `AgentMemoryVersionRow` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentMemoryVersionRow {
  readonly createdAtMs: number;
  readonly itemCount: number;
  readonly latestCompactionId: string | null;
  readonly memoryId: string;
  readonly memoryRef: string | null;
  readonly provenanceRef: string | null;
  readonly rebaseStatus: string | null;
  readonly snapshotRef: string | null;
  readonly status: string;
  readonly updatedAtMs: number;
  readonly version: number;
}

/**
 * `AgentMemoryItemRow` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentMemoryItemRow {
  readonly contentRef: string | null;
  readonly contentSha256: string | null;
  readonly contentText: string | null;
  readonly createdAtMs: number;
  readonly invalidatesItemId: string | null;
  readonly memoryId: string;
  readonly memoryItemId: string;
  readonly provenanceRef: string | null;
  readonly sourceCompactionId: string | null;
  readonly sourceEventId: string | null;
  readonly sourceHistoryId: string | null;
  readonly status: string;
  readonly supersedesItemId: string | null;
  readonly updatedAtMs: number;
}

/**
 * `CreateAgentThreadMemoryVersionInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface CreateAgentThreadMemoryVersionInput {
  readonly createdAtMs: number;
  readonly itemCount?: number;
  readonly latestCompactionId?: string;
  readonly memoryId: string;
  readonly memoryRef?: string;
  readonly provenanceRef?: string;
  readonly rebaseStatus?: string;
  readonly snapshotRef?: string;
  readonly status: string;
  readonly threadId: string;
  readonly version: number;
}

/**
 * `InsertAgentThreadMemoryItemInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface InsertAgentThreadMemoryItemInput {
  readonly contentRef?: string;
  readonly contentSha256?: string;
  readonly contentText?: string;
  readonly createdAtMs: number;
  readonly invalidatesItemId?: string;
  readonly memoryId: string;
  readonly memoryItemId: string;
  readonly provenanceRef?: string;
  readonly sourceCompactionId?: string;
  readonly sourceEventId?: string;
  readonly sourceHistoryId?: string;
  readonly status: string;
  readonly supersedesItemId?: string;
  readonly threadId: string;
}

/**
 * `CreateAgentMemoryVersionInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface CreateAgentMemoryVersionInput {
  readonly createdAtMs: number;
  readonly itemCount?: number;
  readonly latestCompactionId?: string;
  readonly memoryId: string;
  readonly memoryRef?: string;
  readonly provenanceRef?: string;
  readonly rebaseStatus?: string;
  readonly snapshotRef?: string;
  readonly status: string;
  readonly version: number;
}

/**
 * `InsertAgentMemoryItemInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface InsertAgentMemoryItemInput {
  readonly contentRef?: string;
  readonly contentSha256?: string;
  readonly contentText?: string;
  readonly createdAtMs: number;
  readonly invalidatesItemId?: string;
  readonly memoryId: string;
  readonly memoryItemId: string;
  readonly provenanceRef?: string;
  readonly sourceCompactionId?: string;
  readonly sourceEventId?: string;
  readonly sourceHistoryId?: string;
  readonly status: string;
  readonly supersedesItemId?: string;
}

/**
 * ThreadMemory version の status だけを更新する入力です。
 *
 * Compaction が新しい active version を作る直前に、既存 active version を `superseded` へ
 * 遷移させるために使います。
 */
export interface UpdateAgentThreadMemoryVersionStatusInput {
  readonly memoryId: string;
  readonly status: string;
  readonly threadId: string;
  readonly updatedAtMs: number;
}

/**
 * `AgentMemoryRepository` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentMemoryRepository {
  readonly agentMemoryItemsTableName: 'agent_memory_items';
  readonly agentMemoryVersionsTableName: 'agent_memory_versions';
  readonly threadMemoryItemsTableName: 'agent_thread_memory_items';
  readonly threadMemoryVersionsTableName: 'agent_thread_memory_versions';
  createAgentMemoryVersion(input: CreateAgentMemoryVersionInput): AgentMemoryVersionRow;
  createThreadMemoryVersion(
    input: CreateAgentThreadMemoryVersionInput
  ): AgentThreadMemoryVersionRow;
  findActiveAgentMemoryVersion(): AgentMemoryVersionRow | undefined;
  findActiveThreadMemoryVersion(threadId: string): AgentThreadMemoryVersionRow | undefined;
  findAgentMemoryVersion(memoryId: string): AgentMemoryVersionRow | undefined;
  findThreadMemoryVersion(
    threadId: string,
    memoryId: string
  ): AgentThreadMemoryVersionRow | undefined;
  insertAgentMemoryItem(input: InsertAgentMemoryItemInput): AgentMemoryItemRow;
  insertThreadMemoryItem(input: InsertAgentThreadMemoryItemInput): AgentThreadMemoryItemRow;
  listAgentMemoryItems(memoryId: string): AgentMemoryItemRow[];
  listThreadMemoryItems(threadId: string, memoryId: string): AgentThreadMemoryItemRow[];
  /**
   * ThreadMemory version の status を更新し、更新後の row を返します。
   */
  updateThreadMemoryVersionStatus(
    input: UpdateAgentThreadMemoryVersionStatusInput
  ): AgentThreadMemoryVersionRow;
}

/**
 * `createAgentMemoryRepository` は Agent Service の内部境界で利用する exported 関数です。
 *
 * @remarks
 * この関数は Agent-owned Durable Object / storage / RPC adapter の責務内で呼び出されます。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 * @param agentId repository が所属する Agent aggregate ID です。
 * @param database Agent-owned Durable Object SQLite に接続した Drizzle adapter です。
 * @returns Thread memory と section summary 操作を Agent ID に束縛した repository object です。
 * 返却された method が query/transaction を実行して失敗した場合は、各 method の呼び出し元へ伝播します。
 * @throws この factory 自体は query/transaction を実行せず、repository object を組み立てるだけのため例外を投げません。
 */
export function createAgentMemoryRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentMemoryRepository {
  return {
    agentMemoryItemsTableName: 'agent_memory_items',
    agentMemoryVersionsTableName: 'agent_memory_versions',
    createAgentMemoryVersion: (input) => createAgentMemoryVersion(agentId, database, input),
    createThreadMemoryVersion: (input) => createThreadMemoryVersion(agentId, database, input),
    findActiveAgentMemoryVersion: () => findActiveAgentMemoryVersion(agentId, database),
    findActiveThreadMemoryVersion: (threadId) =>
      findActiveThreadMemoryVersion(agentId, database, threadId),
    findAgentMemoryVersion: (memoryId) => findAgentMemoryVersion(agentId, database, memoryId),
    findThreadMemoryVersion: (threadId, memoryId) =>
      findThreadMemoryVersion(agentId, database, threadId, memoryId),
    insertAgentMemoryItem: (input) => insertAgentMemoryItem(agentId, database, input),
    insertThreadMemoryItem: (input) => insertThreadMemoryItem(agentId, database, input),
    listAgentMemoryItems: (memoryId) => listAgentMemoryItems(agentId, database, memoryId),
    listThreadMemoryItems: (threadId, memoryId) =>
      listThreadMemoryItems(agentId, database, threadId, memoryId),
    threadMemoryItemsTableName: 'agent_thread_memory_items',
    threadMemoryVersionsTableName: 'agent_thread_memory_versions',
    updateThreadMemoryVersionStatus: (input) =>
      updateThreadMemoryVersionStatus(agentId, database, input),
  };
}

function createThreadMemoryVersion(
  agentId: string,
  database: AgentStorageDatabase,
  input: CreateAgentThreadMemoryVersionInput
): AgentThreadMemoryVersionRow {
  const table = agentStorageDrizzleSchema.agentThreadMemoryVersions;
  database
    .insert(table)
    .values({
      agentId,
      createdAtMs: input.createdAtMs,
      itemCount: input.itemCount ?? 0,
      latestCompactionId: input.latestCompactionId ?? null,
      memoryId: input.memoryId,
      memoryRef: input.memoryRef ?? null,
      provenanceRef: input.provenanceRef ?? null,
      rebaseStatus: input.rebaseStatus ?? null,
      snapshotRef: input.snapshotRef ?? null,
      status: input.status,
      threadId: input.threadId,
      updatedAtMs: input.createdAtMs,
      version: input.version,
    })
    .run();
  return readThreadMemoryVersion(agentId, database, input.threadId, input.memoryId);
}

function createAgentMemoryVersion(
  agentId: string,
  database: AgentStorageDatabase,
  input: CreateAgentMemoryVersionInput
): AgentMemoryVersionRow {
  const table = agentStorageDrizzleSchema.agentMemoryVersions;
  database
    .insert(table)
    .values({
      agentId,
      createdAtMs: input.createdAtMs,
      itemCount: input.itemCount ?? 0,
      latestCompactionId: input.latestCompactionId ?? null,
      memoryId: input.memoryId,
      memoryRef: input.memoryRef ?? null,
      provenanceRef: input.provenanceRef ?? null,
      rebaseStatus: input.rebaseStatus ?? null,
      snapshotRef: input.snapshotRef ?? null,
      status: input.status,
      updatedAtMs: input.createdAtMs,
      version: input.version,
    })
    .run();
  return readAgentMemoryVersion(agentId, database, input.memoryId);
}

function findActiveThreadMemoryVersion(
  agentId: string,
  database: AgentStorageDatabase,
  threadId: string
): AgentThreadMemoryVersionRow | undefined {
  const table = agentStorageDrizzleSchema.agentThreadMemoryVersions;
  return database
    .select()
    .from(table)
    .where(
      and(eq(table.agentId, agentId), eq(table.threadId, threadId), eq(table.status, 'active'))
    )
    .orderBy(desc(table.version), desc(table.memoryId))
    .limit(1)
    .get();
}

function findActiveAgentMemoryVersion(
  agentId: string,
  database: AgentStorageDatabase
): AgentMemoryVersionRow | undefined {
  const table = agentStorageDrizzleSchema.agentMemoryVersions;
  return database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.status, 'active')))
    .orderBy(desc(table.version), desc(table.memoryId))
    .limit(1)
    .get();
}

function findThreadMemoryVersion(
  agentId: string,
  database: AgentStorageDatabase,
  threadId: string,
  memoryId: string
): AgentThreadMemoryVersionRow | undefined {
  const table = agentStorageDrizzleSchema.agentThreadMemoryVersions;
  return database
    .select()
    .from(table)
    .where(
      and(eq(table.agentId, agentId), eq(table.threadId, threadId), eq(table.memoryId, memoryId))
    )
    .limit(1)
    .get();
}

function findAgentMemoryVersion(
  agentId: string,
  database: AgentStorageDatabase,
  memoryId: string
): AgentMemoryVersionRow | undefined {
  const table = agentStorageDrizzleSchema.agentMemoryVersions;
  return database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.memoryId, memoryId)))
    .limit(1)
    .get();
}

function insertThreadMemoryItem(
  agentId: string,
  database: AgentStorageDatabase,
  input: InsertAgentThreadMemoryItemInput
): AgentThreadMemoryItemRow {
  const table = agentStorageDrizzleSchema.agentThreadMemoryItems;
  database
    .insert(table)
    .values({ agentId, ...createThreadMemoryItemValues(input) })
    .run();
  return readThreadMemoryItem(
    agentId,
    database,
    input.threadId,
    input.memoryId,
    input.memoryItemId
  );
}

function updateThreadMemoryVersionStatus(
  agentId: string,
  database: AgentStorageDatabase,
  input: UpdateAgentThreadMemoryVersionStatusInput
): AgentThreadMemoryVersionRow {
  const table = agentStorageDrizzleSchema.agentThreadMemoryVersions;
  database
    .update(table)
    .set({ status: input.status, updatedAtMs: input.updatedAtMs })
    .where(
      and(
        eq(table.agentId, agentId),
        eq(table.threadId, input.threadId),
        eq(table.memoryId, input.memoryId)
      )
    )
    .run();
  return readThreadMemoryVersion(agentId, database, input.threadId, input.memoryId);
}

function insertAgentMemoryItem(
  agentId: string,
  database: AgentStorageDatabase,
  input: InsertAgentMemoryItemInput
): AgentMemoryItemRow {
  const table = agentStorageDrizzleSchema.agentMemoryItems;
  database
    .insert(table)
    .values({ agentId, ...createAgentMemoryItemValues(input) })
    .run();
  return readAgentMemoryItem(agentId, database, input.memoryId, input.memoryItemId);
}

function listThreadMemoryItems(
  agentId: string,
  database: AgentStorageDatabase,
  threadId: string,
  memoryId: string
): AgentThreadMemoryItemRow[] {
  const table = agentStorageDrizzleSchema.agentThreadMemoryItems;
  return database
    .select()
    .from(table)
    .where(
      and(eq(table.agentId, agentId), eq(table.threadId, threadId), eq(table.memoryId, memoryId))
    )
    .orderBy(asc(table.createdAtMs), asc(table.memoryItemId))
    .all();
}

function listAgentMemoryItems(
  agentId: string,
  database: AgentStorageDatabase,
  memoryId: string
): AgentMemoryItemRow[] {
  const table = agentStorageDrizzleSchema.agentMemoryItems;
  return database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.memoryId, memoryId)))
    .orderBy(asc(table.createdAtMs), asc(table.memoryItemId))
    .all();
}

function createThreadMemoryItemValues(input: InsertAgentThreadMemoryItemInput) {
  return {
    contentRef: input.contentRef ?? null,
    contentSha256: input.contentSha256 ?? null,
    contentText: input.contentText ?? null,
    createdAtMs: input.createdAtMs,
    invalidatesItemId: input.invalidatesItemId ?? null,
    memoryId: input.memoryId,
    memoryItemId: input.memoryItemId,
    provenanceRef: input.provenanceRef ?? null,
    sourceCompactionId: input.sourceCompactionId ?? null,
    sourceEventId: input.sourceEventId ?? null,
    sourceHistoryId: input.sourceHistoryId ?? null,
    status: input.status,
    supersedesItemId: input.supersedesItemId ?? null,
    threadId: input.threadId,
    updatedAtMs: input.createdAtMs,
  };
}

function createAgentMemoryItemValues(input: InsertAgentMemoryItemInput) {
  return {
    contentRef: input.contentRef ?? null,
    contentSha256: input.contentSha256 ?? null,
    contentText: input.contentText ?? null,
    createdAtMs: input.createdAtMs,
    invalidatesItemId: input.invalidatesItemId ?? null,
    memoryId: input.memoryId,
    memoryItemId: input.memoryItemId,
    provenanceRef: input.provenanceRef ?? null,
    sourceCompactionId: input.sourceCompactionId ?? null,
    sourceEventId: input.sourceEventId ?? null,
    sourceHistoryId: input.sourceHistoryId ?? null,
    status: input.status,
    supersedesItemId: input.supersedesItemId ?? null,
    updatedAtMs: input.createdAtMs,
  };
}

function readThreadMemoryVersion(
  agentId: string,
  database: AgentStorageDatabase,
  threadId: string,
  memoryId: string
): AgentThreadMemoryVersionRow {
  const row = findThreadMemoryVersion(agentId, database, threadId, memoryId);
  if (row === undefined) throw new Error('ThreadMemory version insert did not return a row.');
  return row;
}

function readAgentMemoryVersion(
  agentId: string,
  database: AgentStorageDatabase,
  memoryId: string
): AgentMemoryVersionRow {
  const row = findAgentMemoryVersion(agentId, database, memoryId);
  if (row === undefined) throw new Error('AgentMemory version insert did not return a row.');
  return row;
}

function readThreadMemoryItem(
  agentId: string,
  database: AgentStorageDatabase,
  threadId: string,
  memoryId: string,
  memoryItemId: string
): AgentThreadMemoryItemRow {
  const table = agentStorageDrizzleSchema.agentThreadMemoryItems;
  const row = database
    .select()
    .from(table)
    .where(
      and(
        eq(table.agentId, agentId),
        eq(table.threadId, threadId),
        eq(table.memoryId, memoryId),
        eq(table.memoryItemId, memoryItemId)
      )
    )
    .limit(1)
    .get();
  if (row === undefined) throw new Error('ThreadMemory item insert did not return a row.');
  return row;
}

function readAgentMemoryItem(
  agentId: string,
  database: AgentStorageDatabase,
  memoryId: string,
  memoryItemId: string
): AgentMemoryItemRow {
  const table = agentStorageDrizzleSchema.agentMemoryItems;
  const row = database
    .select()
    .from(table)
    .where(
      and(
        eq(table.agentId, agentId),
        eq(table.memoryId, memoryId),
        eq(table.memoryItemId, memoryItemId)
      )
    )
    .limit(1)
    .get();
  if (row === undefined) throw new Error('AgentMemory item insert did not return a row.');
  return row;
}
