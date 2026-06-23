import type {
  AdapterConnectionView,
  AdapterDeliveryView,
  DeliveryContextView,
  InstallationTrustKeyView,
  IntegrationDefinitionView,
  IntegrationGrantView,
  IntegrationInstallationView,
} from './types';
import type {
  AgentAdapterConnectionRow,
  AgentAdapterDeliveryRow,
  AgentDeliveryContextRow,
  AgentInstallationTrustKeyRow,
  AgentIntegrationDefinitionRow,
  AgentIntegrationGrantRow,
  AgentIntegrationInstallationRow,
} from '../storage';

/**
 * Installation row を secret-free view へ変換します。
 *
 * @param row Agent-owned storage から取得した Installation row です。
 * @returns RPC/domain で返せる Installation view です。
 */
export function mapInstallationRow(
  row: AgentIntegrationInstallationRow
): IntegrationInstallationView {
  return {
    agentId: row.agentId,
    grantSummaryRef: row.grantSummaryRef ?? undefined,
    installedAtMs: row.installedAtMs ?? undefined,
    installationId: row.installationId,
    integrationId: row.integrationId,
    manifestDigestSha256: row.manifestDigestSha256 ?? undefined,
    manifestRef: row.manifestRef ?? undefined,
    providerBaseUrl: row.providerBaseUrl ?? undefined,
    providerId: row.providerId ?? undefined,
    publicKeyRef: row.publicKeyRef ?? undefined,
    schemaVersion: row.schemaVersion ?? undefined,
    setupInstructionsRef: row.setupInstructionsRef ?? undefined,
    status: row.status,
    updatedAtMs: row.updatedAtMs ?? undefined,
  };
}

/** Definition row を IntegrationDefinitionView へ変換します。 */
export function mapDefinitionRow(
  row: AgentIntegrationDefinitionRow | undefined
): IntegrationDefinitionView | undefined {
  if (row === undefined) return undefined;
  return {
    adapterCount: row.adapterCount,
    deliveryCapabilityCount: row.deliveryCapabilityCount,
    displayName: row.displayName,
    integrationId: row.integrationId,
    manifestRef: row.manifestRef ?? undefined,
    providerId: row.providerId,
    schemaVersion: row.schemaVersion,
    toolCount: row.toolCount,
  };
}

/** Integration grant row を view へ変換します。 */
export function mapGrantRow(row: AgentIntegrationGrantRow): IntegrationGrantView {
  return {
    agentId: row.agentId,
    createdAtMs: row.createdAtMs,
    grantId: row.grantId,
    grantType: row.grantType,
    installationId: row.installationId,
    scope: row.scope,
    status: row.status,
  };
}

/** Trust key row を secret-free view へ変換します。 */
export function mapTrustKeyRow(row: AgentInstallationTrustKeyRow): InstallationTrustKeyView {
  return {
    agentId: row.agentId,
    createdAtMs: row.createdAtMs,
    installationId: row.installationId,
    keyId: row.keyId,
    publicKeyRef: row.publicKeyRef,
    revokedAtMs: row.revokedAtMs ?? undefined,
    status: row.status,
    trustKeyId: row.trustKeyId,
  };
}

/** Adapter Connection row を view へ変換します。 */
export function mapConnectionRow(row: AgentAdapterConnectionRow): AdapterConnectionView {
  return {
    adapterId: row.adapterId,
    agentId: row.agentId,
    connectionId: row.connectionId,
    connectionKey: row.connectionKey ?? undefined,
    createdAtMs: row.createdAtMs,
    deliveryCapabilityId: row.deliveryCapabilityId ?? undefined,
    disabledAtMs: row.disabledAtMs ?? undefined,
    externalSubject: row.externalSubject ?? undefined,
    grantSummaryRef: row.grantSummaryRef ?? undefined,
    installationId: row.installationId,
    metadataRef: row.metadataRef ?? undefined,
    status: row.status,
  };
}

/** DeliveryContext row を view へ変換します。 */
export function mapDeliveryContextRow(row: AgentDeliveryContextRow): DeliveryContextView {
  return {
    agentId: row.agentId,
    capability: row.capability,
    connectionId: row.connectionId,
    createdAtMs: row.createdAtMs,
    deliveryContextId: row.deliveryContextId,
    eventId: row.eventId,
    expiresAtMs: row.expiresAtMs ?? undefined,
    installationId: row.installationId,
    metadataRef: row.metadataRef ?? undefined,
    status: row.status,
    threadId: row.threadId,
  };
}

/** AdapterDelivery row を view へ変換します。 */
export function mapAdapterDeliveryRow(row: AgentAdapterDeliveryRow): AdapterDeliveryView {
  return {
    agentId: row.agentId,
    connectionId: row.connectionId,
    createdAtMs: row.createdAtMs,
    deliveryContextId: row.deliveryContextId,
    deliveryId: row.deliveryId,
    eventId: row.eventId ?? undefined,
    idempotencyKey: row.idempotencyKey,
    installationId: row.installationId,
    providerOperationId: row.providerOperationId ?? undefined,
    providerTargetRef: row.providerTargetRef ?? undefined,
    requestDigest: row.requestDigest ?? undefined,
    requestPayloadRef: row.requestPayloadRef ?? undefined,
    runId: row.runId ?? undefined,
    status: row.status,
    updatedAtMs: row.updatedAtMs,
  };
}
