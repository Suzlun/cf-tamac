import { normalizeAdapterConnectionInput } from '../adapters';
import {
  assertAgentContext,
  checkAgentIdempotency,
  recordAgentIdempotency,
  reserveAgentNonce,
} from '../domain/agent-operation-utils';
import { recordLifecycleAudit } from '../domain/lifecycle-audit';

import {
  resolveAndVerifyIntegrationManifest,
  type IntegrationManifestBytesLoader,
  type VerifiedIntegrationManifest,
} from './manifest';
import {
  mapConnectionRow,
  mapDefinitionRow,
  mapGrantRow,
  mapInstallationRow,
  mapTrustKeyRow,
} from './mappers';
import {
  assertInstallationCanCreateConnection,
  assertIntegrationNotInstalled,
  authorizeIntegrationOperation,
  cancelPendingIntegrationInvocations,
  clampPageSize,
  createConnectionCapability,
  createGrantSummaryRef,
  createInstallationCapability,
  createConnectionOperationName,
  deleteConnectionOperationName,
  findDefinitionForInstallation,
  installOperationName,
  normalizeOptionalText,
  parseNumericPageToken,
  persistIntegrationGrants,
  requireAdapterDefinition,
  requireConnection,
  requireInstallation,
  revokeIntegrationGrants,
  revokeIntegrationTools,
  serializeKeyMaterial,
  uninstallOperationName,
  createPage,
} from './operation-shared';

import type { AgentStorageRepositories } from '../storage';
import type {
  AdapterConnectionMutationResult,
  GetIntegrationInstallationQuery,
  GetIntegrationInstallationResult,
  InstallIntegrationCommand,
  InstallIntegrationResult,
  ListAdapterConnectionsQuery,
  ListAdapterConnectionsResult,
  ListIntegrationInstallationsQuery,
  ListIntegrationInstallationsResult,
  UninstallIntegrationCommand,
  UninstallIntegrationResult,
  CreateAdapterConnectionCommand,
  DeleteAdapterConnectionCommand,
} from './types';

/**
 * InstallIntegration を manifest 検証、grant 永続化、Adapter/Tool 登録として処理します。
 *
 * @param input Agent ID、command、repository set を含む操作入力です。
 * @returns Installation、Definition、Grant、TrustKey、audit を含む結果です。
 */
export async function installIntegrationInStore(input: {
  readonly agentId: string;
  readonly command: InstallIntegrationCommand;
  readonly loadManifestBytes?: IntegrationManifestBytesLoader;
  readonly repositories: AgentStorageRepositories;
}): Promise<InstallIntegrationResult> {
  assertAgentContext(input.agentId, input.command.context);
  const replay = checkAgentIdempotency<InstallIntegrationResult>({
    context: input.command.context,
    operationName: installOperationName,
    repositories: input.repositories,
  });
  if (replay.status === 'replay') return { ...replay.response, replayed: true };
  reserveAgentNonce(input.repositories, input.command.context);
  authorizeIntegrationOperation(
    input.repositories,
    input.command.context,
    'integration.install',
    'InstallIntegration',
    'write'
  );
  const manifest = await resolveAndVerifyIntegrationManifest({
    integrationId: input.command.integrationId,
    loadManifestBytes: input.loadManifestBytes,
    manifestPayload: input.command.manifestPayload,
    manifestRef: input.command.manifestRef,
    requestedGrants: input.command.requestedGrants,
  });
  const result = persistInstallIntegrationTransaction(input, manifest);
  recordAgentIdempotency({
    context: input.command.context,
    operationName: installOperationName,
    repositories: input.repositories,
    response: result,
  });
  return result;
}

