import { and, asc, count, desc, eq, gt, gte, inArray, lte, or } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from './schema';

import type { AgentStorageDatabase } from './database';

/**
 * Row stored for a pending or processed Agent Run.
 */
export interface AgentRunRow {
  readonly runId: string;
  readonly threadId: string;
  readonly triggerEventId: string;
  readonly status: string;
  readonly priority: number;
  readonly pendingSinceMs: number;
  readonly lastServedAtMs: number | null;
  readonly createdAtMs: number;
  readonly updatedAtMs: number;
}

/**
 * Row stored for an immutable AgentRun input snapshot.
 */
export interface AgentRunInputSnapshotRow {
  readonly configVersion: number;
  readonly createdAtMs: number;
  readonly integrationVersion: number;
  readonly decisionSchemaVersion?: string | null;
  readonly generationMaxOutputTokens?: number | null;
  readonly generationTemperature?: string | null;
  readonly generationTopP?: string | null;
  readonly latestReadyCompactionRef: string | null;
  readonly modelId?: string | null;
  readonly modelPolicySource?: string | null;
  readonly modelPolicyVersion?: number | null;
  readonly modelProvider?: string | null;
  readonly runId: string;
  readonly requestedModelPolicyRef?: string | null;
  readonly resolvedModelPolicyDigest?: string | null;
  readonly resolvedModelPolicyRef?: string | null;
  readonly snapshotRef: string;
  readonly threadId: string;
  readonly threadMemoryRef: string | null;
  readonly threadMemoryVersion: number;
  readonly toolSetVersion: number;
  readonly triggerEventEndSequence: number;
  readonly triggerEventId: string;
  readonly triggerEventStartSequence: number;
  readonly uncompactedUpperSequence: number;
}

/**
 * Input for creating a pending Agent Run.
 */
export interface InsertPendingAgentRunInput {
  readonly lastServedAtMs?: number;
  readonly runId: string;
  readonly threadId: string;
  readonly triggerEventId: string;
  readonly priority: number;
  readonly nowMs: number;
}

/**
 * Input for creating an immutable AgentRun input snapshot.
 */
export interface CreateAgentRunInputSnapshotInput {
  readonly configVersion: number;
  readonly createdAtMs: number;
  readonly integrationVersion: number;
  readonly decisionSchemaVersion?: string;
  readonly generationMaxOutputTokens?: number;
  readonly generationTemperature?: string;
  readonly generationTopP?: string;
  readonly latestReadyCompactionRef: string | null;
  readonly modelId?: string;
  readonly modelPolicySource?: string;
  readonly modelPolicyVersion?: number;
  readonly modelProvider?: string;
  readonly runId: string;
  readonly requestedModelPolicyRef?: string;
  readonly resolvedModelPolicyDigest?: string;
  readonly resolvedModelPolicyRef?: string;
  readonly snapshotRef: string;
  readonly threadId: string;
  readonly threadMemoryRef: string | null;
  readonly threadMemoryVersion: number;
  readonly toolSetVersion: number;
  readonly triggerEventEndSequence: number;
  readonly triggerEventId: string;
  readonly triggerEventStartSequence: number;
  readonly uncompactedUpperSequence: number;
}

/**
 * Input for an AgentRun status transition persistence update.
 */
export interface TransitionAgentRunStatusInput {
  readonly fromStatus?: string;
  readonly lastServedAtMs?: number;
  readonly nowMs: number;
  readonly runId: string;
  readonly toStatus: string;
}

/**
 * AgentRun list query supported by Agent-scoped Run handlers.
 */
export interface ListAgentRunsInput {
  readonly afterCreatedAtMs?: number;
  readonly afterRunId?: string;
  readonly endCreatedAtMs?: number;
  readonly limit: number;
  readonly startCreatedAtMs?: number;
  readonly status?: string;
  readonly threadId?: string;
}

/**
 * Repository for pending Agent Run records and input snapshots.
 */
