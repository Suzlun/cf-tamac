import type {
  AgentAuditView,
  AgentCoreRequestContext,
  AgentEventView,
  AgentPageView,
  AgentPayloadMetadataView,
  AgentThreadView,
} from '../domain';
import type { IntegrationDeliveryProviderClient } from './provider-client';

/**
 * Integration Installation の安全な公開 view です。
 *
 * @remarks
 * 署名鍵の秘密 material は含めず、manifest digest、Provider identity、setup 参照だけを返します。
 */
export interface IntegrationInstallationView {
  readonly agentId: string;
  readonly allowedModelPolicyRefs: readonly string[];
  readonly grantSummaryRef?: string;
  readonly installedAtMs?: number;
  readonly installationId: string;
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

/**
 * Integration manifest 由来の定義 summary view です。
 */
export interface IntegrationDefinitionView {
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
 * Installation trust key の secret-free view です。
 */
export interface InstallationTrustKeyView {
  readonly agentId: string;
  readonly createdAtMs: number;
  readonly installationId: string;
  readonly keyId: string;
  readonly publicKeyRef: string;
  readonly revokedAtMs?: number;
  readonly status: string;
  readonly trustKeyId: string;
}

/**
 * Integration grant ledger の view です。
 */
export interface IntegrationGrantView {
  readonly agentId: string;
  readonly createdAtMs: number;
  readonly grantId: string;
  readonly grantType: string;
  readonly installationId: string;
  readonly scope: string;
  readonly status: string;
}

/**
 * Adapter Connection lifecycle の view です。
 */
export interface AdapterConnectionView {
  readonly adapterId: string;
  readonly agentId: string;
  readonly allowedModelPolicyRefs: readonly string[];
  readonly connectionId: string;
  readonly connectionKey?: string;
  readonly createdAtMs: number;
  readonly deliveryCapabilityId?: string;
  readonly disabledAtMs?: number;
  readonly externalSubject?: string;
  readonly grantSummaryRef?: string;
  readonly installationId: string;
  readonly metadataRef?: string;
  readonly modelPolicyGrantRef?: string;
  readonly status: string;
}

/**
 * Ingress Event に bind された DeliveryContext view です。
 */
export interface DeliveryContextView {
  readonly agentId: string;
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
 * Provider へ送った Delivery RPC の追跡 view です。
 */
export interface AdapterDeliveryView {
  readonly agentId: string;
  readonly connectionId: string;
  readonly createdAtMs: number;
  readonly deliveryContextId: string;
  readonly deliveryId: string;
  readonly eventId?: string;
  readonly idempotencyKey: string;
  readonly installationId: string;
  readonly providerOperationId?: string;
  readonly providerTargetRef?: string;
  readonly requestDigest?: string;
  readonly requestPayloadRef?: string;
  readonly runId?: string;
  readonly status: string;
  readonly updatedAtMs: number;
}

/** InstallIntegration command です。 */
export interface InstallIntegrationCommand {
  readonly context: AgentCoreRequestContext;
  readonly integrationId: string;
  readonly manifestPayload?: AgentPayloadMetadataView;
  readonly manifestRef: string;
  readonly requestedGrants: readonly string[];
  readonly setupMetadataRef?: AgentPayloadMetadataView;
}

/** UninstallIntegration command です。 */
export interface UninstallIntegrationCommand {
  readonly context: AgentCoreRequestContext;
  readonly installationId: string;
  readonly reason?: string;
}

/** Installation 一件取得 query です。 */
export interface GetIntegrationInstallationQuery {
  readonly context: AgentCoreRequestContext;
  readonly installationId: string;
}

/** Installation 一覧 query です。 */
export interface ListIntegrationInstallationsQuery {
  readonly context: AgentCoreRequestContext;
  readonly pageSize?: number;
  readonly pageToken?: string;
  readonly status?: string;
}

/** Adapter Connection 作成 command です。 */
export interface CreateAdapterConnectionCommand {
  readonly adapterId: string;
  readonly connectionKey?: string;
  readonly context: AgentCoreRequestContext;
  readonly externalSubject?: string;
  readonly installationId: string;
  readonly metadataRef?: AgentPayloadMetadataView;
}

/** Adapter Connection 削除 command です。 */
export interface DeleteAdapterConnectionCommand {
  readonly connectionId: string;
  readonly context: AgentCoreRequestContext;
  readonly reason?: string;
}

/** Adapter Connection 一覧 query です。 */
export interface ListAdapterConnectionsQuery {
  readonly adapterId?: string;
  readonly context: AgentCoreRequestContext;
  readonly installationId?: string;
  readonly pageSize?: number;
  readonly pageToken?: string;
  readonly status?: string;
}

/** Integration ingress Event publish command です。 */
export interface PublishIntegrationEventCommand {
  readonly connectionId?: string;
  readonly context: AgentCoreRequestContext;
  readonly deliveryCapability?: string;
  readonly deliveryExpiresAtMs?: number;
  readonly deliveryMetadataRef?: AgentPayloadMetadataView;
  readonly eventType: string;
  readonly installationId: string;
  readonly modelPolicyRef?: string;
  readonly occurredAtMs?: number;
  readonly payload?: Uint8Array;
  readonly payloadContentType?: string;
  readonly payloadReference?: AgentPayloadMetadataView;
  readonly signature: IntegrationIngressSignatureInput;
  readonly source: string;
  readonly threadKey: string;
}

/** Tool result publish command です。 */
export interface PublishIntegrationToolResultCommand {
  readonly context: AgentCoreRequestContext;
  readonly installationId: string;
  readonly invocationId: string;
  readonly outputPayload?: AgentPayloadMetadataView;
  readonly outputRef?: string;
  readonly providerOperationId?: string;
  readonly signature: IntegrationIngressSignatureInput;
  readonly status: 'failed' | 'succeeded';
}

/** Delivery result publish command です。 */
export interface PublishIntegrationDeliveryResultCommand {
  readonly context: AgentCoreRequestContext;
  readonly deliveryContextId?: string;
  readonly deliveryId: string;
  readonly installationId: string;
  readonly providerOperationId?: string;
  readonly signature: IntegrationIngressSignatureInput;
  readonly status: string;
}

/** Provider Delivery 実行 command です。 */
export interface DeliverToIntegrationProviderCommand {
  readonly context: AgentCoreRequestContext;
  readonly deliveryContextId: string;
  readonly idempotencyKey: string;
  readonly payloadRef: AgentPayloadMetadataView;
  readonly providerClient: IntegrationDeliveryProviderClient;
  readonly runId: string;
}

/**
 * Ingress 署名検証に必要な正規化済み request metadata です。
 *
 * @remarks
 * Provider が指定した時刻許容幅は保持せず、Agent が固定する `300_000` ms window だけで評価します。
 *
 * @property algorithm `Ed25519` に固定された detached signature algorithm です。
 * @property byteLength unsigned Protobuf binary body の byte length です。
 * @property digestHex lowercase SHA-256 hex digest です。
 * @property keyId active Installation trust key を選ぶ NFC 正規化済み ID です。
 * @property nonce replay reservation に使う NFC 正規化済み nonce です。
 * @property signature Ed25519 signature bytes です。
 * @property signedAtMs Provider が signature を生成した Unix epoch milliseconds です。
 * @property timestampMs canonical signature base と fixed window に使う Unix epoch milliseconds です。
 */
export interface IntegrationIngressSignatureInput {
  readonly algorithm: string;
  readonly byteLength: number;
  readonly digestHex: string;
  readonly keyId: string;
  readonly nonce: string;
  readonly signature: Uint8Array;
  readonly signedAtMs: number;
  readonly timestampMs: number;
}

/** InstallIntegration の mutation 結果です。 */
export interface InstallIntegrationResult {
  readonly audit?: AgentAuditView;
  readonly definition?: IntegrationDefinitionView;
  readonly grants: readonly IntegrationGrantView[];
  readonly installation: IntegrationInstallationView;
  readonly replayed: boolean;
  readonly trustKey?: InstallationTrustKeyView;
}

/** UninstallIntegration の mutation 結果です。 */
export interface UninstallIntegrationResult {
  readonly audit?: AgentAuditView;
  readonly disabledConnections: readonly AdapterConnectionView[];
  readonly installation: IntegrationInstallationView;
  readonly replayed: boolean;
}

/** GetInstallation の query 結果です。 */
export interface GetIntegrationInstallationResult {
  readonly definition?: IntegrationDefinitionView;
  readonly grants: readonly IntegrationGrantView[];
  readonly installation: IntegrationInstallationView;
}

/** ListInstallations の query 結果です。 */
export interface ListIntegrationInstallationsResult {
  readonly installations: readonly IntegrationInstallationView[];
  readonly page: AgentPageView;
}

/** Adapter Connection mutation 結果です。 */
export interface AdapterConnectionMutationResult {
  readonly audit?: AgentAuditView;
  readonly connection: AdapterConnectionView;
  readonly replayed: boolean;
}

/** ListAdapterConnections の query 結果です。 */
export interface ListAdapterConnectionsResult {
  readonly connections: readonly AdapterConnectionView[];
  readonly page: AgentPageView;
}

/** PublishEvent ingress 結果です。 */
export interface PublishIntegrationEventResult {
  readonly deliveryContext?: DeliveryContextView;
  readonly event: AgentEventView;
  readonly replayed: boolean;
  readonly requestedModelPolicy?: AgentEventView['modelPolicy'];
  readonly thread: AgentThreadView;
}

/** Delivery result callback 結果です。 */
export interface PublishIntegrationDeliveryResult {
  readonly delivery?: AdapterDeliveryView;
  readonly replayed: boolean;
  readonly resumeAction?: string;
  readonly result: {
    readonly agentId?: string;
    readonly connectionId?: string;
    readonly deliveryContextId?: string;
    readonly deliveryId: string;
    readonly installationId?: string;
    readonly providerOperationId?: string;
    readonly providerMessage?: string;
    readonly resumeAction?: string;
    readonly runId?: string;
    readonly status: string;
  };
  readonly safeMetadataRef?: AgentPayloadMetadataView;
}

/** Provider Delivery 実行結果です。 */
export interface DeliverToIntegrationProviderResult {
  readonly delivery: AdapterDeliveryView;
  readonly operation?: {
    readonly operationId: string;
    readonly providerOperationRef?: string;
    readonly status: string;
  };
  readonly status: string;
}