function persistInstallIntegrationTransaction(
  input: {
    readonly agentId: string;
    readonly command: InstallIntegrationCommand;
    readonly loadManifestBytes?: IntegrationManifestBytesLoader;
    readonly repositories: AgentStorageRepositories;
  },
  manifest: VerifiedIntegrationManifest
): InstallIntegrationResult {
  return input.repositories.transaction((repositories) => {
    assertIntegrationNotInstalled(repositories, manifest.integrationId);
    const installationId = crypto.randomUUID();
    const nowMs = input.command.context.requestedAtMs;
    const finalStatus = manifest.setupRequired ? 'pending_external_setup' : 'active';
    repositories.integrations.insertInstallation({
      grantSummaryRef: createGrantSummaryRef(installationId),
      installationId,
      integrationId: manifest.integrationId,
      manifestDigestSha256: manifest.manifestDigestSha256,
      manifestRef: manifest.manifestRef,
      providerBaseUrl: manifest.providerBaseUrl,
      providerId: manifest.providerId,
      publicKeyRef: manifest.trustKey.publicKeyRef,
      schemaVersion: manifest.schemaVersion,
      setupInstructionsRef: input.command.setupMetadataRef?.ref ?? manifest.setupInstructionsRef,
      status: 'installing',
      updatedAtMs: nowMs,
    });
    const definition = persistIntegrationDefinition(repositories, manifest);
    const trustKey = repositories.integrations.insertTrustKey({
      algorithm: manifest.trustKey.algorithm,
      createdAtMs: nowMs,
      installationId,
      keyId: manifest.trustKey.keyId,
      publicKeyMaterial: serializeKeyMaterial(manifest.trustKey.publicKeyMaterial),
      publicKeyRef: manifest.trustKey.publicKeyRef,
      status: 'active',
      trustKeyId: crypto.randomUUID(),
    });
    persistIntegrationAdapters(repositories, installationId, manifest);
    persistIntegrationTools(repositories, installationId, manifest, finalStatus, nowMs);
    repositories.principals.upsertPrincipal({
      displayName: manifest.displayName,
      nowMs,
      principalId: installationId,
      principalType: 'INTEGRATION_INSTALLATION',
      status: 'active',
    });
    const grants = persistIntegrationGrants(
      repositories,
      installationId,
      input.command.requestedGrants,
      nowMs
    );
    const installation = repositories.integrations.updateInstallationStatus({
      installationId,
      status: finalStatus,
      updatedAtMs: nowMs,
    });
    const audit = recordLifecycleAudit(
      { agentId: input.agentId, command: input.command, repositories },
      'agent.integration.installed',
      finalStatus
    );
    return {
      audit,
      definition: mapDefinitionRow(definition),
      grants: grants.map(mapGrantRow),
      installation: mapInstallationRow(installation),
      replayed: false,
      trustKey: mapTrustKeyRow(trustKey),
    } satisfies InstallIntegrationResult;
  });
}

function persistIntegrationDefinition(
  repositories: AgentStorageRepositories,
  manifest: VerifiedIntegrationManifest
) {
  return repositories.integrations.upsertDefinition({
    adapterCount: manifest.adapters.length,
    deliveryCapabilityCount: manifest.deliveryCapabilityCount,
    displayName: manifest.displayName,
    integrationId: manifest.integrationId,
    manifestRef: manifest.manifestRef,
    providerId: manifest.providerId,
    schemaVersion: manifest.schemaVersion,
    toolCount: manifest.tools.length,
  });
}

function persistIntegrationAdapters(
  repositories: AgentStorageRepositories,
  installationId: string,
  manifest: VerifiedIntegrationManifest
): void {
  for (const adapter of manifest.adapters) {
    repositories.integrations.upsertAdapterDefinition({
      adapterId: adapter.adapterId,
      deliveryCapabilityId: adapter.deliveryCapabilityId,
      displayName: adapter.displayName,
      ingressGrant: adapter.ingressGrant,
      installationId,
      integrationId: manifest.integrationId,
      schemaRef: adapter.schemaRef,
      status: 'active',
    });
  }
}

function persistIntegrationTools(
  repositories: AgentStorageRepositories,
  installationId: string,
  manifest: VerifiedIntegrationManifest,
  finalStatus: 'active' | 'pending_external_setup',
  nowMs: number
): void {
  for (const tool of manifest.tools) {
    repositories.tools.upsertDefinition({
      approvalRequired: tool.approvalRequired,
      cancellationSupported: tool.cancellationSupported,
      createdAtMs: nowMs,
      description: tool.description,
      displayName: tool.displayName,
      inputSchemaRef: tool.inputSchemaRef,
      installationId,
      outputSchemaRef: tool.outputSchemaRef,
      providerTargetRef: tool.providerTargetRef ?? manifest.providerBaseUrl,
      status: finalStatus === 'active' ? 'active' : 'unavailable',
      toolId: tool.toolId,
      toolSetVersion: 0,
      updatedAtMs: nowMs,
      version: tool.version,
    });
  }
}