export interface AgentPendingRunsRepository {
  readonly runTableName: 'agent_runs';
  readonly inputTableName: 'agent_run_inputs';
  countPendingRuns(): number;
  createRunInputSnapshot(input: CreateAgentRunInputSnapshotInput): AgentRunInputSnapshotRow;
  findActiveRun(): AgentRunRow | undefined;
  findCurrentRun(): AgentRunRow | undefined;
  findLatestRunInputSnapshotForThread(threadId: string): AgentRunInputSnapshotRow | undefined;
  findLatestRunForThread(threadId: string): AgentRunRow | undefined;
  findRunById(runId: string): AgentRunRow | undefined;
  findRunForEvent(eventId: string): AgentRunRow | undefined;
  findRunInputSnapshot(runId: string): AgentRunInputSnapshotRow | undefined;
  findPendingRunForThread(threadId: string): AgentRunRow | undefined;
  insertPendingRun(input: InsertPendingAgentRunInput): void;
  listRuns(input: ListAgentRunsInput): AgentRunRow[];
  selectNextPendingRun(): AgentRunRow | undefined;
  transitionRunStatus(input: TransitionAgentRunStatusInput): void;
  upsertPendingRunForThread(input: InsertPendingAgentRunInput): AgentRunRow;
}

/**
 * Create a repository for pending Agent Run records and input snapshots.
 */
export function createAgentPendingRunsRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentPendingRunsRepository {
  return {
    runTableName: 'agent_runs',
    inputTableName: 'agent_run_inputs',
    countPendingRuns: () => countPendingRuns(agentId, database),
    createRunInputSnapshot: (input) => createRunInputSnapshot(agentId, database, input),
    findActiveRun: () => findActiveRun(agentId, database),
    findCurrentRun: () => findCurrentRun(agentId, database),
    findLatestRunForThread: (threadId) => findLatestRunForThread(agentId, database, threadId),
    findLatestRunInputSnapshotForThread: (threadId) =>
      findLatestRunInputSnapshotForThread(agentId, database, threadId),
    findPendingRunForThread: (threadId) => findPendingRunForThread(agentId, database, threadId),
    findRunById: (runId) => findRunById(agentId, database, runId),
    findRunForEvent: (eventId) => findRunForEvent(agentId, database, eventId),
    findRunInputSnapshot: (runId) => findRunInputSnapshot(agentId, database, runId),
    insertPendingRun: (input) => {
      insertPendingRunRows(agentId, database, input);
    },
    listRuns: (input) => listRuns(agentId, database, input),
    selectNextPendingRun: () => selectNextPendingRun(agentId, database),
    transitionRunStatus: (input) => {
      transitionRunStatus(agentId, database, input);
    },
    upsertPendingRunForThread: (input) => upsertPendingRunForThread(agentId, database, input),
  };
}

function countPendingRuns(agentId: string, database: AgentStorageDatabase): number {
  const runs = agentStorageDrizzleSchema.agentRuns;
  const row = database
    .select({ pendingCount: count() })
    .from(runs)
    .where(and(eq(runs.agentId, agentId), eq(runs.status, 'pending')))
    .get();
  return row?.pendingCount ?? 0;
}

function createRunInputSnapshot(
  agentId: string,
  database: AgentStorageDatabase,
  input: CreateAgentRunInputSnapshotInput
): AgentRunInputSnapshotRow {
  const inputs = agentStorageDrizzleSchema.agentRunInputs;
  const existing = findRunInputSnapshot(agentId, database, input.runId);
  if (existing !== undefined) return existing;
  database
    .insert(inputs)
    .values({
      agentId,
      configVersion: input.configVersion,
      createdAtMs: input.createdAtMs,
      decisionSchemaVersion: input.decisionSchemaVersion ?? null,
      generationMaxOutputTokens: input.generationMaxOutputTokens ?? null,
      generationTemperature: input.generationTemperature ?? null,
      generationTopP: input.generationTopP ?? null,
      integrationVersion: input.integrationVersion,
      latestReadyCompactionRef: input.latestReadyCompactionRef,
      modelId: input.modelId ?? null,
      modelPolicySource: input.modelPolicySource ?? null,
      modelPolicyVersion: input.modelPolicyVersion ?? null,
      modelProvider: input.modelProvider ?? null,
      requestedModelPolicyRef: input.requestedModelPolicyRef ?? null,
      resolvedModelPolicyDigest: input.resolvedModelPolicyDigest ?? null,
      resolvedModelPolicyRef: input.resolvedModelPolicyRef ?? null,
      runId: input.runId,
      snapshotRef: input.snapshotRef,
      threadId: input.threadId,
      threadMemoryRef: input.threadMemoryRef,
      threadMemoryVersion: input.threadMemoryVersion,
      toolSetVersion: input.toolSetVersion,
      triggerEventEndSequence: input.triggerEventEndSequence,
      triggerEventId: input.triggerEventId,
      triggerEventStartSequence: input.triggerEventStartSequence,
      uncompactedUpperSequence: input.uncompactedUpperSequence,
    })
    .run();
  const created = findRunInputSnapshot(agentId, database, input.runId);
  if (created === undefined) {
    throw new Error('run input snapshot insert did not return a row.');
  }
  return created;
}

