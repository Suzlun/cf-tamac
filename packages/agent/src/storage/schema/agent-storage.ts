import { sql } from 'drizzle-orm';
import { check, integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

import {
  agentIntegrationFoundationTableDefinitions,
  agentIntegrationStorageDrizzleSchema,
  agentIntegrationStorageRepositoryNames,
} from './integration';
import {
  agentMemoryFoundationTableDefinitions,
  agentMemoryStorageDrizzleSchema,
  agentMemoryStorageRepositoryNames,
} from './memory';
import {
  agentModelInvocationFoundationTableDefinitions,
  agentModelInvocationStorageDrizzleSchema,
  agentModelInvocationStorageRepositoryNames,
} from './model-invocation';
import {
  agentModelPolicyFoundationTableDefinitions,
  agentModelPolicyStorageDrizzleSchema,
  agentModelPolicyStorageRepositoryNames,
} from './model-policy';
import { agentScheduleFires, agentSchedules } from './schedule';
import {
  agentToolFoundationTableDefinitions,
  agentToolStorageDrizzleSchema,
  agentToolStorageRepositoryNames,
} from './tool';

const agentProfile = sqliteTable('agent_profile', {
  agentId: text('agent_id').primaryKey(),
  lifecycleStatus: text('lifecycle_status').notNull(),
  displayName: text('display_name'),
  configVersion: integer('config_version').notNull(),
  credentialGeneration: integer('credential_generation').notNull(),
  systemThreadId: text('system_thread_id'),
  createdAtMs: integer('created_at_ms').notNull(),
  updatedAtMs: integer('updated_at_ms').notNull(),
});

const agentCredentials = sqliteTable(
  'agent_credentials',
  {
    agentId: text('agent_id').notNull(),
    credentialId: text('credential_id').notNull(),
    generation: integer('generation').notNull(),
    status: text('status').notNull(),
    verifierRef: text('verifier_ref'),
    publicFingerprint: text('public_fingerprint'),
    secretReference: text('secret_reference'),
    notBeforeMs: integer('not_before_ms'),
    expiresAtMs: integer('expires_at_ms'),
    revokedAtMs: integer('revoked_at_ms'),
    createdAtMs: integer('created_at_ms').notNull(),
    updatedAtMs: integer('updated_at_ms').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.credentialId] }),
    unique('agent_credentials_agent_id_generation_unique').on(table.agentId, table.generation),
  ]
);

const agentConfigVersions = sqliteTable(
  'agent_config_versions',
  {
    agentId: text('agent_id').notNull(),
    configVersion: integer('config_version').notNull(),
    displayName: text('display_name'),
    modelPolicyRef: text('model_policy_ref'),
    budgetPolicyRef: text('budget_policy_ref'),
    memoryPolicyRef: text('memory_policy_ref'),
    toolPolicyRef: text('tool_policy_ref'),
    schedulePolicyRef: text('schedule_policy_ref'),
    configBodyRef: text('config_body_ref'),
    updatedByPrincipalId: text('updated_by_principal_id'),
    updatedAtMs: integer('updated_at_ms').notNull(),
  },
  (table) => [primaryKey({ columns: [table.agentId, table.configVersion] })]
);

const agentPrincipals = sqliteTable(
  'agent_principals',
  {
    agentId: text('agent_id').notNull(),
    principalId: text('principal_id').notNull(),
    principalType: text('principal_type').notNull(),
    displayName: text('display_name'),
    status: text('status').notNull(),
    createdAtMs: integer('created_at_ms').notNull(),
    updatedAtMs: integer('updated_at_ms').notNull(),
  },
  (table) => [primaryKey({ columns: [table.agentId, table.principalId] })]
);

const agentGrants = sqliteTable(
  'agent_grants',
  {
    agentId: text('agent_id').notNull(),
    grantId: text('grant_id').notNull(),
    principalId: text('principal_id').notNull(),
    capability: text('capability').notNull(),
    scopeRef: text('scope_ref'),
    status: text('status').notNull(),
    createdAtMs: integer('created_at_ms').notNull(),
    updatedAtMs: integer('updated_at_ms').notNull(),
  },
  (table) => [primaryKey({ columns: [table.agentId, table.grantId] })]
);

const agentRequestNonces = sqliteTable(
  'agent_request_nonces',
  {
    agentId: text('agent_id').notNull(),
    principalId: text('principal_id').notNull(),
    nonce: text('nonce').notNull(),
    expiresAtMs: integer('expires_at_ms').notNull(),
    createdAtMs: integer('created_at_ms').notNull(),
  },
  (table) => [primaryKey({ columns: [table.agentId, table.principalId, table.nonce] })]
);