/** UninstallIntegration を capability cleanup として処理します。 */
export function uninstallIntegrationInStore(input: {
  readonly agentId: string;
  readonly command: UninstallIntegrationCommand;
  readonly repositories: AgentStorageRepositories;
}): UninstallIntegrationResult {
  assertAgentContext(input.agentId, input.command.context);
  const replay = checkAgentIdempotency<UninstallIntegrationResult>({
    context: input.command.context,
    operationName: uninstallOperationName,
    repositories: input.repositories,
  });
  if (replay.status === 'replay') return { ...replay.response, replayed: true };
  reserveAgentNonce(input.repositories, input.command.context);
  const installation = requireInstallation(input.repositories, input.command.installationId);
  authorizeIntegrationOperation(
    input.repositories,
    input.command.context,
    'integration.uninstall',
    'UninstallIntegration',
    'write',
    createInstallationCapability(input.agentId, installation.installationId)
  );
  const result = input.repositories.transaction((repositories) => {
    const nowMs = input.command.context.requestedAtMs;
    repositories.integrations.updateInstallationStatus({
      installationId: installation.installationId,
      status: 'uninstalling',
      updatedAtMs: nowMs,
    });
    const disabledConnections = repositories.integrations.disableAdapterConnectionsByInstallation({
      installationId: installation.installationId,
      nowMs,
      status: 'disabled',
    });
    revokeIntegrationTools(repositories, installation.installationId, nowMs);
    cancelPendingIntegrationInvocations(repositories, installation.installationId, nowMs);
    repositories.schedules.cancelSchedulesByInstallation({
      cancelledAtMs: nowMs,
      cancelledByPrincipalId: input.command.context.principal.principalId,
      installationId: installation.installationId,
      reason: input.command.reason ?? 'integration_uninstalled',
      status: 'cancelled',
    });
    repositories.integrations.revokeDeliveryContextsByInstallation({
      installationId: installation.installationId,
      nowMs,
      status: 'revoked',
    });
    repositories.integrations.revokeTrustKeysByInstallation({
      installationId: installation.installationId,
      nowMs,
    });
    revokeIntegrationGrants(repositories, installation.installationId, nowMs);
    repositories.principals.upsertPrincipal({
      nowMs,
      principalId: installation.installationId,
      principalType: 'INTEGRATION_INSTALLATION',
      status: 'revoked',
    });
    const updated = repositories.integrations.updateInstallationStatus({
      installationId: installation.installationId,
      status: 'uninstalled',
      updatedAtMs: nowMs,
    });
    const audit = recordLifecycleAudit(
      { agentId: input.agentId, command: input.command, repositories },
      'agent.integration.uninstalled',
      'uninstalled'
    );
    return {
      audit,
      disabledConnections: disabledConnections.map(mapConnectionRow),
      installation: mapInstallationRow(updated),
      replayed: false,
    } satisfies UninstallIntegrationResult;
  });
  recordAgentIdempotency({
    context: input.command.context,
    operationName: uninstallOperationName,
    repositories: input.repositories,
    response: result,
  });
  return result;
}

/** Installation 一件を取得します。 */
export function getIntegrationInstallationFromStore(input: {
  readonly agentId: string;
  readonly query: GetIntegrationInstallationQuery;
  readonly repositories: AgentStorageRepositories;
}): GetIntegrationInstallationResult {
  assertAgentContext(input.agentId, input.query.context);
  authorizeIntegrationOperation(
    input.repositories,
    input.query.context,
    'integration.get',
    'GetInstallation',
    'read'
  );
  const installation = requireInstallation(input.repositories, input.query.installationId);
  return {
    definition: mapDefinitionRow(findDefinitionForInstallation(input.repositories, installation)),
    grants: input.repositories.integrations
      .listGrants(installation.installationId)
      .map(mapGrantRow),
    installation: mapInstallationRow(installation),
  };
}

/** Installation 一覧を取得します。 */
export function listIntegrationInstallationsFromStore(input: {
  readonly agentId: string;
  readonly query: ListIntegrationInstallationsQuery;
  readonly repositories: AgentStorageRepositories;
}): ListIntegrationInstallationsResult {
  assertAgentContext(input.agentId, input.query.context);
  authorizeIntegrationOperation(
    input.repositories,
    input.query.context,
    'integration.list',
    'ListInstallations',
    'read'
  );
  const pageSize = clampPageSize(input.query.pageSize);
  const rows = input.repositories.integrations.listInstallations({
    afterUpdatedAtMs: parseNumericPageToken(input.query.pageToken),
    limit: pageSize + 1,
    status: normalizeOptionalText(input.query.status),
  });
  const pageRows = rows.slice(0, pageSize);
  return {
    installations: pageRows.map(mapInstallationRow),
    page: createPage(
      input.agentId,
      'installations',
      pageRows,
      rows.length > pageSize,
      (row) => row.updatedAtMs ?? 0
    ),
  };
}