function findActiveRun(agentId: string, database: AgentStorageDatabase): AgentRunRow | undefined {
  const runs = agentStorageDrizzleSchema.agentRuns;
  return database
    .select()
    .from(runs)
    .where(and(eq(runs.agentId, agentId), eq(runs.status, 'running')))
    .orderBy(asc(runs.updatedAtMs), asc(runs.runId))
    .limit(1)
    .get();
}

function findCurrentRun(agentId: string, database: AgentStorageDatabase): AgentRunRow | undefined {
  const runs = agentStorageDrizzleSchema.agentRuns;
  const rows = database
    .select()
    .from(runs)
    .where(and(eq(runs.agentId, agentId), inArray(runs.status, ['running', 'waiting', 'pending'])))
    .orderBy(asc(runs.pendingSinceMs), asc(runs.runId))
    .all();
  return rows.sort(compareCurrentRunRows)[0];
}

function findLatestRunInputSnapshotForThread(
  agentId: string,
  database: AgentStorageDatabase,
  threadId: string
): AgentRunInputSnapshotRow | undefined {
  const inputs = agentStorageDrizzleSchema.agentRunInputs;
  return database
    .select()
    .from(inputs)
    .where(and(eq(inputs.agentId, agentId), eq(inputs.threadId, threadId)))
    .orderBy(desc(inputs.createdAtMs), desc(inputs.runId))
    .limit(1)
    .get();
}

function findLatestRunForThread(
  agentId: string,
  database: AgentStorageDatabase,
  threadId: string
): AgentRunRow | undefined {
  const runs = agentStorageDrizzleSchema.agentRuns;
  return database
    .select()
    .from(runs)
    .where(and(eq(runs.agentId, agentId), eq(runs.threadId, threadId)))
    .orderBy(desc(runs.createdAtMs), desc(runs.runId))
    .limit(1)
    .get();
}

function findRunForEvent(
  agentId: string,
  database: AgentStorageDatabase,
  eventId: string
): AgentRunRow | undefined {
  const runs = agentStorageDrizzleSchema.agentRuns;
  return database
    .select()
    .from(runs)
    .where(and(eq(runs.agentId, agentId), eq(runs.triggerEventId, eventId)))
    .limit(1)
    .get();
}

function findRunById(
  agentId: string,
  database: AgentStorageDatabase,
  runId: string
): AgentRunRow | undefined {
  const runs = agentStorageDrizzleSchema.agentRuns;
  return database
    .select()
    .from(runs)
    .where(and(eq(runs.agentId, agentId), eq(runs.runId, runId)))
    .limit(1)
    .get();
}

function findRunInputSnapshot(
  agentId: string,
  database: AgentStorageDatabase,
  runId: string
): AgentRunInputSnapshotRow | undefined {
  const inputs = agentStorageDrizzleSchema.agentRunInputs;
  return database
    .select()
    .from(inputs)
    .where(and(eq(inputs.agentId, agentId), eq(inputs.runId, runId)))
    .limit(1)
    .get();
}

function findPendingRunForThread(
  agentId: string,
  database: AgentStorageDatabase,
  threadId: string
): AgentRunRow | undefined {
  const runs = agentStorageDrizzleSchema.agentRuns;
  return database
    .select()
    .from(runs)
    .where(and(eq(runs.agentId, agentId), eq(runs.threadId, threadId), eq(runs.status, 'pending')))
    .orderBy(asc(runs.pendingSinceMs), asc(runs.runId))
    .limit(1)
    .get();
}