const agentIdempotencyRecords = sqliteTable(
  'agent_idempotency_records',
  {
    agentId: text('agent_id').notNull(),
    principalId: text('principal_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    operationName: text('operation_name').notNull(),
    requestDigest: text('request_digest').notNull(),
    responseRef: text('response_ref'),
    status: text('status').notNull(),
    createdAtMs: integer('created_at_ms').notNull(),
    expiresAtMs: integer('expires_at_ms').notNull(),
  },
  (table) => [primaryKey({ columns: [table.agentId, table.principalId, table.idempotencyKey] })]
);

const agentAuditEvents = sqliteTable(
  'agent_audit_events',
  {
    agentId: text('agent_id').notNull(),
    auditId: text('audit_id').notNull(),
    eventType: text('event_type').notNull(),
    principalRef: text('principal_ref'),
    requestDigest: text('request_digest'),
    createdAtMs: integer('created_at_ms').notNull(),
  },
  (table) => [primaryKey({ columns: [table.agentId, table.auditId] })]
);

const agentRateLimitBuckets = sqliteTable(
  'agent_rate_limit_buckets',
  {
    agentId: text('agent_id').notNull(),
    bucketKey: text('bucket_key').notNull(),
    windowStartMs: integer('window_start_ms').notNull(),
    used: integer('used').notNull(),
  },
  (table) => [primaryKey({ columns: [table.agentId, table.bucketKey] })]
);

const agentThreads = sqliteTable(
  'agent_threads',
  {
    agentId: text('agent_id').notNull(),
    threadId: text('thread_id').notNull(),
    threadKey: text('thread_key').notNull(),
    normalizedThreadKey: text('normalized_thread_key').notNull(),
    status: text('status').notNull().default('active'),
    currentSectionId: text('current_section_id'),
    priority: integer('priority').notNull().default(0),
    lastServedAtMs: integer('last_served_at_ms'),
    createdAtMs: integer('created_at_ms').notNull(),
    updatedAtMs: integer('updated_at_ms').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.threadId] }),
    unique('agent_threads_agent_id_normalized_thread_key_unique').on(
      table.agentId,
      table.normalizedThreadKey
    ),
    check('agent_threads_normalized_thread_key_not_empty', sql`${table.normalizedThreadKey} <> ''`),
    check(
      'agent_threads_normalized_thread_key_utf8_length',
      sql`length(CAST(${table.normalizedThreadKey} AS BLOB)) <= 512`
    ),
  ]
);

const agentThreadSections = sqliteTable(
  'agent_thread_sections',
  {
    agentId: text('agent_id').notNull(),
    threadId: text('thread_id').notNull(),
    sectionId: text('section_id').notNull(),
    sequence: integer('sequence').notNull(),
    status: text('status').notNull(),
    startThreadSequence: integer('start_thread_sequence').notNull().default(1),
    endThreadSequence: integer('end_thread_sequence'),
    openedAtMs: integer('opened_at_ms'),
    frozenAtMs: integer('frozen_at_ms'),
    eventCount: integer('event_count').notNull().default(0),
    createdAtMs: integer('created_at_ms').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.threadId, table.sectionId] }),
    unique('agent_thread_sections_agent_thread_sequence_unique').on(
      table.agentId,
      table.threadId,
      table.sequence
    ),
  ]
);

const agentEvents = sqliteTable(
  'agent_events',
  {
    agentId: text('agent_id').notNull(),
    eventId: text('event_id').notNull(),
    threadId: text('thread_id').notNull(),
    sectionId: text('section_id').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    eventType: text('event_type').notNull(),
    source: text('source').notNull().default('unknown'),
    threadKey: text('thread_key').notNull().default(''),
    normalizedThreadKey: text('normalized_thread_key').notNull().default(''),
    requestDigest: text('request_digest'),
    payloadRef: text('payload_ref'),
    payloadContentType: text('payload_content_type'),
    payloadByteSize: integer('payload_byte_size'),
    payloadSha256: text('payload_sha256'),
    payloadStorageClass: text('payload_storage_class'),
    payloadInlineBase64: text('payload_inline_base64'),
    occurredAtMs: integer('occurred_at_ms').notNull().default(0),
    correlationId: text('correlation_id'),
    causationId: text('causation_id'),
    deliveryContextId: text('delivery_context_id'),
    requestedModelPolicyRef: text('requested_model_policy_ref'),
    requestedModelPolicyDigest: text('requested_model_policy_digest'),
    requestedModelPolicyVersion: integer('requested_model_policy_version'),
    requestedModelPolicyValidationStatus: text('requested_model_policy_validation_status'),
    policyOverrideSource: text('policy_override_source'),
    runId: text('run_id'),
    agentSequence: integer('agent_sequence').notNull(),
    threadSequence: integer('thread_sequence').notNull(),
    createdAtMs: integer('created_at_ms').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.eventId] }),
    unique('agent_events_agent_id_idempotency_key_unique').on(table.agentId, table.idempotencyKey),
    unique('agent_events_agent_id_agent_sequence_unique').on(table.agentId, table.agentSequence),
    unique('agent_events_agent_thread_sequence_unique').on(
      table.agentId,
      table.threadId,
      table.threadSequence
    ),
  ]
);

