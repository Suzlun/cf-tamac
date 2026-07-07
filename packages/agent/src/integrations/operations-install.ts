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
import { mapDefinitionRow, mapGrantRow, mapInstallationRow, mapTrustKeyRow } from './mappers';
import {
  assertIntegrationNotInstalled,
  authorizeIntegrationOperation,
  createGrantSummaryRef,
  installOperationName,
  persistIntegrationGrants,
  serializeKeyMaterial,
} from './operation-shared';

import type { AgentStorageRepositories } from '../storage';
import type { InstallIntegrationCommand, InstallIntegrationResult } from './types';

/**
 * InstallIntegration を manifest 検証、grant 永続化、Adapter/Tool 登録として処理します。
 *
 * @param input Agent ID、command、repository set を含む操作入力です。
 * @returns Installation、Definition、Grant、TrustKey、audit を含む結果です。
 * @throws Agent context、nonce、authorization、manifest 検証、既存 installation 検査、repository transaction が失敗した場合に発生します。
 * @example
 * ```ts
 * const result = await installIntegrationInStore({ agentId, command, repositories });
 * ```
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
      allowedModelPolicyRefs: manifest.allowedModelPolicyRefs,
      grantSummaryRef: createGrantSummaryRef(installationId),
      installationId,
      integrationId: manifest.integrationId,
      manifestDigestSha256: manifest.manifestDigestSha256,
      manifestRef: manifest.manifestRef,
      modelPolicyGrantRef: createGrantSummaryRef(installationId),
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
    const allowedModelPolicyRefs =
      adapter.allowedModelPolicyRefs.length === 0
        ? manifest.allowedModelPolicyRefs
        : adapter.allowedModelPolicyRefs;
    repositories.integrations.upsertAdapterDefinition({
      allowedModelPolicyRefs,
      adapterId: adapter.adapterId,
      deliveryCapabilityId: adapter.deliveryCapabilityId,
      displayName: adapter.displayName,
      ingressGrant: adapter.ingressGrant,
      installationId,
      integrationId: manifest.integrationId,
      modelPolicyGrantRef: adapter.modelPolicyGrantRef ?? createGrantSummaryRef(installationId),
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
