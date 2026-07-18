import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  primaryKey,
  sqliteTable,
  text,
  unique,
} from 'drizzle-orm/sqlite-core';

const agentThreadCompactions = sqliteTable(
  'agent_thread_compactions',
  {
    agentId: text('agent_id').notNull(),
    archiveRef: text('archive_ref'),
    completedAtMs: integer('completed_at_ms'),
    compactionId: text('compaction_id').notNull(),
    compactionOrdinal: integer('compaction_ordinal').notNull(),
    createdAtMs: integer('created_at_ms').notNull(),
    digestSha256: text('digest_sha256'),
    endThreadSequence: integer('end_thread_sequence').notNull(),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    handoffRef: text('handoff_ref'),
    historyRef: text('history_ref'),
    memoryDeltaRef: text('memory_delta_ref'),
    outputRef: text('output_ref'),
    provenanceRef: text('provenance_ref'),
    r2ObjectRef: text('r2_object_ref'),
    sectionId: text('section_id').notNull(),
    sectionOrdinal: integer('section_ordinal').notNull(),
    startThreadSequence: integer('start_thread_sequence').notNull(),
    startedAtMs: integer('started_at_ms'),
    status: text('status').notNull(),
    threadId: text('thread_id').notNull(),
    updatedAtMs: integer('updated_at_ms').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.compactionId] }),
    unique('agent_thread_compactions_agent_thread_section_unique').on(
      table.agentId,
      table.threadId,
      table.sectionId
    ),
    unique('agent_thread_compactions_agent_thread_ordinal_unique').on(
      table.agentId,
      table.threadId,
      table.compactionOrdinal
    ),
    index('agent_thread_compactions_thread_status_ordinal_idx').on(
      table.agentId,
      table.threadId,
      table.status,
      table.compactionOrdinal
    ),
  ]
);

const agentHistoryIndexes = sqliteTable(
  'agent_history_indexes',
  {
    agentId: text('agent_id').notNull(),
    bodyByteSize: integer('body_byte_size'),
    bodyContentType: text('body_content_type'),
    bodyRef: text('body_ref'),
    bodySha256: text('body_sha256'),
    bodyStorageClass: text('body_storage_class'),
    compactionId: text('compaction_id'),
    createdAtMs: integer('created_at_ms').notNull(),
    endThreadSequence: integer('end_thread_sequence').notNull(),
    historyId: text('history_id').notNull(),
    historyRef: text('history_ref').notNull(),
    provenanceRef: text('provenance_ref'),
    queryText: text('query_text'),
    retentionStatus: text('retention_status').notNull().default('active'),
    sectionId: text('section_id'),
    startThreadSequence: integer('start_thread_sequence').notNull(),
    summary: text('summary'),
    threadId: text('thread_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.historyId] }),
    unique('agent_history_indexes_agent_history_ref_unique').on(table.agentId, table.historyRef),
    index('agent_history_indexes_thread_created_idx').on(
      table.agentId,
      table.threadId,
      table.createdAtMs
    ),
    index('agent_history_indexes_compaction_idx').on(table.agentId, table.compactionId),
  ]
);

const agentThreadMemoryVersions = sqliteTable(
  'agent_thread_memory_versions',
  {
    agentId: text('agent_id').notNull(),
    createdAtMs: integer('created_at_ms').notNull(),
    itemCount: integer('item_count').notNull().default(0),
    latestCompactionId: text('latest_compaction_id'),
    memoryId: text('memory_id').notNull(),
    memoryRef: text('memory_ref'),
    provenanceRef: text('provenance_ref'),
    rebaseStatus: text('rebase_status'),
    snapshotRef: text('snapshot_ref'),
    status: text('status').notNull(),
    threadId: text('thread_id').notNull(),
    updatedAtMs: integer('updated_at_ms').notNull(),
    version: integer('version').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.threadId, table.memoryId] }),
    unique('agent_thread_memory_versions_agent_thread_version_unique').on(
      table.agentId,
      table.threadId,
      table.version
    ),
    index('agent_thread_memory_versions_active_idx').on(
      table.agentId,
      table.threadId,
      table.status
    ),
  ]
);