const agentRuns = sqliteTable(
  'agent_runs',
  {
    agentId: text('agent_id').notNull(),
    runId: text('run_id').notNull(),
    threadId: text('thread_id').notNull(),
    triggerEventId: text('trigger_event_id').notNull(),
    status: text('status').notNull(),
    priority: integer('priority').notNull(),
    pendingSinceMs: integer('pending_since_ms').notNull(),
    lastServedAtMs: integer('last_served_at_ms'),
    createdAtMs: integer('created_at_ms').notNull(),
    updatedAtMs: integer('updated_at_ms').notNull(),
  },
  (table) => [primaryKey({ columns: [table.agentId, table.runId] })]
);

const agentRunInputs = sqliteTable(
  'agent_run_inputs',
  {
    agentId: text('agent_id').notNull(),
    runId: text('run_id').notNull(),
    threadId: text('thread_id').notNull(),
    snapshotRef: text('snapshot_ref').notNull(),
    triggerEventId: text('trigger_event_id').notNull(),
    triggerEventStartSequence: integer('trigger_event_start_sequence').notNull().default(0),
    triggerEventEndSequence: integer('trigger_event_end_sequence').notNull().default(0),
    threadMemoryVersion: integer('thread_memory_version').notNull().default(0),
    threadMemoryRef: text('thread_memory_ref'),
    latestReadyCompactionRef: text('latest_ready_compaction_ref'),
    uncompactedUpperSequence: integer('uncompacted_upper_sequence').notNull().default(0),
    configVersion: integer('config_version').notNull().default(0),
    toolSetVersion: integer('tool_set_version').notNull().default(0),
    integrationVersion: integer('integration_version').notNull().default(0),
    requestedModelPolicyRef: text('requested_model_policy_ref'),
    resolvedModelPolicyRef: text('resolved_model_policy_ref'),
    resolvedModelPolicyDigest: text('resolved_model_policy_digest'),
    modelProvider: text('model_provider'),
    modelId: text('model_id'),
    modelPolicyVersion: integer('model_policy_version'),
    modelPolicySource: text('model_policy_source'),
    decisionSchemaVersion: text('decision_schema_version'),
    generationMaxOutputTokens: integer('generation_max_output_tokens'),
    generationTemperature: text('generation_temperature'),
    generationTopP: text('generation_top_p'),
    createdAtMs: integer('created_at_ms').notNull(),
  },
  (table) => [primaryKey({ columns: [table.agentId, table.runId] })]
);

const agentRunInterrupts = sqliteTable(
  'agent_run_interrupts',
  {
    agentId: text('agent_id').notNull(),
    interruptId: text('interrupt_id').notNull(),
    runId: text('run_id').notNull(),
    interruptType: text('interrupt_type').notNull(),
    requestedStatus: text('requested_status').notNull(),
    reason: text('reason').notNull(),
    snapshotRef: text('snapshot_ref'),
    safeAuditRef: text('safe_audit_ref'),
    createdAtMs: integer('created_at_ms').notNull(),
  },
  (table) => [primaryKey({ columns: [table.agentId, table.interruptId] })]
);

const agentHarnessDecisionRecords = sqliteTable(
  'agent_harness_decision_records',
  {
    agentId: text('agent_id').notNull(),
    decisionRecordId: text('decision_record_id').notNull(),
    runId: text('run_id').notNull(),
    threadId: text('thread_id').notNull(),
    decisionId: text('decision_id').notNull(),
    decisionType: text('decision_type').notNull(),
    status: text('status').notNull(),
    seam: text('seam').notNull(),
    reason: text('reason'),
    createdAtMs: integer('created_at_ms').notNull(),
  },
  (table) => [primaryKey({ columns: [table.agentId, table.decisionRecordId] })]
);

