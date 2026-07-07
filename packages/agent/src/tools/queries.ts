import { assertAgentContext } from '../domain/agent-operation-utils';

import { assembleToolCatalog } from './catalog';
import { authorizeToolOperation } from './operation-authorization';
import { requireInvocation } from './operation-guards';
import { createInvocationResult, mapInvocationRow } from './operation-mappers';
import {
  assertCursorScope,
  clampPageSize,
  createInvocationCursorScope,
  createInvocationPage,
  normalizeOptional,
  parseInvocationPageToken,
} from './operation-pagination';

import type { AgentStorageRepositories } from '../storage';
import type {
  GetToolInvocationQuery,
  GetToolInvocationResult,
  ListAgentToolsQuery,
  ListAgentToolsResult,
  ListToolInvocationsQuery,
  ListToolInvocationsResult,
} from './operation-types';

/**
 * ListTools を Agent-owned Tool catalog から処理します。
 *
 * @param input Agent ID、ListTools query、Agent-owned repository set です。
 * @returns Tool catalog view 配列、tool set version、page metadata を含む list result です。
 * @throws Agent context、authorization、catalog assembly、repository 読み取りが失敗した場合に発生します。
 * @example
 * ```ts
 * const result = await listToolsFromStore({ agentId, query, repositories });
 * ```
 */
export async function listToolsFromStore(input: {
  readonly agentId: string;
  readonly query: ListAgentToolsQuery;
  readonly repositories: AgentStorageRepositories;
}): Promise<ListAgentToolsResult> {
  assertAgentContext(input.agentId, input.query.context);
  authorizeToolOperation(
    input.repositories,
    input.query.context,
    'tool.catalog.list',
    'ListTools',
    'read'
  );
  const pageSize = clampPageSize(input.query.pageSize);
  const catalog = await assembleToolCatalog({
    agentId: input.agentId,
    includeUnavailable: input.query.includeUnavailable,
    installationId: normalizeOptional(input.query.installationId),
    nowMs: input.query.context.requestedAtMs,
    repositories: input.repositories,
  });
  return {
    page: {
      cursorScope: `${input.agentId}:tools`,
      resultCount: Math.min(catalog.tools.length, pageSize),
    },
    tools: catalog.tools.slice(0, pageSize),
    toolSetVersion: catalog.toolSetVersion,
  };
}

/**
 * GetInvocation を Agent-owned storage から処理します。
 *
 * @param input Agent ID、GetInvocation query、Agent-owned repository set です。
 * @returns ToolInvocation、approval、Provider operation を含む取得 result です。
 * @throws Agent context、authorization、invocation lookup、repository 読み取りが失敗した場合に発生します。
 * @example
 * ```ts
 * const result = getToolInvocationFromStore({ agentId, query, repositories });
 * ```
 */
export function getToolInvocationFromStore(input: {
  readonly agentId: string;
  readonly query: GetToolInvocationQuery;
  readonly repositories: AgentStorageRepositories;
}): GetToolInvocationResult {
  assertAgentContext(input.agentId, input.query.context);
  authorizeToolOperation(
    input.repositories,
    input.query.context,
    'tool.invocation.get',
    'GetInvocation',
    'read'
  );
  return createInvocationResult(
    input.agentId,
    input.repositories,
    requireInvocation(input.repositories, input.query.invocationId)
  );
}

/**
 * ListInvocations を Agent scope と cursor scope に従って処理します。
 *
 * @param input Agent ID、ListInvocations query、Agent-owned repository set です。
 * @returns ToolInvocation view 配列と cursor page metadata を含む list result です。
 * @throws Agent context、authorization、cursor scope/page token、repository 読み取りが失敗した場合に発生します。
 * @example
 * ```ts
 * const result = listToolInvocationsFromStore({ agentId, query, repositories });
 * ```
 */
export function listToolInvocationsFromStore(input: {
  readonly agentId: string;
  readonly query: ListToolInvocationsQuery;
  readonly repositories: AgentStorageRepositories;
}): ListToolInvocationsResult {
  assertAgentContext(input.agentId, input.query.context);
  authorizeToolOperation(
    input.repositories,
    input.query.context,
    'tool.invocation.list',
    'ListInvocations',
    'read'
  );
  const cursorScope = createInvocationCursorScope(input.agentId, input.query);
  assertCursorScope(input.query.pageCursorScope, cursorScope);
  const pageSize = clampPageSize(input.query.pageSize);
  const rows = input.repositories.tools.listInvocations({
    ...parseInvocationPageToken(input.query.pageToken),
    installationId: normalizeOptional(input.query.installationId),
    limit: pageSize + 1,
    runId: normalizeOptional(input.query.runId),
    status: normalizeOptional(input.query.status),
    threadId: normalizeOptional(input.query.threadId),
  });
  const pageRows = rows.slice(0, pageSize);
  return {
    invocations: pageRows.map((row) => mapInvocationRow(input.agentId, row)),
    page: createInvocationPage(cursorScope, pageRows, rows.length > pageSize),
  };
}
