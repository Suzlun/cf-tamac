import { integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

import type { AgentFoundationTableDefinition } from './schema';

/**
 * Agent-owned model policy table 群の Drizzle schema です。
 *
 * @remarks
 * provider credential や raw prompt/completion/reasoning は列として持たず、参照・digest・安全 metadata のみを
 * 永続化します。`credential_ref` は secret material ではなく、外部 secret 管理を指す安全な参照文字列だけを
 * 保存するための列です。
 *
 * @example
 * ```ts
 * const table = agentModelPolicyStorageDrizzleSchema.agentModelPolicies;
 * ```
 */
export const agentModelPolicies = sqliteTable(
  'agent_model_policies',
  {
    agentId: text('agent_id').notNull(),
    archivedAtMs: integer('archived_at_ms'),
    budgetMetadataRef: text('budget_metadata_ref'),
    budgetMetadataSha256: text('budget_metadata_sha256'),
    createdAtMs: integer('created_at_ms').notNull(),
    createdByPrincipalId: text('created_by_principal_id'),
    credentialRef: text('credential_ref'),
    decisionSchemaVersion: text('decision_schema_version').notNull(),
    generationMaxOutputTokens: integer('generation_max_output_tokens'),
    generationParametersRef: text('generation_parameters_ref'),
    generationParametersSha256: text('generation_parameters_sha256'),
    generationTemperature: text('generation_temperature'),
    generationTopP: text('generation_top_p'),
    modelId: text('model_id').notNull(),
    policyDigest: text('policy_digest').notNull(),
    policyRef: text('policy_ref').notNull(),
    provider: text('provider').notNull(),
    safeMetadataRef: text('safe_metadata_ref'),
    safeMetadataSha256: text('safe_metadata_sha256'),
    safetyMetadataRef: text('safety_metadata_ref'),
    safetyMetadataSha256: text('safety_metadata_sha256'),
    status: text('status').notNull(),
    updatedAtMs: integer('updated_at_ms').notNull(),
    updatedByPrincipalId: text('updated_by_principal_id'),
    validatedAtMs: integer('validated_at_ms'),
    version: integer('version').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.policyRef] }),
    unique('agent_model_policies_agent_digest_unique').on(table.agentId, table.policyDigest),
  ]
);

/**
 * Model policy schema map を root schema へ合成するための object です。
 */
export const agentModelPolicyStorageDrizzleSchema = {
  agentModelPolicies,
} as const;

/**
 * Model policy repository が所有する table metadata です。
 */
export const agentModelPolicyFoundationTableDefinitions = [
  {
    purpose: 'Agent-owned model policy metadata, status, version, and deterministic digest',
    repositoryName: 'AgentModelPolicyRepository',
    tableName: 'agent_model_policies',
    uniqueKeys: ['agent_id, policy_ref', 'agent_id, policy_digest'],
  },
] as const satisfies readonly AgentFoundationTableDefinition[];

/**
 * Model policy storage repository name 一覧です。
 */
export const agentModelPolicyStorageRepositoryNames = ['AgentModelPolicyRepository'] as const;
