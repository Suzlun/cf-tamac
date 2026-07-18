import { normalizeAdapterConnectionInput } from '../adapters';
import {
  assertAgentContext,
  checkAgentIdempotency,
  recordAgentIdempotency,
  reserveAgentNonce,
} from '../domain/agent-operation-utils';
import { recordLifecycleAudit } from '../domain/lifecycle-audit';

import { mapConnectionRow } from './mappers';
import {
  assertInstallationCanCreateConnection,
  authorizeIntegrationOperation,
  clampPageSize,
  createConnectionCapability,
  createConnectionOperationName,
  createGrantSummaryRef,
  createInstallationCapability,
  createPage,
  deleteConnectionOperationName,
  normalizeOptionalText,
  parseNumericPageToken,
  requireAdapterDefinition,
  requireConnection,
  requireInstallation,
} from './operation-shared';

import type { AgentStorageRepositories } from '../storage';
import type {
  AdapterConnectionMutationResult,
  CreateAdapterConnectionCommand,
  DeleteAdapterConnectionCommand,
  ListAdapterConnectionsQuery,
  ListAdapterConnectionsResult,
} from './types';

/**
 * Adapter Connection を冪等 command として作成し、作成 audit を保存します。
 *
 * @param input Agent ID、CreateAdapterConnection command、Agent-owned repository set です。
 * @returns 作成済み connection view、audit、idempotency replay 状態を含む mutation result です。
 * @throws Agent context、nonce、authorization、installation/adapter 前提条件、repository 操作が失敗した場合に発生します。
 * @example
 * ```ts
 * const result = createAdapterConnectionInStore({ agentId, command, repositories });
 * ```
 */
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
      allowedModelPolicyRefs: deserializePolicyRefList(adapter.allowedModelPolicyRefs),
      connectionId: crypto.randomUUID(),
      connectionKey: normalized.connectionKey,
      createdAtMs: input.command.context.requestedAtMs,
      deliveryCapabilityId: adapter.deliveryCapabilityId ?? undefined,
      externalSubject: normalized.externalSubject,
      grantSummaryRef: createGrantSummaryRef(installation.installationId),
      installationId: installation.installationId,
      metadataRef: normalized.metadataRef,
      modelPolicyGrantRef:
        adapter.modelPolicyGrantRef ?? createGrantSummaryRef(installation.installationId),
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

function deserializePolicyRefList(value: string | null): readonly string[] {
  // Adapter row には JSON 文字列で保存されるため、Connection 作成時に policy ref 配列へ戻す。
  if (value === null || value === '') return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === 'string' && entry !== '');
  } catch {
    return [];
  }
}

/**
 * Adapter Connection を disabled 状態へ遷移させ、削除扱いの audit を保存します。
 *
 * @param input Agent ID、DeleteAdapterConnection command、Agent-owned repository set です。
 * @returns 更新済み connection view、audit、idempotency replay 状態を含む mutation result です。
 * @throws Agent context、nonce、authorization、connection lookup、repository 操作が失敗した場合に発生します。
 * @example
 * ```ts
 * const result = deleteAdapterConnectionInStore({ agentId, command, repositories });
 * ```
 */
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

/**
 * Adapter Connection 一覧を Agent scope と filter/page 条件に従って取得します。
 *
 * @param input Agent ID、ListAdapterConnections query、Agent-owned repository set です。
 * @returns connection view 配列と cursor page metadata を含む list result です。
 * @throws Agent context、authorization、page token、repository 読み取りが失敗した場合に発生します。
 * @example
 * ```ts
 * const result = listAdapterConnectionsFromStore({ agentId, query, repositories });
 * ```
 */
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
