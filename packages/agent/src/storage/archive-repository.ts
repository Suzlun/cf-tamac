import { and, asc, eq, gt } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from './schema';

import type { AgentStorageDatabase } from './database';

/**
 * Row stored for an archived Agent-owned segment.
 */
export interface AgentArchiveSegmentRow {
  readonly archiveId: string;
  readonly archiveType: string;
  readonly byteSize: number | null;
  readonly createdAtMs: number;
  readonly digestSha256: string;
  readonly endThreadSequence: number | null;
  readonly expiresAtMs: number | null;
  readonly provenanceRef: string | null;
  readonly r2ObjectRef: string;
  readonly retentionStatus: string;
  readonly sectionId: string | null;
  readonly startThreadSequence: number | null;
  readonly summary: string | null;
  readonly threadId: string | null;
}

/**
 * Row stored for an Agent-owned R2 object reference.
 */
export interface AgentR2ObjectReferenceRow {
  readonly bucketBinding: string;
  readonly byteSize: number;
  readonly contentType: string;
  readonly createdAtMs: number;
  readonly deletedAtMs: number | null;
  readonly objectKey: string;
  readonly objectRef: string;
  readonly ownerId: string;
  readonly ownerKind: string;
  readonly provenanceRef: string | null;
  readonly retentionStatus: string;
  readonly sha256: string;
  readonly status: string;
  readonly storageClass: string;
  readonly threadId: string | null;
}

/**
 * Input used to insert archive segment metadata.
 */
export interface InsertAgentArchiveSegmentInput {
  readonly archiveId: string;
  readonly archiveType: string;
  readonly byteSize?: number;
  readonly createdAtMs: number;
  readonly digestSha256: string;
  readonly endThreadSequence?: number;
  readonly expiresAtMs?: number;
  readonly provenanceRef?: string;
  readonly r2ObjectRef: string;
  readonly retentionStatus: string;
  readonly sectionId?: string;
  readonly startThreadSequence?: number;
  readonly summary?: string;
  readonly threadId?: string;
}

/**
 * Input used to record an Agent-owned R2 object reference.
 */
export interface RecordAgentR2ObjectReferenceInput {
  readonly bucketBinding: string;
  readonly byteSize: number;
  readonly contentType: string;
  readonly createdAtMs: number;
  readonly objectKey: string;
  readonly objectRef: string;
  readonly ownerId: string;
  readonly ownerKind: string;
  readonly provenanceRef?: string;
  readonly retentionStatus: string;
  readonly sha256: string;
  readonly status: string;
  readonly storageClass: string;
  readonly threadId?: string;
}

/**
 * Input used to list archive segments for one Thread.
 */
export interface ListAgentArchiveSegmentsInput {
  readonly afterArchiveId?: string;
  readonly archiveType?: string;
  readonly limit: number;
  readonly threadId?: string;
}

/**
 * Repository for archive metadata and R2 object reference indexes.
 */
export interface AgentArchiveRepository {
  readonly archiveSegmentsTableName: 'agent_archive_segments';
  readonly r2ObjectReferencesTableName: 'agent_r2_object_references';
  findArchiveSegment(archiveId: string): AgentArchiveSegmentRow | undefined;
  findR2ObjectReference(objectRef: string): AgentR2ObjectReferenceRow | undefined;
  insertArchiveSegment(input: InsertAgentArchiveSegmentInput): AgentArchiveSegmentRow;
  listArchiveSegments(input: ListAgentArchiveSegmentsInput): AgentArchiveSegmentRow[];
  markR2ObjectDeleted(objectRef: string, deletedAtMs: number): AgentR2ObjectReferenceRow;
  recordR2ObjectReference(input: RecordAgentR2ObjectReferenceInput): AgentR2ObjectReferenceRow;
}

/**
 * Create a repository for archive metadata and R2 object reference indexes.
 */
export function createAgentArchiveRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentArchiveRepository {
  return {
    archiveSegmentsTableName: 'agent_archive_segments',
    findArchiveSegment: (archiveId) => findArchiveSegment(agentId, database, archiveId),
    findR2ObjectReference: (objectRef) => findR2ObjectReference(agentId, database, objectRef),
    insertArchiveSegment: (input) => insertArchiveSegment(agentId, database, input),
    listArchiveSegments: (input) => listArchiveSegments(agentId, database, input),
    markR2ObjectDeleted: (objectRef, deletedAtMs) =>
      markR2ObjectDeleted(agentId, database, objectRef, deletedAtMs),
    r2ObjectReferencesTableName: 'agent_r2_object_references',
    recordR2ObjectReference: (input) => recordR2ObjectReference(agentId, database, input),
  };
}

