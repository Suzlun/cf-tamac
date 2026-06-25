import { integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

import type { AgentFoundationTableDefinition } from './schema';

/**
 * Model invocation ledger の Drizzle schema です。
 *
 * @remarks
 * この ledger は model 実行の調査に必要な request/response digest、provider/model metadata、usage、lease 状態を
 * 保持します。raw prompt、raw completion、chain-of-thought、hidden reasoning、provider credential は保存しません。
 *
 * @example
 * ```ts
 * const table = agentModelInvocationStorageDrizzleSchema.agentModelInvocations;
 * ```
 */
export const agentModelInvocations = sqliteTable(
  'agent_model_invocations',
  {
    agentId: text('agent_id').notNull(),
    attempt: integer('attempt').notNull(),
    createdAtMs: integer('created_at_ms').notNull(),
    decisionSchemaVersion: text('decision_schema_version').notNull(),
    heartbeatAtMs: integer('heartbeat_at_ms'),
    inputTokenCount: integer('input_token_count'),
    invocationId: text('invocation_id').notNull(),
    latencyMs: integer('latency_ms'),
    leaseExpiresAtMs: integer('lease_expires_at_ms'),
    leaseOwner: text('lease_owner'),
    modelId: text('model_id').notNull(),
    outputTokenCount: integer('output_token_count'),
    policyDigest: text('policy_digest').notNull(),
    policyRef: text('policy_ref').notNull(),
    provider: text('provider').notNull(),
    providerErrorCategory: text('provider_error_category'),
    requestDigest: text('request_digest'),
    responseDigest: text('response_digest'),
    runId: text('run_id').notNull(),
    safeMetadataRef: text('safe_metadata_ref'),
    status: text('status').notNull(),
    threadId: text('thread_id').notNull(),
    updatedAtMs: integer('updated_at_ms').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.invocationId] }),
    unique('agent_model_invocations_agent_run_attempt_unique').on(
      table.agentId,
      table.runId,
      table.attempt
    ),
  ]
);

/**
 * Model invocation schema map を root schema へ合成するための object です。
 */
export const agentModelInvocationStorageDrizzleSchema = {
  agentModelInvocations,
} as const;

/**
 * Model invocation ledger の table metadata です。
 */
export const agentModelInvocationFoundationTableDefinitions = [
  {
    purpose: 'Secret-free model invocation attempts, digests, usage, and recovery lease metadata',
    repositoryName: 'AgentModelInvocationRepository',
    tableName: 'agent_model_invocations',
    uniqueKeys: ['agent_id, invocation_id', 'agent_id, run_id, attempt'],
  },
] as const satisfies readonly AgentFoundationTableDefinition[];

/**
 * Model invocation repository name 一覧です。
 */
export const agentModelInvocationStorageRepositoryNames = [
  'AgentModelInvocationRepository',
] as const;