/** Adapter Connection を作成します。 */
export function createAdapterConnectionInStore(input: {
  readonly agentId: string;
  readonly command: CreateAdapterConnectionCommand;
  readonly repositories: AgentStorageRepositories;
}): AdapterConnectionMutationResult {
  assertAgentContext(input.agentId, input.command.context);
  const replay = checkAgentIdempotency<AdapterConnectionMutationResult>({
    context: input.command.context,
    operationName: createConnectionOperationName,
    repositories: input.repositories,
  });
  if (replay.status === 'replay') return { ...replay.response, replayed: true };
  reserveAgentNonce(input.repositories, input.command.context);
  const installation = requireInstallation(input.repositories, input.command.installationId);
  assertInstallationCanCreateConnection(installation);
  authorizeIntegrationOperation(
    input.repositories,
    input.command.context,
    'integration.connection.create',
    'CreateAdapterConnection',
    'write',
    createInstallationCapability(input.agentId, installation.installationId)
  );
  const normalized = normalizeAdapterConnectionInput(input.command);
  const adapter = requireAdapterDefinition(
    input.repositories,
    installation.installationId,
    normalized.adapterId
  );
  const result = input.repositories.transaction((repositories) => {
    const row = repositories.integrations.createAdapterConnection({
      adapterId: adapter.adapterId,
      connectionId: crypto.randomUUID(),
      connectionKey: normalized.connectionKey,
      createdAtMs: input.command.context.requestedAtMs,
      deliveryCapabilityId: adapter.deliveryCapabilityId ?? undefined,
      externalSubject: normalized.externalSubject,
      grantSummaryRef: createGrantSummaryRef(installation.installationId),
      installationId: installation.installationId,
      metadataRef: normalized.metadataRef,
      status: 'active',
    });
    const audit = recordLifecycleAudit(
      { agentId: input.agentId, command: input.command, repositories },
      'agent.integration.connection.created',
      'active'
    );
    return { audit, connection: mapConnectionRow(row), replayed: false };
  });
  recordAgentIdempotency({
    context: input.command.context,
    operationName: createConnectionOperationName,
    repositories: input.repositories,
    response: result,
  });
  return result;
}

/** Adapter Connection を無効化します。 */
export function deleteAdapterConnectionInStore(input: {
  readonly agentId: string;
  readonly command: DeleteAdapterConnectionCommand;
  readonly repositories: AgentStorageRepositories;
}): AdapterConnectionMutationResult {
  assertAgentContext(input.agentId, input.command.context);
  const replay = checkAgentIdempotency<AdapterConnectionMutationResult>({
    context: input.command.context,
    operationName: deleteConnectionOperationName,
    repositories: input.repositories,
  });
  if (replay.status === 'replay') return { ...replay.response, replayed: true };
  reserveAgentNonce(input.repositories, input.command.context);
  const connection = requireConnection(input.repositories, input.command.connectionId);
  authorizeIntegrationOperation(
    input.repositories,
    input.command.context,
    'integration.connection.delete',
    'DeleteAdapterConnection',
    'write',
    createConnectionCapability(input.agentId, connection)
  );
  const result = input.repositories.transaction((repositories) => {
    const row = repositories.integrations.updateConnectionStatus({
      connectionId: connection.connectionId,
      disabledAtMs: input.command.context.requestedAtMs,
      status: 'disabled',
    });
    const audit = recordLifecycleAudit(
      { agentId: input.agentId, command: input.command, repositories },
      'agent.integration.connection.disabled',
      'disabled'
    );
    return { audit, connection: mapConnectionRow(row), replayed: false };
  });
  recordAgentIdempotency({
    context: input.command.context,
    operationName: deleteConnectionOperationName,
    repositories: input.repositories,
    response: result,
  });
  return result;
}

/** Adapter Connection 一覧を取得します。 */
export function listAdapterConnectionsFromStore(input: {
  readonly agentId: string;
  readonly query: ListAdapterConnectionsQuery;
  readonly repositories: AgentStorageRepositories;
}): ListAdapterConnectionsResult {
  assertAgentContext(input.agentId, input.query.context);
  authorizeIntegrationOperation(
    input.repositories,
    input.query.context,
    'integration.connection.list',
    'ListAdapterConnections',
    'read'
  );
  const pageSize = clampPageSize(input.query.pageSize);
  const rows = input.repositories.integrations.listConnections({
    adapterId: normalizeOptionalText(input.query.adapterId),
    afterCreatedAtMs: parseNumericPageToken(input.query.pageToken),
    installationId: normalizeOptionalText(input.query.installationId),
    limit: pageSize + 1,
    status: normalizeOptionalText(input.query.status),
  });
  const pageRows = rows.slice(0, pageSize);
  return {
    connections: pageRows.map(mapConnectionRow),
    page: createPage(
      input.agentId,
      'adapter-connections',
      pageRows,
      rows.length > pageSize,
      (row) => row.createdAtMs
    ),
  };
}

export {
  deliverToIntegrationProvider,
  publishIntegrationDeliveryResultInStore,
  publishIntegrationEventInStore,
  publishIntegrationToolResultInStore,
} from './operations-ingress-delivery';