function findArchiveSegment(
  agentId: string,
  database: AgentStorageDatabase,
  archiveId: string
): AgentArchiveSegmentRow | undefined {
  const table = agentStorageDrizzleSchema.agentArchiveSegments;
  return database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.archiveId, archiveId)))
    .limit(1)
    .get();
}

function findR2ObjectReference(
  agentId: string,
  database: AgentStorageDatabase,
  objectRef: string
): AgentR2ObjectReferenceRow | undefined {
  const table = agentStorageDrizzleSchema.agentR2ObjectReferences;
  return database
    .select()
    .from(table)
    .where(and(eq(table.agentId, agentId), eq(table.objectRef, objectRef)))
    .limit(1)
    .get();
}

function insertArchiveSegment(
  agentId: string,
  database: AgentStorageDatabase,
  input: InsertAgentArchiveSegmentInput
): AgentArchiveSegmentRow {
  const table = agentStorageDrizzleSchema.agentArchiveSegments;
  database
    .insert(table)
    .values({
      agentId,
      archiveId: input.archiveId,
      archiveType: input.archiveType,
      byteSize: input.byteSize ?? null,
      createdAtMs: input.createdAtMs,
      digestSha256: input.digestSha256,
      endThreadSequence: input.endThreadSequence ?? null,
      expiresAtMs: input.expiresAtMs ?? null,
      provenanceRef: input.provenanceRef ?? null,
      r2ObjectRef: input.r2ObjectRef,
      retentionStatus: input.retentionStatus,
      sectionId: input.sectionId ?? null,
      startThreadSequence: input.startThreadSequence ?? null,
      summary: input.summary ?? null,
      threadId: input.threadId ?? null,
    })
    .run();
  return readArchiveSegment(agentId, database, input.archiveId);
}

function listArchiveSegments(
  agentId: string,
  database: AgentStorageDatabase,
  input: ListAgentArchiveSegmentsInput
): AgentArchiveSegmentRow[] {
  const table = agentStorageDrizzleSchema.agentArchiveSegments;
  return database
    .select()
    .from(table)
    .where(
      and(
        eq(table.agentId, agentId),
        input.archiveType === undefined ? undefined : eq(table.archiveType, input.archiveType),
        input.threadId === undefined ? undefined : eq(table.threadId, input.threadId),
        input.afterArchiveId === undefined ? undefined : gt(table.archiveId, input.afterArchiveId)
      )
    )
    .orderBy(asc(table.archiveId))
    .limit(input.limit)
    .all();
}

function markR2ObjectDeleted(
  agentId: string,
  database: AgentStorageDatabase,
  objectRef: string,
  deletedAtMs: number
): AgentR2ObjectReferenceRow {
  const table = agentStorageDrizzleSchema.agentR2ObjectReferences;
  database
    .update(table)
    .set({ deletedAtMs, status: 'deleted' })
    .where(and(eq(table.agentId, agentId), eq(table.objectRef, objectRef)))
    .run();
  return readR2ObjectReference(agentId, database, objectRef);
}

function recordR2ObjectReference(
  agentId: string,
  database: AgentStorageDatabase,
  input: RecordAgentR2ObjectReferenceInput
): AgentR2ObjectReferenceRow {
  const existing = findR2ObjectReference(agentId, database, input.objectRef);
  if (existing !== undefined) return existing;
  const table = agentStorageDrizzleSchema.agentR2ObjectReferences;
  database
    .insert(table)
    .values({
      agentId,
      bucketBinding: input.bucketBinding,
      byteSize: input.byteSize,
      contentType: input.contentType,
      createdAtMs: input.createdAtMs,
      deletedAtMs: null,
      objectKey: input.objectKey,
      objectRef: input.objectRef,
      ownerId: input.ownerId,
      ownerKind: input.ownerKind,
      provenanceRef: input.provenanceRef ?? null,
      retentionStatus: input.retentionStatus,
      sha256: input.sha256,
      status: input.status,
      storageClass: input.storageClass,
      threadId: input.threadId ?? null,
    })
    .run();
  return readR2ObjectReference(agentId, database, input.objectRef);
}

function readArchiveSegment(
  agentId: string,
  database: AgentStorageDatabase,
  archiveId: string
): AgentArchiveSegmentRow {
  const row = findArchiveSegment(agentId, database, archiveId);
  if (row === undefined) throw new Error('Archive segment insert did not return a row.');
  return row;
}

function readR2ObjectReference(
  agentId: string,
  database: AgentStorageDatabase,
  objectRef: string
): AgentR2ObjectReferenceRow {
  const row = findR2ObjectReference(agentId, database, objectRef);
  if (row === undefined)
    throw new Error('R2 object reference insert or update did not return a row.');
  return row;
}
