import { and, asc, eq, gt, inArray, or } from 'drizzle-orm';

import { agentStorageDrizzleSchema } from '../schema/agent-storage';

import type { AgentStorageDatabase } from '../database';

/**
 * Agent-owned Schedule の永続行です。
 *
 * Thread、任意の Integration Installation、runtime callback、重複制御、
 * 取消監査までを AIAgent Durable Object SQLite 内で一貫して保持します。
 */
export interface AgentScheduleRow {
  readonly activeFireStartedAtMs: number | null;
  readonly auditEventId: string | null;
  readonly callbackIdentity: string | null;
  readonly cancelReason: string | null;
  readonly cancelledAtMs: number | null;
  readonly cancelledByPrincipalId: string | null;
  readonly createdAtMs: number;
  readonly createdByPrincipalId: string | null;
  readonly idempotencyKey: string;
  readonly installationId: string | null;
  readonly intervalSeconds: number | null;
  readonly lastEventId: string | null;
  readonly lastFireAtMs: number | null;
  readonly lastFireStatus: string | null;
  readonly lastFireTickId: string | null;
  readonly lastRunId: string | null;
  readonly nextFireAtMs: number | null;
  readonly normalizedThreadKey: string | null;
  readonly overlapPolicy: string;
  readonly queuedFireCount: number;
  readonly runtimeScheduleId: string | null;
  readonly scheduleId: string;
  readonly scheduleKind: string;
  readonly scheduleSpec: string;
  readonly status: string;
  readonly threadId: string;
  readonly threadKey: string | null;
  readonly updatedAtMs: number;
}

/**
 * Schedule fire tick の冪等性を記録する永続行です。
 *
 * 同一 tick に対する callback retry や重複 interval callback が、
 * 二重の `schedule.triggered` Event を作らないようにします。
 */
export interface AgentScheduleFireRow {
  readonly completedAtMs: number | null;
  readonly eventId: string | null;
  readonly fireAtMs: number;
  readonly idempotencyKey: string;
  readonly observedAtMs: number;
  readonly reason: string | null;
  readonly runId: string | null;
  readonly scheduleId: string;
  readonly status: string;
  readonly tickId: string;
}

/**
 * `InsertAgentScheduleInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface InsertAgentScheduleInput {
  readonly auditEventId?: string;
  readonly callbackIdentity?: string;
  readonly createdAtMs: number;
  readonly createdByPrincipalId?: string;
  readonly idempotencyKey: string;
  readonly installationId?: string;
  readonly intervalSeconds?: number;
  readonly nextFireAtMs?: number;
  readonly normalizedThreadKey?: string;
  readonly overlapPolicy: string;
  readonly runtimeScheduleId?: string;
  readonly scheduleId: string;
  readonly scheduleKind: string;
  readonly scheduleSpec: string;
  readonly status: string;
  readonly threadId: string;
  readonly threadKey?: string;
  readonly updatedAtMs: number;
}

/**
 * `BindAgentRuntimeScheduleInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface BindAgentRuntimeScheduleInput {
  readonly nextFireAtMs?: number;
  readonly runtimeScheduleId: string;
  readonly scheduleId: string;
  readonly updatedAtMs: number;
}

/**
 * `CancelAgentScheduleInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface CancelAgentScheduleInput {
  readonly auditEventId?: string;
  readonly cancelledAtMs: number;
  readonly cancelledByPrincipalId?: string;
  readonly reason?: string;
  readonly scheduleId: string;
  readonly status: 'cancelled' | 'disabled';
}

/**
 * `RecordAgentScheduleFireInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface RecordAgentScheduleFireInput {
  readonly completedAtMs?: number;
  readonly eventId?: string;
  readonly fireAtMs: number;
  readonly idempotencyKey: string;
  readonly observedAtMs: number;
  readonly reason?: string;
  readonly runId?: string;
  readonly scheduleId: string;
  readonly status: string;
  readonly tickId: string;
}

/**
 * `UpdateAgentScheduleAfterFireInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface UpdateAgentScheduleAfterFireInput {
  readonly activeFireStartedAtMs?: number | null;
  readonly eventId?: string;
  readonly lastFireAtMs: number;
  readonly lastFireStatus: string;
  readonly lastFireTickId: string;
  readonly nextFireAtMs?: number | null;
  readonly queuedFireCount?: number;
  readonly runId?: string;
  readonly scheduleId: string;
  readonly status?: string;
  readonly updatedAtMs: number;
}

/**
 * `ListAgentSchedulesInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface ListAgentSchedulesInput {
  readonly afterCreatedAtMs?: number;
  readonly afterScheduleId?: string;
  readonly installationId?: string;
  readonly limit: number;
  readonly status?: string;
  readonly threadId?: string;
}

/**
 * `AgentSchedulesRepository` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentSchedulesRepository {
  readonly fireTableName: 'agent_schedule_fires';
  readonly tableName: 'agent_schedules';
  bindRuntimeSchedule(input: BindAgentRuntimeScheduleInput): AgentScheduleRow;
  cancelSchedule(input: CancelAgentScheduleInput): AgentScheduleRow;
  cancelSchedulesByInstallation(input: {
    readonly auditEventId?: string;
    readonly cancelledAtMs: number;
    readonly cancelledByPrincipalId?: string;
    readonly installationId: string;
    readonly reason?: string;
    readonly status: 'cancelled' | 'disabled';
  }): AgentScheduleRow[];
  findByIdempotencyKey(idempotencyKey: string): AgentScheduleRow | undefined;
  findByScheduleId(scheduleId: string): AgentScheduleRow | undefined;
  findFire(scheduleId: string, tickId: string): AgentScheduleFireRow | undefined;
  insertSchedule(input: InsertAgentScheduleInput): AgentScheduleRow;
  listSchedules(input: ListAgentSchedulesInput): AgentScheduleRow[];
  recordFire(input: RecordAgentScheduleFireInput): AgentScheduleFireRow;
  updateAfterFire(input: UpdateAgentScheduleAfterFireInput): AgentScheduleRow;
}

/**
 * `createAgentSchedulesRepository` は Agent Service の内部境界で利用する exported 関数です。
 *
 * @remarks
 * この関数は Agent-owned Durable Object / storage / RPC adapter の責務内で呼び出されます。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 * @param agentId repository が所属する Agent aggregate ID です。
 * @param database Agent-owned Durable Object SQLite に接続した Drizzle adapter です。
 * @returns schedule lifecycle 操作を Agent ID に束縛した repository object です。
 * 返却された method が query/transaction を実行して失敗した場合は、各 method の呼び出し元へ伝播します。
 * @throws この factory 自体は query/transaction を実行せず、repository object を組み立てるだけのため例外を投げません。
 */