const agentThreadMemoryItems = sqliteTable(
  'agent_thread_memory_items',
  {
    agentId: text('agent_id').notNull(),
    contentRef: text('content_ref'),
    contentSha256: text('content_sha256'),
    contentText: text('content_text'),
    createdAtMs: integer('created_at_ms').notNull(),
    invalidatesItemId: text('invalidates_item_id'),
    memoryId: text('memory_id').notNull(),
    memoryItemId: text('memory_item_id').notNull(),
    provenanceRef: text('provenance_ref'),
    sourceCompactionId: text('source_compaction_id'),
    sourceEventId: text('source_event_id'),
    sourceHistoryId: text('source_history_id'),
    status: text('status').notNull(),
    supersedesItemId: text('supersedes_item_id'),
    threadId: text('thread_id').notNull(),
    updatedAtMs: integer('updated_at_ms').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.threadId, table.memoryId, table.memoryItemId] }),
    index('agent_thread_memory_items_active_idx').on(
      table.agentId,
      table.threadId,
      table.memoryId,
      table.status
    ),
  ]
);

const agentMemoryVersions = sqliteTable(
  'agent_memory_versions',
  {
    agentId: text('agent_id').notNull(),
    createdAtMs: integer('created_at_ms').notNull(),
    itemCount: integer('item_count').notNull().default(0),
    latestCompactionId: text('latest_compaction_id'),
    memoryId: text('memory_id').notNull(),
    memoryRef: text('memory_ref'),
    provenanceRef: text('provenance_ref'),
    rebaseStatus: text('rebase_status'),
    snapshotRef: text('snapshot_ref'),
    status: text('status').notNull(),
    updatedAtMs: integer('updated_at_ms').notNull(),
    version: integer('version').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.memoryId] }),
    unique('agent_memory_versions_agent_version_unique').on(table.agentId, table.version),
    index('agent_memory_versions_status_idx').on(table.agentId, table.status),
  ]
);

const agentMemoryItems = sqliteTable(
  'agent_memory_items',
  {
    agentId: text('agent_id').notNull(),
    contentRef: text('content_ref'),
    contentSha256: text('content_sha256'),
    contentText: text('content_text'),
    createdAtMs: integer('created_at_ms').notNull(),
    invalidatesItemId: text('invalidates_item_id'),
    memoryId: text('memory_id').notNull(),
    memoryItemId: text('memory_item_id').notNull(),
    provenanceRef: text('provenance_ref'),
    sourceCompactionId: text('source_compaction_id'),
    sourceEventId: text('source_event_id'),
    sourceHistoryId: text('source_history_id'),
    status: text('status').notNull(),
    supersedesItemId: text('supersedes_item_id'),
    updatedAtMs: integer('updated_at_ms').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.memoryId, table.memoryItemId] }),
    index('agent_memory_items_active_idx').on(table.agentId, table.memoryId, table.status),
  ]
);

const agentArchiveSegments = sqliteTable(
  'agent_archive_segments',
  {
    agentId: text('agent_id').notNull(),
    archiveId: text('archive_id').notNull(),
    archiveType: text('archive_type').notNull(),
    byteSize: integer('byte_size'),
    createdAtMs: integer('created_at_ms').notNull(),
    digestSha256: text('digest_sha256').notNull(),
    endThreadSequence: integer('end_thread_sequence'),
    expiresAtMs: integer('expires_at_ms'),
    provenanceRef: text('provenance_ref'),
    r2ObjectRef: text('r2_object_ref').notNull(),
    retentionStatus: text('retention_status').notNull(),
    sectionId: text('section_id'),
    startThreadSequence: integer('start_thread_sequence'),
    summary: text('summary'),
    threadId: text('thread_id'),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.archiveId] }),
    index('agent_archive_segments_thread_range_idx').on(
      table.agentId,
      table.threadId,
      table.startThreadSequence
    ),
  ]
);

