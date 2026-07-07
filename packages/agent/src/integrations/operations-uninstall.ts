import {
  assertAgentContext,
  checkAgentIdempotency,
  recordAgentIdempotency,
  reserveAgentNonce,
} from '../domain/agent-operation-utils';
import { recordLifecycleAudit } from '../domain/lifecycle-audit';

import { mapConnectionRow, mapInstallationRow } from './mappers';
import {
  authorizeIntegrationOperation,
  cancelPendingIntegrationInvocations,
  createInstallationCapability,
  requireInstallation,
  revokeIntegrationGrants,
  revokeIntegrationTools,
  uninstallOperationName,
} from './operation-shared';

import type { AgentStorageRepositories } from '../storage';
import type { UninstallIntegrationCommand, UninstallIntegrationResult } from './types';

/**
 * UninstallIntegration を capability cleanup として冪等に処理します。
 *
 * @param input Agent ID、UninstallIntegration command、Agent-owned repository set です。
 * @returns uninstalled installation、disabled connection 一覧、audit、idempotency replay 状態を含む result です。
 * @throws Agent context、nonce、authorization、installation lookup、repository transaction が失敗した場合に発生します。
 * @example
 * ```ts
 * const result = uninstallIntegrationInStore({ agentId, command, repositories });
 * ```
 */
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