export function createAgentSchedulesRepository(
  agentId: string,
  database: AgentStorageDatabase
): AgentSchedulesRepository {
  return {
    fireTableName: 'agent_schedule_fires',
    tableName: 'agent_schedules',
    bindRuntimeSchedule: (input) => bindRuntimeSchedule(agentId, database, input),
    cancelSchedule: (input) => cancelSchedule(agentId, database, input),
    cancelSchedulesByInstallation: (input) =>
      cancelSchedulesByInstallation(agentId, database, input),
    findByIdempotencyKey: (idempotencyKey) =>
      findByIdempotencyKey(agentId, database, idempotencyKey),
    findByScheduleId: (scheduleId) => findByScheduleId(agentId, database, scheduleId),
    findFire: (scheduleId, tickId) => findFire(agentId, database, scheduleId, tickId),
    insertSchedule: (input) => insertSchedule(agentId, database, input),
    listSchedules: (input) => listSchedules(agentId, database, input),
    recordFire: (input) => recordFire(agentId, database, input),
    updateAfterFire: (input) => updateAfterFire(agentId, database, input),
  };
}

function insertSchedule(
  agentId: string,
  database: AgentStorageDatabase,
  input: InsertAgentScheduleInput
): AgentScheduleRow {
  const schedules = agentStorageDrizzleSchema.agentSchedules;
  database.insert(schedules).values(toInsertScheduleValues(agentId, input)).run();
  return requireSchedule(agentId, database, input.scheduleId);
}

function bindRuntimeSchedule(
  agentId: string,
  database: AgentStorageDatabase,
  input: BindAgentRuntimeScheduleInput
): AgentScheduleRow {
  const schedules = agentStorageDrizzleSchema.agentSchedules;
  database
    .update(schedules)
    .set({
      nextFireAtMs: input.nextFireAtMs ?? undefined,
      runtimeScheduleId: input.runtimeScheduleId,
      updatedAtMs: input.updatedAtMs,
    })
    .where(and(eq(schedules.agentId, agentId), eq(schedules.scheduleId, input.scheduleId)))
    .run();
  return requireSchedule(agentId, database, input.scheduleId);
}