function listRuns(
  agentId: string,
  database: AgentStorageDatabase,
  input: ListAgentRunsInput
): AgentRunRow[] {
  const runs = agentStorageDrizzleSchema.agentRuns;
  return database
    .select()
    .from(runs)
    .where(
      and(
        eq(runs.agentId, agentId),
        input.threadId === undefined ? undefined : eq(runs.threadId, input.threadId),
        input.status === undefined ? undefined : eq(runs.status, input.status),
        createRunCursorCondition(runs, input),
        input.startCreatedAtMs === undefined
          ? undefined
          : gte(runs.createdAtMs, input.startCreatedAtMs),
        input.endCreatedAtMs === undefined ? undefined : lte(runs.createdAtMs, input.endCreatedAtMs)
      )
    )
    .orderBy(asc(runs.createdAtMs), asc(runs.runId))
    .limit(input.limit)
    .all();
}

function createRunCursorCondition(
  runs: typeof agentStorageDrizzleSchema.agentRuns,
  input: ListAgentRunsInput
) {
  if (input.afterCreatedAtMs === undefined) return undefined;
  if (input.afterRunId === undefined) return gt(runs.createdAtMs, input.afterCreatedAtMs);
  return or(
    gt(runs.createdAtMs, input.afterCreatedAtMs),
    and(eq(runs.createdAtMs, input.afterCreatedAtMs), gt(runs.runId, input.afterRunId))
  );
}

function selectNextPendingRun(
  agentId: string,
  database: AgentStorageDatabase
): AgentRunRow | undefined {
  const runs = agentStorageDrizzleSchema.agentRuns;
  return database
    .select()
    .from(runs)
    .where(and(eq(runs.agentId, agentId), eq(runs.status, 'pending')))
    .orderBy(
      desc(runs.priority),
      asc(runs.lastServedAtMs),
      asc(runs.pendingSinceMs),
      asc(runs.runId)
    )
    .limit(1)
    .get();
}

function transitionRunStatus(
  agentId: string,
  database: AgentStorageDatabase,
  input: TransitionAgentRunStatusInput
): void {
  const runs = agentStorageDrizzleSchema.agentRuns;
  database
    .update(runs)
    .set({
      lastServedAtMs: input.lastServedAtMs ?? undefined,
      status: input.toStatus,
      updatedAtMs: input.nowMs,
    })
    .where(
      and(
        eq(runs.agentId, agentId),
        eq(runs.runId, input.runId),
        input.fromStatus === undefined ? undefined : eq(runs.status, input.fromStatus)
      )
    )
    .run();
}

function upsertPendingRunForThread(
  agentId: string,
  database: AgentStorageDatabase,
  input: InsertPendingAgentRunInput
): AgentRunRow {
  const runs = agentStorageDrizzleSchema.agentRuns;
  const existing = findPendingRunForThread(agentId, database, input.threadId);
  if (existing !== undefined) {
    database
      .update(runs)
      .set({
        priority: input.priority,
        triggerEventId: input.triggerEventId,
        updatedAtMs: input.nowMs,
      })
      .where(and(eq(runs.agentId, agentId), eq(runs.runId, existing.runId)))
      .run();
    return {
      ...existing,
      priority: input.priority,
      triggerEventId: input.triggerEventId,
      updatedAtMs: input.nowMs,
    };
  }
  insertPendingRunRows(agentId, database, input);
  const created = findRunForEvent(agentId, database, input.triggerEventId);
  if (created === undefined) {
    throw new Error('pending run insert did not return a row.');
  }
  return created;
}

function compareCurrentRunRows(left: AgentRunRow, right: AgentRunRow): number {
  const statusDiff = getCurrentRunStatusRank(left.status) - getCurrentRunStatusRank(right.status);
  if (statusDiff !== 0) return statusDiff;
  const pendingDiff = left.pendingSinceMs - right.pendingSinceMs;
  if (pendingDiff !== 0) return pendingDiff;
  return left.runId.localeCompare(right.runId);
}

function getCurrentRunStatusRank(status: string): number {
  if (status === 'running') return 0;
  if (status === 'waiting') return 1;
  return 2;
}

function insertPendingRunRows(
  agentId: string,
  database: AgentStorageDatabase,
  input: InsertPendingAgentRunInput
): void {
  const runs = agentStorageDrizzleSchema.agentRuns;
  database
    .insert(runs)
    .values({
      agentId,
      createdAtMs: input.nowMs,
      lastServedAtMs: input.lastServedAtMs ?? null,
      pendingSinceMs: input.nowMs,
      priority: input.priority,
      runId: input.runId,
      status: 'pending',
      threadId: input.threadId,
      triggerEventId: input.triggerEventId,
      updatedAtMs: input.nowMs,
    })
    .run();
}