const agentR2ObjectReferences = sqliteTable(
  'agent_r2_object_references',
  {
    agentId: text('agent_id').notNull(),
    bucketBinding: text('bucket_binding').notNull(),
    byteSize: integer('byte_size').notNull(),
    contentType: text('content_type').notNull(),
    createdAtMs: integer('created_at_ms').notNull(),
    deletedAtMs: integer('deleted_at_ms'),
    objectKey: text('object_key').notNull(),
    objectRef: text('object_ref').notNull(),
    ownerId: text('owner_id').notNull(),
    ownerKind: text('owner_kind').notNull(),
    provenanceRef: text('provenance_ref'),
    retentionStatus: text('retention_status').notNull(),
    sha256: text('sha256').notNull(),
    status: text('status').notNull(),
    storageClass: text('storage_class').notNull(),
    threadId: text('thread_id'),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.objectRef] }),
    unique('agent_r2_object_references_agent_key_unique').on(table.agentId, table.objectKey),
    check('agent_r2_object_references_byte_size_non_negative', sql`${table.byteSize} >= 0`),
    index('agent_r2_object_references_owner_idx').on(table.agentId, table.ownerKind, table.ownerId),
  ]
);

/**
 * `agentMemoryStorageDrizzleSchema` は Agent Service の内部境界で共有する exported 定数です。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export const agentMemoryStorageDrizzleSchema = {
  agentArchiveSegments,
  agentHistoryIndexes,
  agentMemoryItems,
  agentMemoryVersions,
  agentR2ObjectReferences,
  agentThreadCompactions,
  agentThreadMemoryItems,
  agentThreadMemoryVersions,
} as const;

/**
 * `agentMemoryFoundationTables` は Agent Service の内部境界で共有する exported 定数です。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export const agentMemoryFoundationTables = [
  'agent_thread_compactions',
  'agent_history_indexes',
  'agent_thread_memory_versions',
  'agent_thread_memory_items',
  'agent_memory_versions',
  'agent_memory_items',
  'agent_archive_segments',
  'agent_r2_object_references',
] as const;

/**
 * `agentMemoryFoundationTableDefinitions` は Agent Service の内部境界で共有する exported 定数です。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export const agentMemoryFoundationTableDefinitions = [
  {
    tableName: 'agent_thread_compactions',
    purpose: 'Thread Section compaction lifecycle and output references',
    repositoryName: 'AgentCompactionsRepository',
    uniqueKeys: ['agent_id, compaction_id', 'agent_id, thread_id, section_id'],
  },
  {
    tableName: 'agent_history_indexes',
    purpose: 'ThreadHistory searchable index and R2 body metadata',
    repositoryName: 'AgentHistoryRepository',
    uniqueKeys: ['agent_id, history_id', 'agent_id, history_ref'],
  },
  {
    tableName: 'agent_thread_memory_versions',
    purpose: 'Versioned ThreadMemory snapshots',
    repositoryName: 'AgentMemoryRepository',
    uniqueKeys: ['agent_id, thread_id, memory_id', 'agent_id, thread_id, version'],
  },
  {
    tableName: 'agent_thread_memory_items',
    purpose: 'ThreadMemory items with provenance and lineage',
    repositoryName: 'AgentMemoryRepository',
    uniqueKeys: ['agent_id, thread_id, memory_id, memory_item_id'],
  },
  {
    tableName: 'agent_memory_versions',
    purpose: 'Versioned AgentMemory snapshots outside a single Thread',
    repositoryName: 'AgentMemoryRepository',
    uniqueKeys: ['agent_id, memory_id', 'agent_id, version'],
  },
  {
    tableName: 'agent_memory_items',
    purpose: 'AgentMemory items with provenance and lineage',
    repositoryName: 'AgentMemoryRepository',
    uniqueKeys: ['agent_id, memory_id, memory_item_id'],
  },
  {
    tableName: 'agent_archive_segments',
    purpose: 'Archive metadata for Event, History, transcript, artifact, and export segments',
    repositoryName: 'AgentArchiveRepository',
    uniqueKeys: ['agent_id, archive_id'],
  },
  {
    tableName: 'agent_r2_object_references',
    purpose: 'Agent-owned immutable R2 object references and ownership metadata',
    repositoryName: 'AgentArchiveRepository',
    uniqueKeys: ['agent_id, object_ref', 'agent_id, object_key'],
  },
] as const;

/**
 * `agentMemoryStorageRepositoryNames` は Agent Service の内部境界で共有する exported 定数です。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export const agentMemoryStorageRepositoryNames = [
  'AgentCompactionsRepository',
  'AgentHistoryRepository',
  'AgentMemoryRepository',
  'AgentArchiveRepository',
] as const;