function cancelSchedule(
  agentId: string,
  database: AgentStorageDatabase,
  input: CancelAgentScheduleInput
): AgentScheduleRow {
  const schedules = agentStorageDrizzleSchema.agentSchedules;
  database
    .update(schedules)
    .set({
      auditEventId: input.auditEventId ?? undefined,
      cancelReason: input.reason ?? null,
      cancelledAtMs: input.cancelledAtMs,
      cancelledByPrincipalId: input.cancelledByPrincipalId ?? null,
      nextFireAtMs: null,
      status: input.status,
      updatedAtMs: input.cancelledAtMs,
    })
    .where(and(eq(schedules.agentId, agentId), eq(schedules.scheduleId, input.scheduleId)))
    .run();
  return requireSchedule(agentId, database, input.scheduleId);
}

function cancelSchedulesByInstallation(
  agentId: string,
  database: AgentStorageDatabase,
  input: {
    readonly auditEventId?: string;
    readonly cancelledAtMs: number;
    readonly cancelledByPrincipalId?: string;
    readonly installationId: string;
    readonly reason?: string;
    readonly status: 'cancelled' | 'disabled';
  }
): AgentScheduleRow[] {
  const schedules = agentStorageDrizzleSchema.agentSchedules;
  const rows = listActiveSchedulesByInstallation(agentId, database, input.installationId);
  if (rows.length === 0) return [];
  database
    .update(schedules)
    .set({
      auditEventId: input.auditEventId ?? undefined,
      cancelReason: input.reason ?? 'installation_cleanup',
      cancelledAtMs: input.cancelledAtMs,
      cancelledByPrincipalId: input.cancelledByPrincipalId ?? null,
      nextFireAtMs: null,
      status: input.status,
      updatedAtMs: input.cancelledAtMs,
    })
    .where(
      and(
        eq(schedules.agentId, agentId),
        eq(schedules.installationId, input.installationId),
        inArray(schedules.status, ['active'])
      )
    )
    .run();
  return rows.map((row) => requireSchedule(agentId, database, row.scheduleId));
}

function listActiveSchedulesByInstallation(
  agentId: string,
  database: AgentStorageDatabase,
  installationId: string
): AgentScheduleRow[] {
  const schedules = agentStorageDrizzleSchema.agentSchedules;
  return database
    .select()
    .from(schedules)
    .where(
      and(
        eq(schedules.agentId, agentId),
        eq(schedules.installationId, installationId),
        eq(schedules.status, 'active')
      )
    )
    .orderBy(asc(schedules.createdAtMs), asc(schedules.scheduleId))
    .all();
}

function findByScheduleId(
  agentId: string,
  database: AgentStorageDatabase,
  scheduleId: string
): AgentScheduleRow | undefined {
  const schedules = agentStorageDrizzleSchema.agentSchedules;
  return database
    .select()
    .from(schedules)
    .where(and(eq(schedules.agentId, agentId), eq(schedules.scheduleId, scheduleId)))
    .limit(1)
    .get();
}

function findByIdempotencyKey(
  agentId: string,
  database: AgentStorageDatabase,
  idempotencyKey: string
): AgentScheduleRow | undefined {
  const schedules = agentStorageDrizzleSchema.agentSchedules;
  return database
    .select()
    .from(schedules)
    .where(and(eq(schedules.agentId, agentId), eq(schedules.idempotencyKey, idempotencyKey)))
    .limit(1)
    .get();
}

function listSchedules(
  agentId: string,
  database: AgentStorageDatabase,
  input: ListAgentSchedulesInput
): AgentScheduleRow[] {
  const schedules = agentStorageDrizzleSchema.agentSchedules;
  return database
    .select()
    .from(schedules)
    .where(
      and(
        eq(schedules.agentId, agentId),
        createScheduleCursorCondition(schedules, input),
        input.threadId === undefined ? undefined : eq(schedules.threadId, input.threadId),
        input.installationId === undefined
          ? undefined
          : eq(schedules.installationId, input.installationId),
        input.status === undefined ? undefined : eq(schedules.status, input.status)
      )
    )
    .orderBy(asc(schedules.createdAtMs), asc(schedules.scheduleId))
    .limit(input.limit)
    .all();
}

function findFire(
  agentId: string,
  database: AgentStorageDatabase,
  scheduleId: string,
  tickId: string
): AgentScheduleFireRow | undefined {
  const fires = agentStorageDrizzleSchema.agentScheduleFires;
  return database
    .select()
    .from(fires)
    .where(
      and(eq(fires.agentId, agentId), eq(fires.scheduleId, scheduleId), eq(fires.tickId, tickId))
    )
    .limit(1)
    .get();
}

