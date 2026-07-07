import { assertAgentContext } from '../domain/agent-operation-utils';

import { mapDefinitionRow, mapGrantRow, mapInstallationRow } from './mappers';
import {
  authorizeIntegrationOperation,
  clampPageSize,
  createPage,
  findDefinitionForInstallation,
  normalizeOptionalText,
  parseNumericPageToken,
  requireInstallation,
} from './operation-shared';

import type { AgentStorageRepositories } from '../storage';
import type {
  GetIntegrationInstallationQuery,
  GetIntegrationInstallationResult,
  ListIntegrationInstallationsQuery,
  ListIntegrationInstallationsResult,
} from './types';

/**
 * Installation 一件を Agent-owned storage から取得します。
 *
 * @param input Agent ID、GetInstallation query、Agent-owned repository set です。
 * @returns installation、definition、grant view を含む取得 result です。
 * @throws Agent context、authorization、installation lookup、repository 読み取りが失敗した場合に発生します。
 * @example
 * ```ts
 * const result = getIntegrationInstallationFromStore({ agentId, query, repositories });
 * ```
 */
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

/**
 * Installation 一覧を Agent scope と page/filter 条件に従って取得します。
 *
 * @param input Agent ID、ListInstallations query、Agent-owned repository set です。
 * @returns installation view 配列と cursor page metadata を含む list result です。
 * @throws Agent context、authorization、page token、repository 読み取りが失敗した場合に発生します。
 * @example
 * ```ts
 * const result = listIntegrationInstallationsFromStore({ agentId, query, repositories });
 * ```
 */
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
