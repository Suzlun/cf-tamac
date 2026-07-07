import { integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

/**
 * Agent-owned Schedule の Durable Object SQLite table 定義です。
 *
 * @remarks
 * Schedule 本体、Thread 解決先、Agents SDK runtime ID、overlap 状態、監査参照を保持します。
 * Drizzle schema と handwritten DDL の双方から同じ列構成を参照できるよう、storage layer に閉じて公開します。
 */
export const agentSchedules = sqliteTable(
  'agent_schedules',
  {
    activeFireStartedAtMs: integer('active_fire_started_at_ms'),
    agentId: text('agent_id').notNull(),
    auditEventId: text('audit_event_id'),
    callbackIdentity: text('callback_identity'),
    cancelledAtMs: integer('cancelled_at_ms'),
    cancelledByPrincipalId: text('cancelled_by_principal_id'),
    cancelReason: text('cancel_reason'),
    createdAtMs: integer('created_at_ms').notNull(),
    createdByPrincipalId: text('created_by_principal_id'),
    idempotencyKey: text('idempotency_key').notNull(),
    installationId: text('installation_id'),
    intervalSeconds: integer('interval_seconds'),
    lastEventId: text('last_event_id'),
    lastFireAtMs: integer('last_fire_at_ms'),
    lastFireStatus: text('last_fire_status'),
    lastFireTickId: text('last_fire_tick_id'),
    lastRunId: text('last_run_id'),
    nextFireAtMs: integer('next_fire_at_ms'),
    normalizedThreadKey: text('normalized_thread_key'),
    overlapPolicy: text('overlap_policy').notNull(),
    queuedFireCount: integer('queued_fire_count').notNull().default(0),
    runtimeScheduleId: text('runtime_schedule_id'),
    scheduleId: text('schedule_id').notNull(),
    scheduleKind: text('schedule_kind').notNull(),
    scheduleSpec: text('schedule_spec').notNull(),
    status: text('status').notNull(),
    threadId: text('thread_id').notNull(),
    threadKey: text('thread_key'),
    updatedAtMs: integer('updated_at_ms').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.scheduleId] }),
    unique('agent_schedules_agent_id_idempotency_key_unique').on(
      table.agentId,
      table.idempotencyKey
    ),
    unique('agent_schedules_agent_id_runtime_schedule_id_unique').on(
      table.agentId,
      table.runtimeScheduleId
    ),
  ]
);

/**
 * Schedule callback の tick/idempotency ledger 用 table 定義です。
 *
 * @remarks
 * Agents SDK から同じ tick が複数回届いても Event append を重複させないため、tick ID と
 * idempotency key を Agent scope で一意に保存します。
 */
export const agentScheduleFires = sqliteTable(
  'agent_schedule_fires',
  {
    agentId: text('agent_id').notNull(),
    completedAtMs: integer('completed_at_ms'),
    eventId: text('event_id'),
    fireAtMs: integer('fire_at_ms').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    observedAtMs: integer('observed_at_ms').notNull(),
    reason: text('reason'),
    runId: text('run_id'),
    scheduleId: text('schedule_id').notNull(),
    status: text('status').notNull(),
    tickId: text('tick_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.scheduleId, table.tickId] }),
    unique('agent_schedule_fires_agent_id_idempotency_key_unique').on(
      table.agentId,
      table.idempotencyKey
    ),
  ]
);