function recordFire(
  agentId: string,
  database: AgentStorageDatabase,
  input: RecordAgentScheduleFireInput
): AgentScheduleFireRow {
  const existing = findFire(agentId, database, input.scheduleId, input.tickId);
  const fires = agentStorageDrizzleSchema.agentScheduleFires;
  if (existing !== undefined) {
    database
      .update(fires)
      .set({
        completedAtMs: input.completedAtMs ?? existing.completedAtMs,
        eventId: input.eventId ?? existing.eventId,
        observedAtMs: input.observedAtMs,
        reason: input.reason ?? existing.reason,
        runId: input.runId ?? existing.runId,
        status: input.status,
      })
      .where(
        and(
          eq(fires.agentId, agentId),
          eq(fires.scheduleId, input.scheduleId),
          eq(fires.tickId, input.tickId)
        )
      )
      .run();
    return requireFire(agentId, database, input.scheduleId, input.tickId);
  }
  database
    .insert(fires)
    .values({
      agentId,
      completedAtMs: input.completedAtMs ?? null,
      eventId: input.eventId ?? null,
      fireAtMs: input.fireAtMs,
      idempotencyKey: input.idempotencyKey,
      observedAtMs: input.observedAtMs,
      reason: input.reason ?? null,
      runId: input.runId ?? null,
      scheduleId: input.scheduleId,
      status: input.status,
      tickId: input.tickId,
    })
    .run();
  return requireFire(agentId, database, input.scheduleId, input.tickId);
}

function updateAfterFire(
  agentId: string,
  database: AgentStorageDatabase,
  input: UpdateAgentScheduleAfterFireInput
): AgentScheduleRow {
  const schedules = agentStorageDrizzleSchema.agentSchedules;
  database
    .update(schedules)
    .set({
      activeFireStartedAtMs: input.activeFireStartedAtMs,
      lastEventId: input.eventId ?? undefined,
      lastFireAtMs: input.lastFireAtMs,
      lastFireStatus: input.lastFireStatus,
      lastFireTickId: input.lastFireTickId,
      lastRunId: input.runId ?? undefined,
      nextFireAtMs: input.nextFireAtMs,
      queuedFireCount: input.queuedFireCount,
      status: input.status,
      updatedAtMs: input.updatedAtMs,
    })
    .where(and(eq(schedules.agentId, agentId), eq(schedules.scheduleId, input.scheduleId)))
    .run();
  return requireSchedule(agentId, database, input.scheduleId);
}

function requireSchedule(
  agentId: string,
  database: AgentStorageDatabase,
  scheduleId: string
): AgentScheduleRow {
  const row = findByScheduleId(agentId, database, scheduleId);
  if (row === undefined) throw new Error('schedule row was not persisted.');
  return row;
}

function requireFire(
  agentId: string,
  database: AgentStorageDatabase,
  scheduleId: string,
  tickId: string
): AgentScheduleFireRow {
  const row = findFire(agentId, database, scheduleId, tickId);
  if (row === undefined) throw new Error('schedule fire row was not persisted.');
  return row;
}

function createScheduleCursorCondition(
  schedules: typeof agentStorageDrizzleSchema.agentSchedules,
  input: ListAgentSchedulesInput
) {
  if (input.afterCreatedAtMs === undefined) return undefined;
  if (input.afterScheduleId === undefined) return gt(schedules.createdAtMs, input.afterCreatedAtMs);
  return or(
    gt(schedules.createdAtMs, input.afterCreatedAtMs),
    and(
      eq(schedules.createdAtMs, input.afterCreatedAtMs),
      gt(schedules.scheduleId, input.afterScheduleId)
    )
  );
}

function toInsertScheduleValues(agentId: string, input: InsertAgentScheduleInput) {
  return {
    activeFireStartedAtMs: null,
    agentId,
    auditEventId: input.auditEventId ?? null,
    callbackIdentity: input.callbackIdentity ?? null,
    cancelReason: null,
    cancelledAtMs: null,
    cancelledByPrincipalId: null,
    createdAtMs: input.createdAtMs,
    createdByPrincipalId: input.createdByPrincipalId ?? null,
    idempotencyKey: input.idempotencyKey,
    installationId: input.installationId ?? null,
    intervalSeconds: input.intervalSeconds ?? null,
    lastEventId: null,
    lastFireAtMs: null,
    lastFireStatus: null,
    lastFireTickId: null,
    lastRunId: null,
    nextFireAtMs: input.nextFireAtMs ?? null,
    normalizedThreadKey: input.normalizedThreadKey ?? null,
    overlapPolicy: input.overlapPolicy,
    queuedFireCount: 0,
    runtimeScheduleId: input.runtimeScheduleId ?? null,
    scheduleId: input.scheduleId,
    scheduleKind: input.scheduleKind,
    scheduleSpec: input.scheduleSpec,
    status: input.status,
    threadId: input.threadId,
    threadKey: input.threadKey ?? null,
    updatedAtMs: input.updatedAtMs,
  };
}
