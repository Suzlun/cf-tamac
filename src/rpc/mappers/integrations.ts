import type {
  CreateAdapterConnectionResponseSchema,
  DeleteAdapterConnectionResponseSchema,
  GetInstallationResponseSchema,
  InstallIntegrationResponseSchema,
  ListAdapterConnectionsResponseSchema,
  ListInstallationsResponseSchema,
  PublishDeliveryResultResponseSchema,
  PublishIntegrationEventResponseSchema,
  PublishToolResultResponseSchema,
  UninstallIntegrationResponseSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import type {
  AgentAuditView,
  AgentEventView,
  AgentPageView,
  AgentPayloadMetadataView,
} from '../../domain';
import type {
  AdapterConnectionMutationResult,
  AdapterConnectionView,
  AdapterDeliveryView,
  DeliveryContextView,
  GetIntegrationInstallationResult,
  InstallIntegrationResult,
  IntegrationDefinitionView,
  IntegrationGrantView,
  IntegrationInstallationView,
  InstallationTrustKeyView,
  ListAdapterConnectionsResult,
  ListIntegrationInstallationsResult,
  PublishIntegrationDeliveryResult,
  PublishIntegrationEventResult,
  UninstallIntegrationResult,
} from '../../integrations';
import type { ToolInvocationMutationResult, ToolInvocationView } from '../../tools';
import type { MessageInitShape } from '@bufbuild/protobuf';

/**
 * InstallIntegration の domain result を generated response 初期化値へ変換します。
 *
 * @param result installation、definition、grant、trust key、audit を含む domain result です。
 * @returns `InstallIntegrationResponseSchema` に渡せる plain object です。
 * @throws この関数は確定済み domain result の純粋変換だけを行うため例外を投げません。
 * @example
 * ```ts
 * const response = mapInstallIntegrationResponse(result);
 * ```
 */
export function mapInstallIntegrationResponse(
  result: InstallIntegrationResult
): MessageInitShape<typeof InstallIntegrationResponseSchema> {
  return {
    audit: mapAudit(result.audit),
    definition: mapDefinition(result.definition),
    grants: result.grants.map(mapGrant),
    installation: mapInstallation(result.installation),
    trustKey: mapTrustKey(result.trustKey),
  };
}

/**
 * UninstallIntegration の domain result を generated response 初期化値へ変換します。
 *
 * @param result 無効化済み connection、installation、audit を含む domain result です。
 * @returns `UninstallIntegrationResponseSchema` に渡せる plain object です。
 * @throws この関数は uninstall 結果の写像だけを行うため例外を投げません。
 * @example
 * ```ts
 * const response = mapUninstallIntegrationResponse(result);
 * ```
 */
export function mapUninstallIntegrationResponse(
  result: UninstallIntegrationResult
): MessageInitShape<typeof UninstallIntegrationResponseSchema> {
  return {
    audit: mapAudit(result.audit),
    disabledConnections: result.disabledConnections.map(mapConnection),
    installation: mapInstallation(result.installation),
  };
}

/**
 * GetInstallation の domain result を generated response 初期化値へ変換します。
 *
 * @param result installation、definition、grant を含む domain result です。
 * @returns `GetInstallationResponseSchema` に渡せる plain object です。
 * @throws この関数は取得済み view の純粋変換だけを行うため例外を投げません。
 * @example
 * ```ts
 * const response = mapGetInstallationResponse(result);
 * ```
 */
export function mapGetInstallationResponse(
  result: GetIntegrationInstallationResult
): MessageInitShape<typeof GetInstallationResponseSchema> {
  return {
    definition: mapDefinition(result.definition),
    grants: result.grants.map(mapGrant),
    installation: mapInstallation(result.installation),
  };
}

/**
 * ListInstallations の domain result を generated response 初期化値へ変換します。
 *
 * @param result installation view 配列と Agent-scoped page metadata を含む domain result です。
 * @returns `ListInstallationsResponseSchema` に渡せる plain object です。
 * @throws この関数は list result の写像だけを行うため例外を投げません。
 * @example
 * ```ts
 * const response = mapListInstallationsResponse(result);
 * ```
 */
export function mapListInstallationsResponse(
  result: ListIntegrationInstallationsResult
): MessageInitShape<typeof ListInstallationsResponseSchema> {
  return { installations: result.installations.map(mapInstallation), page: mapPage(result.page) };
}

/**
 * CreateAdapterConnection の domain result を generated response 初期化値へ変換します。
 *
 * @param result 作成済み Adapter connection と audit を含む mutation result です。
 * @returns `CreateAdapterConnectionResponseSchema` に渡せる plain object です。
 * @throws この関数は mutation result の写像だけを行うため例外を投げません。
 * @example
 * ```ts
 * const response = mapCreateAdapterConnectionResponse(result);
 * ```
 */
export function mapCreateAdapterConnectionResponse(
  result: AdapterConnectionMutationResult
): MessageInitShape<typeof CreateAdapterConnectionResponseSchema> {
  return { audit: mapAudit(result.audit), connection: mapConnection(result.connection) };
}

/**
 * DeleteAdapterConnection の domain result を generated response 初期化値へ変換します。
 *
 * @param result 削除扱いにした Adapter connection と audit を含む mutation result です。
 * @returns `DeleteAdapterConnectionResponseSchema` に渡せる plain object です。
 * @throws この関数は mutation result の写像だけを行うため例外を投げません。
 * @example
 * ```ts
 * const response = mapDeleteAdapterConnectionResponse(result);
 * ```
 */
export function mapDeleteAdapterConnectionResponse(
  result: AdapterConnectionMutationResult
): MessageInitShape<typeof DeleteAdapterConnectionResponseSchema> {
  return { audit: mapAudit(result.audit), connection: mapConnection(result.connection) };
}

/**
 * ListAdapterConnections の domain result を generated response 初期化値へ変換します。
 *
 * @param result Adapter connection view 配列と page metadata を含む domain result です。
 * @returns `ListAdapterConnectionsResponseSchema` に渡せる plain object です。
 * @throws この関数は list result の写像だけを行うため例外を投げません。
 * @example
 * ```ts
 * const response = mapListAdapterConnectionsResponse(result);
 * ```
 */
export function mapListAdapterConnectionsResponse(
  result: ListAdapterConnectionsResult
): MessageInitShape<typeof ListAdapterConnectionsResponseSchema> {
  return { connections: result.connections.map(mapConnection), page: mapPage(result.page) };
}

/**
 * PublishIntegrationEvent の domain result を generated response 初期化値へ変換します。
 *
 * @param result 受理 Event、Thread、任意の DeliveryContext、model policy、replay 状態を含む result です。
 * @returns `PublishIntegrationEventResponseSchema` に渡せる plain object です。
 * @throws この関数は Provider input を実行せず、domain result の写像だけを行うため例外を投げません。
 * @example
 * ```ts
 * const response = mapPublishIntegrationEventResponse(result);
 * ```
 */
export function mapPublishIntegrationEventResponse(
  result: PublishIntegrationEventResult
): MessageInitShape<typeof PublishIntegrationEventResponseSchema> {
  return {
    deliveryContext: mapDeliveryContext(result.deliveryContext),
    event: mapEvent(result.event),
    replayed: result.replayed,
    requestedModelPolicy:
      result.requestedModelPolicy === undefined
        ? undefined
        : {
            decisionSchemaVersion: result.requestedModelPolicy.decisionSchemaVersion,
            modelId: result.requestedModelPolicy.modelId,
            policyDigest: result.requestedModelPolicy.policyDigest,
            policyRef: result.requestedModelPolicy.policyRef,
            provider: result.requestedModelPolicy.provider,
            safeMetadataRef: mapPayload(result.requestedModelPolicy.safeMetadataRef),
            status: result.requestedModelPolicy.status,
            version: BigInt(result.requestedModelPolicy.version),
          },
    thread: {
      agentId: result.thread.agentId,
      createdAtUnixMs: BigInt(result.thread.createdAtMs),
      currentSectionId: result.thread.currentSectionId,
      lastServedAtUnixMs: optionalBigInt(result.thread.lastServedAtMs),
      latestEventId: result.thread.latestEventId,
      latestRunId: result.thread.latestRunId,
      normalizedThreadKey: result.thread.normalizedThreadKey,
      priority: result.thread.priority,
      status: result.thread.status,
      threadId: result.thread.threadId,
      threadKey: result.thread.threadKey,
      updatedAtUnixMs: BigInt(result.thread.updatedAtMs),
    },
  };
}

/**
 * PublishToolResult の domain result を generated response 初期化値へ変換します。
 *
 * @param result ToolInvocation mutation result と任意の result Event、replay 状態です。
 * @returns `PublishToolResultResponseSchema` に渡せる plain object です。
 * @throws この関数は確定済み Tool result の写像だけを行うため例外を投げません。
 * @example
 * ```ts
 * const response = mapPublishToolResultResponse(result);
 * ```
 */
export function mapPublishToolResultResponse(
  result: ToolInvocationMutationResult
): MessageInitShape<typeof PublishToolResultResponseSchema> {
  return {
    invocation: mapInvocation(result.invocation),
    replayed: result.replayed,
    resultEvent: result.resultEvent === undefined ? undefined : mapEvent(result.resultEvent),
  };
}

/**
 * PublishDeliveryResult の domain result を generated response 初期化値へ変換します。
 *
 * @param result AdapterDelivery 更新結果、resume action、safe metadata、replay 状態を含む result です。
 * @returns `PublishDeliveryResultResponseSchema` に渡せる plain object です。
 * @throws この関数は Delivery result の写像だけを行うため例外を投げません。
 * @example
 * ```ts
 * const response = mapPublishDeliveryResultResponse(result);
 * ```
 */
export function mapPublishDeliveryResultResponse(
  result: PublishIntegrationDeliveryResult
): MessageInitShape<typeof PublishDeliveryResultResponseSchema> {
  return {
    delivery: mapDelivery(result.delivery),
    replayed: result.replayed,
    result: result.result,
    resumeAction: result.resumeAction,
    safeMetadataRef: mapPayload(result.safeMetadataRef),
  };
}

function mapInstallation(installation: IntegrationInstallationView) {
  return {
    agentId: installation.agentId,
    grantSummaryRef: installation.grantSummaryRef,
    installedAtUnixMs: optionalBigInt(installation.installedAtMs),
    installationId: installation.installationId,
    integrationId: installation.integrationId,
    manifestDigestSha256: installation.manifestDigestSha256,
    manifestRef: mapRef(installation.manifestRef),
    providerBaseUrl: installation.providerBaseUrl,
    providerId: installation.providerId,
    publicKeyRef: installation.publicKeyRef,
    schemaVersion: installation.schemaVersion,
    setupInstructionsRef: mapRef(installation.setupInstructionsRef),
    status: installation.status,
    updatedAtUnixMs: optionalBigInt(installation.updatedAtMs),
  };
}

function mapDefinition(definition: IntegrationDefinitionView | undefined) {
  if (definition === undefined) return undefined;
  return {
    adapterCount: definition.adapterCount,
    deliveryCapabilityCount: definition.deliveryCapabilityCount,
    displayName: definition.displayName,
    integrationId: definition.integrationId,
    manifestRef: mapRef(definition.manifestRef),
    providerId: definition.providerId,
    schemaVersion: definition.schemaVersion,
    toolCount: definition.toolCount,
  };
}

function mapGrant(grant: IntegrationGrantView) {
  return {
    agentId: grant.agentId,
    createdAtUnixMs: BigInt(grant.createdAtMs),
    grantId: grant.grantId,
    grantType: grant.grantType,
    installationId: grant.installationId,
    scope: grant.scope,
    status: grant.status,
  };
}

function mapTrustKey(trustKey: InstallationTrustKeyView | undefined) {
  if (trustKey === undefined) return undefined;
  return {
    agentId: trustKey.agentId,
    createdAtUnixMs: BigInt(trustKey.createdAtMs),
    installationId: trustKey.installationId,
    keyId: trustKey.keyId,
    publicKeyRef: trustKey.publicKeyRef,
    revokedAtUnixMs: optionalBigInt(trustKey.revokedAtMs),
    status: trustKey.status,
    trustKeyId: trustKey.trustKeyId,
  };
}

function mapConnection(connection: AdapterConnectionView) {
  return {
    adapterId: connection.adapterId,
    agentId: connection.agentId,
    allowedModelPolicyRefs: [...connection.allowedModelPolicyRefs],
    connectionId: connection.connectionId,
    connectionKey: connection.connectionKey,
    createdAtUnixMs: BigInt(connection.createdAtMs),
    deliveryCapabilityId: connection.deliveryCapabilityId,
    disabledAtUnixMs: optionalBigInt(connection.disabledAtMs),
    externalSubject: connection.externalSubject,
    grantSummaryRef: connection.grantSummaryRef,
    installationId: connection.installationId,
    metadataRef: mapRef(connection.metadataRef),
    modelPolicyGrantRef: mapRef(connection.modelPolicyGrantRef),
    status: connection.status,
  };
}

function mapDeliveryContext(context: DeliveryContextView | undefined) {
  if (context === undefined) return undefined;
  return {
    agentId: context.agentId,
    capability: context.capability,
    connectionId: context.connectionId,
    createdAtUnixMs: BigInt(context.createdAtMs),
    deliveryContextId: context.deliveryContextId,
    eventId: context.eventId,
    expiresAtUnixMs: optionalBigInt(context.expiresAtMs),
    installationId: context.installationId,
    metadataRef: mapRef(context.metadataRef),
    modelPolicyDigest: context.modelPolicyDigest,
    modelPolicyRef: context.modelPolicyRef,
    status: context.status,
    threadId: context.threadId,
  };
}

function mapDelivery(delivery: AdapterDeliveryView | undefined) {
  if (delivery === undefined) return undefined;
  return {
    agentId: delivery.agentId,
    connectionId: delivery.connectionId,
    createdAtUnixMs: BigInt(delivery.createdAtMs),
    deliveryContextId: delivery.deliveryContextId,
    deliveryId: delivery.deliveryId,
    eventId: delivery.eventId,
    idempotencyKey: delivery.idempotencyKey,
    installationId: delivery.installationId,
    providerOperationId: delivery.providerOperationId,
    providerTargetRef: delivery.providerTargetRef,
    requestDigest: mapRawDigest(delivery.requestDigest),
    requestPayload: mapRef(delivery.requestPayloadRef),
    runId: delivery.runId,
    status: delivery.status,
    updatedAtUnixMs: BigInt(delivery.updatedAtMs),
  };
}

function mapInvocation(invocation: ToolInvocationView) {
  return {
    agentId: invocation.agentId,
    approvalId: invocation.approvalId,
    attemptCount: invocation.attemptCount,
    createdAtUnixMs: BigInt(invocation.createdAtMs),
    idempotencyKey: invocation.idempotencyKey,
    inputRef: mapRef(invocation.inputRef),
    installationId: invocation.installationId,
    invocationId: invocation.invocationId,
    outputRef: mapRef(invocation.outputRef),
    providerOperationId: invocation.providerOperationId,
    resultEventId: invocation.resultEventId,
    runId: invocation.runId,
    status: invocation.status,
    threadId: invocation.threadId,
    toolId: invocation.toolId,
    toolSetVersion: String(invocation.toolSetVersion),
    updatedAtUnixMs: BigInt(invocation.updatedAtMs),
  };
}

function mapEvent(event: AgentEventView) {
  return {
    agentId: event.agentId,
    agentSequence: BigInt(event.agentSequence),
    causationId: event.causationId,
    correlationId: event.correlationId,
    deliveryContextId: event.deliveryContextId,
    eventId: event.eventId,
    eventType: event.eventType,
    idempotencyKey: event.idempotencyKey,
    normalizedThreadKey: event.normalizedThreadKey,
    occurredAtUnixMs: BigInt(event.occurredAtMs),
    payloadMetadata: mapPayload(event.payloadMetadata),
    payloadRef: event.payloadRef,
    runId: event.runId,
    sectionId: event.sectionId,
    source: event.source,
    threadId: event.threadId,
    threadKey: event.threadKey,
    threadSequence: BigInt(event.threadSequence),
  };
}

function mapAudit(audit: AgentAuditView | undefined) {
  if (audit === undefined) return undefined;
  return {
    agentId: audit.agentId,
    auditEventId: audit.auditEventId,
    correlationId: audit.correlationId,
    occurredAtUnixMs: BigInt(audit.occurredAtMs),
    operation: audit.operation,
    principalId: audit.principalId,
    result: audit.result,
    safeDetailRef: audit.safeDetailRef,
    systemThreadId: audit.systemThreadId,
  };
}

function mapPage(page: AgentPageView) {
  return {
    cursorScope: page.cursorScope,
    nextPageToken: page.nextPageToken,
    resultCount: page.resultCount,
  };
}

function mapPayload(payload: AgentPayloadMetadataView | undefined) {
  if (payload === undefined) return undefined;
  return {
    byteSize: BigInt(payload.byteSize),
    contentType: payload.contentType,
    inlineBytes: payload.inlineBytes,
    ref: payload.ref,
    sha256: payload.sha256,
    storageClass: payload.storageClass,
  };
}

function mapRef(ref: string | undefined) {
  if (ref === undefined) return undefined;
  return {
    byteSize: 0n,
    contentType: 'application/octet-stream',
    ref,
    sha256: '',
    storageClass: 'reference',
  };
}

function mapRawDigest(digestHex: string | undefined) {
  if (digestHex === undefined) return undefined;
  return { algorithm: 'sha-256', byteLength: 0n, digestHex };
}

function optionalBigInt(value: number | undefined): bigint | undefined {
  return value === undefined ? undefined : BigInt(value);
}
