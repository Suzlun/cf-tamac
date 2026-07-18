import { integer, primaryKey, sqliteTable, text, unique } from 'drizzle-orm/sqlite-core';

/**
 * Integration Installation の Drizzle table 定義です。
 *
 * @remarks
 * 一つの AIAgent Durable Object が所有する Installation lifecycle、manifest digest、
 * Provider RPC endpoint、setup 状態を保持します。ここには秘密鍵や Provider secret を保存せず、
 * 公開鍵参照と検証済み manifest 参照だけを置きます。
 */
export const agentIntegrationInstallations = sqliteTable(
  'agent_integration_installations',
  {
    agentId: text('agent_id').notNull(),
    grantSummaryRef: text('grant_summary_ref'),
    installedAtMs: integer('installed_at_ms'),
    installationId: text('installation_id').notNull(),
    integrationId: text('integration_id').notNull(),
    manifestDigestSha256: text('manifest_digest_sha256'),
    manifestRef: text('manifest_ref'),
    allowedModelPolicyRefs: text('allowed_model_policy_refs'),
    modelPolicyGrantRef: text('model_policy_grant_ref'),
    providerBaseUrl: text('provider_base_url'),
    providerId: text('provider_id'),
    publicKeyRef: text('public_key_ref'),
    schemaVersion: text('schema_version'),
    setupInstructionsRef: text('setup_instructions_ref'),
    status: text('status').notNull(),
    updatedAtMs: integer('updated_at_ms'),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.installationId] }),
    unique('agent_integration_installations_agent_integration_unique').on(
      table.agentId,
      table.integrationId
    ),
  ]
);

