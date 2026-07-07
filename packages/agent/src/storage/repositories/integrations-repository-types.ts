/**
 * `AgentIntegrationInstallationRow` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentIntegrationInstallationRow {
  readonly agentId: string;
  readonly grantSummaryRef: string | null;
  readonly installedAtMs: number | null;
  readonly installationId: string;
  readonly integrationId: string;
  readonly manifestDigestSha256: string | null;
  readonly manifestRef: string | null;
  readonly allowedModelPolicyRefs: string | null;
  readonly modelPolicyGrantRef: string | null;
  readonly providerBaseUrl: string | null;
  readonly providerId: string | null;
  readonly publicKeyRef: string | null;
  readonly schemaVersion: string | null;
  readonly setupInstructionsRef: string | null;
  readonly status: string;
  readonly updatedAtMs: number | null;
}

/**
 * `AgentIntegrationDefinitionRow` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentIntegrationDefinitionRow {
  readonly adapterCount: number;
  readonly agentId: string;
  readonly deliveryCapabilityCount: number;
  readonly displayName: string;
  readonly integrationId: string;
  readonly manifestRef: string | null;
  readonly providerId: string;
  readonly schemaVersion: string;
  readonly toolCount: number;
}

/**
 * `AgentIntegrationGrantRow` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentIntegrationGrantRow {
  readonly agentId: string;
  readonly createdAtMs: number;
  readonly grantId: string;
  readonly grantType: string;
  readonly installationId: string;
  readonly scope: string;
  readonly status: string;
}

/**
 * `AgentInstallationTrustKeyRow` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentInstallationTrustKeyRow {
  readonly agentId: string;
  readonly algorithm: string;
  readonly createdAtMs: number;
  readonly installationId: string;
  readonly keyId: string;
  readonly publicKeyMaterial: string | null;
  readonly publicKeyRef: string;
  readonly revokedAtMs: number | null;
  readonly status: string;
  readonly trustKeyId: string;
}

/**
 * `AgentIntegrationAdapterRow` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentIntegrationAdapterRow {
  readonly adapterId: string;
  readonly agentId: string;
  readonly deliveryCapabilityId: string | null;
  readonly displayName: string;
  readonly ingressGrant: string;
  readonly installationId: string;
  readonly integrationId: string;
  readonly allowedModelPolicyRefs: string | null;
  readonly modelPolicyGrantRef: string | null;
  readonly schemaRef: string | null;
  readonly status: string;
}

/**
 * `AgentAdapterConnectionRow` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentAdapterConnectionRow {
  readonly adapterId: string;
  readonly agentId: string;
  readonly connectionId: string;
  readonly connectionKey: string | null;
  readonly createdAtMs: number;
  readonly deliveryCapabilityId: string | null;
  readonly disabledAtMs: number | null;
  readonly externalSubject: string | null;
  readonly grantSummaryRef: string | null;
  readonly installationId: string;
  readonly allowedModelPolicyRefs: string | null;
  readonly modelPolicyGrantRef: string | null;
  readonly metadataRef: string | null;
  readonly status: string;
}

/**
 * `AgentDeliveryContextRow` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentDeliveryContextRow {
  readonly agentId: string;
  readonly capability: string;
  readonly connectionId: string;
  readonly createdAtMs: number;
  readonly deliveryContextId: string;
  readonly eventId: string;
  readonly expiresAtMs: number | null;
  readonly installationId: string;
  readonly metadataRef: string | null;
  readonly modelPolicyDigest: string | null;
  readonly modelPolicyRef: string | null;
  readonly status: string;
  readonly threadId: string;
}

/**
 * `AgentAdapterDeliveryRow` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentAdapterDeliveryRow {
  readonly agentId: string;
  readonly connectionId: string;
  readonly createdAtMs: number;
  readonly deliveryContextId: string;
  readonly deliveryId: string;
  readonly eventId: string | null;
  readonly idempotencyKey: string;
  readonly installationId: string;
  readonly providerOperationId: string | null;
  readonly providerTargetRef: string | null;
  readonly requestDigest: string | null;
  readonly requestPayloadRef: string | null;
  readonly runId: string | null;
  readonly status: string;
  readonly updatedAtMs: number;
}

/**
 * `AgentIntegrationsRepository` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface AgentIntegrationsRepository {
  readonly adapterConnectionTableName: 'agent_adapter_connections';
  readonly adapterDefinitionTableName: 'agent_integration_adapters';
  readonly adapterDeliveryTableName: 'agent_adapter_deliveries';
  readonly deliveryContextTableName: 'agent_delivery_contexts';
  readonly definitionTableName: 'agent_integration_definitions';
  readonly grantTableName: 'agent_integration_grants';
  readonly installationTableName: 'agent_integration_installations';
  readonly trustKeyTableName: 'agent_installation_trust_keys';
  createAdapterConnection(input: CreateAgentAdapterConnectionInput): AgentAdapterConnectionRow;
  createAdapterDelivery(input: CreateAgentAdapterDeliveryInput): AgentAdapterDeliveryRow;
  createDeliveryContext(input: CreateAgentDeliveryContextInput): AgentDeliveryContextRow;
  disableAdapterConnectionsByInstallation(
    input: DisableInstallationOwnedRowsInput
  ): AgentAdapterConnectionRow[];
  findActiveTrustKey(input: {
    readonly installationId: string;
    readonly keyId: string;
  }): AgentInstallationTrustKeyRow | undefined;
  findAdapterDefinition(input: {
    readonly adapterId: string;
    readonly installationId: string;
  }): AgentIntegrationAdapterRow | undefined;
  findConnection(connectionId: string): AgentAdapterConnectionRow | undefined;
  findDefinition(integrationId: string): AgentIntegrationDefinitionRow | undefined;
  findDelivery(deliveryId: string): AgentAdapterDeliveryRow | undefined;
  findDeliveryContext(deliveryContextId: string): AgentDeliveryContextRow | undefined;
  findInstallation(installationId: string): AgentIntegrationInstallationRow | undefined;
  insertGrant(input: InsertAgentIntegrationGrantInput): AgentIntegrationGrantRow;
  insertInstallation(
    input: InsertAgentIntegrationInstallationInput
  ): AgentIntegrationInstallationRow;
  insertTrustKey(input: InsertAgentInstallationTrustKeyInput): AgentInstallationTrustKeyRow;
  listConnections(input: ListAgentAdapterConnectionsInput): AgentAdapterConnectionRow[];
  listGrants(installationId: string): AgentIntegrationGrantRow[];
  listInstallations(input: ListAgentInstallationsInput): AgentIntegrationInstallationRow[];
  revokeDeliveryContextsByInstallation(
    input: DisableInstallationOwnedRowsInput
  ): AgentDeliveryContextRow[];
  revokeGrantsByInstallation(input: RevokeInstallationRowsInput): AgentIntegrationGrantRow[];
  revokeTrustKeysByInstallation(input: RevokeInstallationRowsInput): AgentInstallationTrustKeyRow[];
  updateConnectionStatus(input: UpdateAgentAdapterConnectionStatusInput): AgentAdapterConnectionRow;
  updateDeliveryStatus(input: UpdateAgentAdapterDeliveryStatusInput): AgentAdapterDeliveryRow;
  updateInstallationStatus(
    input: UpdateAgentIntegrationInstallationStatusInput
  ): AgentIntegrationInstallationRow;
  upsertAdapterDefinition(input: UpsertAgentIntegrationAdapterInput): AgentIntegrationAdapterRow;
  upsertDefinition(input: UpsertAgentIntegrationDefinitionInput): AgentIntegrationDefinitionRow;
}

/**
 * `InsertAgentIntegrationInstallationInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface InsertAgentIntegrationInstallationInput extends InstallationWritableFields {
  readonly installationId: string;
}

/**
 * `UpdateAgentIntegrationInstallationStatusInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface UpdateAgentIntegrationInstallationStatusInput extends Partial<InstallationWritableFields> {
  readonly installationId: string;
  readonly status: string;
  readonly updatedAtMs: number;
}

/**
 * `UpsertAgentIntegrationDefinitionInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface UpsertAgentIntegrationDefinitionInput {
  readonly adapterCount: number;
  readonly deliveryCapabilityCount: number;
  readonly displayName: string;
  readonly integrationId: string;
  readonly manifestRef?: string;
  readonly providerId: string;
  readonly schemaVersion: string;
  readonly toolCount: number;
}

/**
 * `InsertAgentIntegrationGrantInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface InsertAgentIntegrationGrantInput {
  readonly createdAtMs: number;
  readonly grantId: string;
  readonly grantType: string;
  readonly installationId: string;
  readonly scope: string;
  readonly status: string;
}

/**
 * `InsertAgentInstallationTrustKeyInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface InsertAgentInstallationTrustKeyInput {
  readonly algorithm: string;
  readonly createdAtMs: number;
  readonly installationId: string;
  readonly keyId: string;
  readonly publicKeyMaterial?: string;
  readonly publicKeyRef: string;
  readonly status: string;
  readonly trustKeyId: string;
}

/**
 * `UpsertAgentIntegrationAdapterInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface UpsertAgentIntegrationAdapterInput {
  readonly adapterId: string;
  readonly deliveryCapabilityId?: string;
  readonly displayName: string;
  readonly ingressGrant: string;
  readonly installationId: string;
  readonly integrationId: string;
  readonly allowedModelPolicyRefs?: readonly string[];
  readonly modelPolicyGrantRef?: string;
  readonly schemaRef?: string;
  readonly status: string;
}

/**
 * `CreateAgentAdapterConnectionInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface CreateAgentAdapterConnectionInput {
  readonly adapterId: string;
  readonly connectionId: string;
  readonly connectionKey?: string;
  readonly createdAtMs: number;
  readonly deliveryCapabilityId?: string;
  readonly externalSubject?: string;
  readonly grantSummaryRef?: string;
  readonly installationId: string;
  readonly allowedModelPolicyRefs?: readonly string[];
  readonly modelPolicyGrantRef?: string;
  readonly metadataRef?: string;
  readonly status: string;
}

/**
 * `CreateAgentDeliveryContextInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface CreateAgentDeliveryContextInput {
  readonly capability: string;
  readonly connectionId: string;
  readonly createdAtMs: number;
  readonly deliveryContextId: string;
  readonly eventId: string;
  readonly expiresAtMs?: number;
  readonly installationId: string;
  readonly metadataRef?: string;
  readonly modelPolicyDigest?: string;
  readonly modelPolicyRef?: string;
  readonly status: string;
  readonly threadId: string;
}

/**
 * `CreateAgentAdapterDeliveryInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface CreateAgentAdapterDeliveryInput {
  readonly connectionId: string;
  readonly createdAtMs: number;
  readonly deliveryContextId: string;
  readonly deliveryId: string;
  readonly eventId?: string;
  readonly idempotencyKey: string;
  readonly installationId: string;
  readonly providerTargetRef?: string;
  readonly requestDigest?: string;
  readonly requestPayloadRef?: string;
  readonly runId?: string;
  readonly status: string;
  readonly updatedAtMs: number;
}

/**
 * `ListAgentAdapterConnectionsInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface ListAgentAdapterConnectionsInput {
  readonly adapterId?: string;
  readonly afterCreatedAtMs?: number;
  readonly installationId?: string;
  readonly limit: number;
  readonly status?: string;
}

/**
 * `ListAgentInstallationsInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface ListAgentInstallationsInput {
  readonly afterUpdatedAtMs?: number;
  readonly limit: number;
  readonly status?: string;
}

/**
 * `UpdateAgentAdapterConnectionStatusInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface UpdateAgentAdapterConnectionStatusInput {
  readonly connectionId: string;
  readonly disabledAtMs?: number;
  readonly status: string;
}

/**
 * `UpdateAgentAdapterDeliveryStatusInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface UpdateAgentAdapterDeliveryStatusInput {
  readonly deliveryId: string;
  readonly providerOperationId?: string;
  readonly status: string;
  readonly updatedAtMs: number;
}

/**
 * `DisableInstallationOwnedRowsInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface DisableInstallationOwnedRowsInput {
  readonly installationId: string;
  readonly nowMs: number;
  readonly status: string;
}

/**
 * `RevokeInstallationRowsInput` は Agent Service の内部境界で共有する exported インターフェースです。
 *
 * @remarks
 * この宣言は Agent-owned Durable Object / storage / RPC adapter の型安全な接続点を表します。
 * Client runtime、生成 RPC 出力、公開 REST surface へ責務を広げません。
 */
export interface RevokeInstallationRowsInput {
  readonly installationId: string;
  readonly nowMs: number;
}

interface InstallationWritableFields {
  readonly allowedModelPolicyRefs?: readonly string[];
  readonly grantSummaryRef?: string;
  readonly installedAtMs?: number;
  readonly integrationId: string;
  readonly manifestDigestSha256?: string;
  readonly manifestRef?: string;
  readonly modelPolicyGrantRef?: string;
  readonly providerBaseUrl?: string;
  readonly providerId?: string;
  readonly publicKeyRef?: string;
  readonly schemaVersion?: string;
  readonly setupInstructionsRef?: string;
  readonly status: string;
  readonly updatedAtMs?: number;
}