const agentRunBudgetLedger = sqliteTable(
  'agent_run_budget_ledger',
  {
    agentId: text('agent_id').notNull(),
    budgetRecordId: text('budget_record_id').notNull(),
    runId: text('run_id').notNull(),
    budgetScope: text('budget_scope').notNull(),
    budgetDimension: text('budget_dimension').notNull(),
    status: text('status').notNull(),
    usedValue: integer('used_value').notNull(),
    limitValue: integer('limit_value'),
    reason: text('reason'),
    createdAtMs: integer('created_at_ms').notNull(),
  },
  (table) => [primaryKey({ columns: [table.agentId, table.budgetRecordId] })]
);

const agentSchedulerWakeState = sqliteTable('agent_scheduler_wake_state', {
  agentId: text('agent_id').primaryKey(),
  wakeStatus: text('wake_status', { enum: ['idle', 'pending', 'running'] }).notNull(),
  pendingCount: integer('pending_count').notNull(),
  updatedAtMs: integer('updated_at_ms').notNull(),
});

/**
 * `agentStorageDrizzleSchema` は Agent Service の内部境界で共有する exported 定数です。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export const agentStorageDrizzleSchema = {
  agentProfile,
  agentCredentials,
  agentConfigVersions,
  agentPrincipals,
  agentGrants,
  agentRequestNonces,
  agentIdempotencyRecords,
  agentAuditEvents,
  agentRateLimitBuckets,
  agentThreads,
  agentThreadSections,
  agentEvents,
  agentRuns,
  agentRunInputs,
  agentRunInterrupts,
  agentHarnessDecisionRecords,
  agentRunBudgetLedger,
  ...agentModelPolicyStorageDrizzleSchema,
  ...agentModelInvocationStorageDrizzleSchema,
  agentSchedules,
  agentScheduleFires,
  ...agentToolStorageDrizzleSchema,
  ...agentIntegrationStorageDrizzleSchema,
  agentSchedulerWakeState,
  ...agentMemoryStorageDrizzleSchema,
} as const;

/**
 * `AgentStorageDrizzleSchema` は Agent Service の内部境界で共有する exported 型です。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export type AgentStorageDrizzleSchema = typeof agentStorageDrizzleSchema;

/**
 * `AgentFoundationTableDefinition` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentFoundationTableDefinition {
  readonly tableName: string;
  readonly purpose: string;
  readonly repositoryName: string;
  readonly uniqueKeys: readonly string[];
}

/**
 * `agentFoundationTableDefinitions` は Agent Service の内部境界で共有する exported 定数です。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export const agentFoundationTableDefinitions = [
  {
    tableName: 'agent_profile',
    purpose: 'Agent aggregate lifecycle profile',
    repositoryName: 'AgentProfileRepository',
    uniqueKeys: ['agent_id'],
  },
  {
    tableName: 'agent_credentials',
    purpose: 'Agent access credential references and status',
    repositoryName: 'AgentCredentialsRepository',
    uniqueKeys: ['agent_id, credential_id'],
  },
  {
    tableName: 'agent_config_versions',
    purpose: 'Versioned Agent configuration snapshots',
    repositoryName: 'AgentConfigRepository',
    uniqueKeys: ['agent_id, config_version'],
  },
  {
    tableName: 'agent_principals',
    purpose: 'Agent principal grants and authorization seeds',
    repositoryName: 'AgentPrincipalsRepository',
    uniqueKeys: ['agent_id, principal_id'],
  },
  {
    tableName: 'agent_grants',
    purpose: 'Agent principal grant records and capability scopes',
    repositoryName: 'AgentGrantsRepository',
    uniqueKeys: ['agent_id, grant_id'],
  },
  {
    tableName: 'agent_request_nonces',
    purpose: 'Replay protection nonce ledger',
    repositoryName: 'AgentRequestNoncesRepository',
    uniqueKeys: ['agent_id, principal_id, nonce'],
  },
  {
    tableName: 'agent_idempotency_records',
    purpose: 'Command idempotency ledger',
    repositoryName: 'AgentIdempotencyRepository',
    uniqueKeys: ['agent_id, principal_id, idempotency_key'],
  },
  {
    tableName: 'agent_audit_events',
    purpose: 'Agent audit event ledger',
    repositoryName: 'AgentAuditRepository',
    uniqueKeys: ['agent_id, audit_id'],
  },
  {
    tableName: 'agent_rate_limit_buckets',
    purpose: 'Agent scoped rate-limit counters',
    repositoryName: 'AgentRateLimitBucketRepository',
    uniqueKeys: ['agent_id, bucket_key'],
  },
  {
    tableName: 'agent_threads',
    purpose: 'Agent scoped normalized thread identity',
    repositoryName: 'AgentThreadsRepository',
    uniqueKeys: ['agent_id, normalized_thread_key'],
  },
  {
    tableName: 'agent_thread_sections',
    purpose: 'Thread section ordering foundation',
    repositoryName: 'AgentSectionsRepository',
    uniqueKeys: ['agent_id, thread_id, section_id'],
  },
  {
    tableName: 'agent_events',
    purpose: 'Accepted Agent event source of truth',
    repositoryName: 'AgentEventsRepository',
    uniqueKeys: ['agent_id, event_id'],
  },
  {
    tableName: 'agent_runs',
    purpose: 'Pending and processed Agent run state',
    repositoryName: 'AgentPendingRunsRepository',
    uniqueKeys: ['agent_id, run_id'],
  },
  {
    tableName: 'agent_run_inputs',
    purpose: 'Run input snapshot metadata',
    repositoryName: 'AgentPendingRunsRepository',
    uniqueKeys: ['agent_id, run_id'],
  },
  {
    tableName: 'agent_run_interrupts',
    purpose: 'Run interrupt and stale commit guard flags',
    repositoryName: 'AgentRuntimeRepository',
    uniqueKeys: ['agent_id, interrupt_id'],
  },
  {
    tableName: 'agent_harness_decision_records',
    purpose: 'Harness decision outcomes and downstream seam records',
    repositoryName: 'AgentRuntimeRepository',
    uniqueKeys: ['agent_id, decision_record_id'],
  },
  {
    tableName: 'agent_run_budget_ledger',
    purpose: 'Run-level and aggregate budget check ledger entries',
    repositoryName: 'AgentRuntimeRepository',
    uniqueKeys: ['agent_id, budget_record_id'],
  },
  ...agentModelPolicyFoundationTableDefinitions,
  ...agentModelInvocationFoundationTableDefinitions,
  {
    tableName: 'agent_schedules',
    purpose: 'Agent-owned Thread-scoped schedule lifecycle and callback metadata',
    repositoryName: 'AgentSchedulesRepository',
    uniqueKeys: ['agent_id, schedule_id', 'agent_id, idempotency_key'],
  },
  {
    tableName: 'agent_schedule_fires',
    purpose: 'Schedule fire tick idempotency and overlap outcome ledger',
    repositoryName: 'AgentSchedulesRepository',
    uniqueKeys: ['agent_id, schedule_id, tick_id', 'agent_id, idempotency_key'],
  },
  {
    tableName: 'agent_scheduler_wake_state',
    purpose: 'Agent-local Queue wake coalescing state',
    repositoryName: 'AgentSchedulerWakeRepository',
    uniqueKeys: ['agent_id'],
  },
  ...agentToolFoundationTableDefinitions,
  ...agentIntegrationFoundationTableDefinitions,
  ...agentMemoryFoundationTableDefinitions,
] as const satisfies readonly AgentFoundationTableDefinition[];

/**
 * `agentStorageRepositoryNames` は Agent Service の内部境界で共有する exported 定数です。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export const agentStorageRepositoryNames = [
  'AgentProfileRepository',
  'AgentCredentialsRepository',
  'AgentConfigRepository',
  'AgentPrincipalsRepository',
  'AgentGrantsRepository',
  'AgentAuditRepository',
  'AgentRequestNoncesRepository',
  'AgentIdempotencyRepository',
  'AgentThreadsRepository',
  'AgentSectionsRepository',
  'AgentEventsRepository',
  'AgentPendingRunsRepository',
  'AgentRuntimeRepository',
  ...agentModelPolicyStorageRepositoryNames,
  ...agentModelInvocationStorageRepositoryNames,
  'AgentSchedulesRepository',
  'AgentSchedulerWakeRepository',
  ...agentToolStorageRepositoryNames,
  ...agentIntegrationStorageRepositoryNames,
  ...agentMemoryStorageRepositoryNames,
] as const;

/**
 * `AgentStorageRepositoryName` は Agent Service の内部境界で共有する exported 型です。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export type AgentStorageRepositoryName = (typeof agentStorageRepositoryNames)[number];

/**
 * `agentThreadsTableContract` は Agent Service の内部境界で共有する exported 定数です。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export const agentThreadsTableContract = {
  tableName: 'agent_threads',
  rawThreadKeyColumn: 'thread_key',
  normalizedThreadKeyColumn: 'normalized_thread_key',
  normalizedThreadKeyMaxUtf8Bytes: 512,
  uniqueAgentThreadKey: 'agent_id, normalized_thread_key',
} as const;