/**
 * `agentIntegrationDefinitions` は Agent Service の内部境界で共有する exported 定数です。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export const agentIntegrationDefinitions = sqliteTable(
  'agent_integration_definitions',
  {
    adapterCount: integer('adapter_count').notNull(),
    agentId: text('agent_id').notNull(),
    deliveryCapabilityCount: integer('delivery_capability_count').notNull(),
    displayName: text('display_name').notNull(),
    integrationId: text('integration_id').notNull(),
    manifestRef: text('manifest_ref'),
    providerId: text('provider_id').notNull(),
    schemaVersion: text('schema_version').notNull(),
    toolCount: integer('tool_count').notNull(),
  },
  (table) => [primaryKey({ columns: [table.agentId, table.integrationId] })]
);

/**
 * `agentIntegrationGrants` は Agent Service の内部境界で共有する exported 定数です。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export const agentIntegrationGrants = sqliteTable(
  'agent_integration_grants',
  {
    agentId: text('agent_id').notNull(),
    createdAtMs: integer('created_at_ms').notNull(),
    grantId: text('grant_id').notNull(),
    grantType: text('grant_type').notNull(),
    installationId: text('installation_id').notNull(),
    scope: text('scope').notNull(),
    status: text('status').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.grantId] }),
    unique('agent_integration_grants_agent_installation_scope_unique').on(
      table.agentId,
      table.installationId,
      table.scope
    ),
  ]
);

/**
 * `agentInstallationTrustKeys` は Agent Service の内部境界で共有する exported 定数です。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export const agentInstallationTrustKeys = sqliteTable(
  'agent_installation_trust_keys',
  {
    agentId: text('agent_id').notNull(),
    algorithm: text('algorithm').notNull(),
    createdAtMs: integer('created_at_ms').notNull(),
    installationId: text('installation_id').notNull(),
    keyId: text('key_id').notNull(),
    publicKeyMaterial: text('public_key_material'),
    publicKeyRef: text('public_key_ref').notNull(),
    revokedAtMs: integer('revoked_at_ms'),
    status: text('status').notNull(),
    trustKeyId: text('trust_key_id').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.agentId, table.trustKeyId] }),
    unique('agent_installation_trust_keys_agent_installation_key_unique').on(
      table.agentId,
      table.installationId,
      table.keyId
    ),
  ]
);

/**
 * `agentIntegrationAdapters` は Agent Service の内部境界で共有する exported 定数です。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export const agentIntegrationAdapters = sqliteTable(
  'agent_integration_adapters',
  {
    adapterId: text('adapter_id').notNull(),
    agentId: text('agent_id').notNull(),
    deliveryCapabilityId: text('delivery_capability_id'),
    displayName: text('display_name').notNull(),
    ingressGrant: text('ingress_grant').notNull(),
    installationId: text('installation_id').notNull(),
    integrationId: text('integration_id').notNull(),
    allowedModelPolicyRefs: text('allowed_model_policy_refs'),
    modelPolicyGrantRef: text('model_policy_grant_ref'),
    schemaRef: text('schema_ref'),
    status: text('status').notNull(),
  },
  (table) => [primaryKey({ columns: [table.agentId, table.installationId, table.adapterId] })]
);

/**
 * `agentAdapterConnections` は Agent Service の内部境界で共有する exported 定数です。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export const agentAdapterConnections = sqliteTable(
  'agent_adapter_connections',
  {
    adapterId: text('adapter_id').notNull(),
    agentId: text('agent_id').notNull(),
    connectionId: text('connection_id').notNull(),
    connectionKey: text('connection_key'),
    createdAtMs: integer('created_at_ms').notNull(),
    deliveryCapabilityId: text('delivery_capability_id'),
    disabledAtMs: integer('disabled_at_ms'),
    externalSubject: text('external_subject'),
    grantSummaryRef: text('grant_summary_ref'),
    installationId: text('installation_id').notNull(),
    allowedModelPolicyRefs: text('allowed_model_policy_refs'),
    modelPolicyGrantRef: text('model_policy_grant_ref'),
    metadataRef: text('metadata_ref'),
    status: text('status').notNull(),
  },
  (table) => [primaryKey({ columns: [table.agentId, table.connectionId] })]
);

/**
 * `agentDeliveryContexts` は Agent Service の内部境界で共有する exported 定数です。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export const agentDeliveryContexts = sqliteTable(
  'agent_delivery_contexts',
  {
    agentId: text('agent_id').notNull(),
    capability: text('capability').notNull(),
    connectionId: text('connection_id').notNull(),
    createdAtMs: integer('created_at_ms').notNull(),
    deliveryContextId: text('delivery_context_id').notNull(),
    eventId: text('event_id').notNull(),
    expiresAtMs: integer('expires_at_ms'),
    installationId: text('installation_id').notNull(),
    metadataRef: text('metadata_ref'),
    modelPolicyDigest: text('model_policy_digest'),
    modelPolicyRef: text('model_policy_ref'),
    status: text('status').notNull(),
    threadId: text('thread_id').notNull(),
  },
  (table) => [primaryKey({ columns: [table.agentId, table.deliveryContextId] })]
);

/**
 * `agentAdapterDeliveries` は Agent Service の内部境界で共有する exported 定数です。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export const agentAdapterDeliveries = sqliteTable(
  'agent_adapter_deliveries',
  {
    agentId: text('agent_id').notNull(),
    connectionId: text('connection_id').notNull(),
    createdAtMs: integer('created_at_ms').notNull(),
    deliveryContextId: text('delivery_context_id').notNull(),
    deliveryId: text('delivery_id').notNull(),
    eventId: text('event_id'),
    idempotencyKey: text('idempotency_key').notNull(),
    installationId: text('installation_id').notNull(),
    providerOperationId: text('provider_operation_id'),
    providerTargetRef: text('provider_target_ref'),
    requestDigest: text('request_digest'),
    requestPayloadRef: text('request_payload_ref'),
    runId: text('run_id'),
    status: text('status').notNull(),
    updatedAtMs: integer('updated_at_ms').notNull(),
  },
  (table) => [primaryKey({ columns: [table.agentId, table.deliveryId] })]
);

/**
 * `agentIntegrationFoundationTableDefinitions` は Agent Service の内部境界で共有する exported 定数です。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export const agentIntegrationFoundationTableDefinitions = [
  {
    purpose: 'Integration Installation lifecycle and manifest trust state',
    repositoryName: 'AgentIntegrationsRepository',
    tableName: 'agent_integration_installations',
    uniqueKeys: ['agent_id, installation_id', 'agent_id, integration_id'],
  },
  {
    purpose: 'Verified Integration definition summary',
    repositoryName: 'AgentIntegrationsRepository',
    tableName: 'agent_integration_definitions',
    uniqueKeys: ['agent_id, integration_id'],
  },
  {
    purpose: 'Installation grant records for Integration capability authorization',
    repositoryName: 'AgentIntegrationsRepository',
    tableName: 'agent_integration_grants',
    uniqueKeys: ['agent_id, grant_id', 'agent_id, installation_id, scope'],
  },
  {
    purpose: 'Provider signature trust keys for Installation principals',
    repositoryName: 'AgentIntegrationsRepository',
    tableName: 'agent_installation_trust_keys',
    uniqueKeys: ['agent_id, trust_key_id', 'agent_id, installation_id, key_id'],
  },
  {
    purpose: 'Manifest-provided generic Adapter definitions',
    repositoryName: 'AgentIntegrationsRepository',
    tableName: 'agent_integration_adapters',
    uniqueKeys: ['agent_id, installation_id, adapter_id'],
  },
  {
    purpose: 'Agent-local Adapter Connection lifecycle',
    repositoryName: 'AgentIntegrationsRepository',
    tableName: 'agent_adapter_connections',
    uniqueKeys: ['agent_id, connection_id'],
  },
  {
    purpose: 'Ingress-bound DeliveryContext response capabilities',
    repositoryName: 'AgentIntegrationsRepository',
    tableName: 'agent_delivery_contexts',
    uniqueKeys: ['agent_id, delivery_context_id'],
  },
  {
    purpose: 'Signed Provider Delivery RPC tracking ledger',
    repositoryName: 'AgentIntegrationsRepository',
    tableName: 'agent_adapter_deliveries',
    uniqueKeys: ['agent_id, delivery_id'],
  },
] as const;

/**
 * `agentIntegrationStorageDrizzleSchema` は Agent Service の内部境界で共有する exported 定数です。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export const agentIntegrationStorageDrizzleSchema = {
  agentAdapterConnections,
  agentAdapterDeliveries,
  agentDeliveryContexts,
  agentInstallationTrustKeys,
  agentIntegrationAdapters,
  agentIntegrationDefinitions,
  agentIntegrationGrants,
  agentIntegrationInstallations,
} as const;

/**
 * `agentIntegrationFoundationTables` は Agent Service の内部境界で共有する exported 定数です。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export const agentIntegrationFoundationTables = [
  'agent_integration_installations',
  'agent_integration_definitions',
  'agent_integration_grants',
  'agent_installation_trust_keys',
  'agent_integration_adapters',
  'agent_adapter_connections',
  'agent_delivery_contexts',
  'agent_adapter_deliveries',
] as const;

/**
 * `agentIntegrationStorageRepositoryNames` は Agent Service の内部境界で共有する exported 定数です。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export const agentIntegrationStorageRepositoryNames = ['AgentIntegrationsRepository'] as const;
