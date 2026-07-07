import { authorizeAgentOperation } from '../domain/agent-operation-utils';
import { createAgentDomainError } from '../domain/errors';

import type { AgentCoreRequestContext } from '../domain';
import type { AgentRunRow, AgentStorageRepositories } from '../storage';

const runServiceName = 'cftamac.agent.v1.AgentRunService';

/**
 * Run 操作で共通利用する Agent-local 認可を実行します。
 *
 * @param repositories Principal・scope・grant を解決する Agent-owned repository 群です。
 * @param context Agent ID、Principal、request digest などを含む要求 context です。
 * @param action audit/grant 判定で使う Run 操作 action 名です。
 * @param method RPC service 上の method 名です。
 * @param mode read 操作か cancel 操作かを示し、必要 scope を決定します。
 * @returns 認可に成功した場合は値を返さず、呼び出し元の Run operation を継続させます。
 * @throws Principal 種別または scope が不足する場合は Agent domain error を送出します。
 *
 * @example
 * ```ts
 * authorizeRunOperation(repositories, context, 'run.get', 'GetRun', 'read');
 * ```
 */
export function authorizeRunOperation(
  repositories: AgentStorageRepositories,
  context: AgentCoreRequestContext,
  action: string,
  method: string,
  mode: 'cancel' | 'read'
): void {
  authorizeAgentOperation({
    action,
    context,
    method,
    repositories,
    requiredPrincipalTypes: ['CLIENT_SERVICE', 'ADMIN_OPERATOR', 'INTERNAL_SERVICE'],
    requiredScopes: mode === 'read' ? ['agent.rpc', 'agent.read'] : ['agent.rpc', 'agent.run'],
    service: runServiceName,
  });
}

/**
 * Run ID を検証して Agent-owned pending run store から 1 件の Run を取得します。
 *
 * @param repositories Run ledger を所有する Agent storage repository 群です。
 * @param runId 取得対象の AgentRun ID です。空白のみの値は検証エラーです。
 * @returns store に存在する AgentRun row を返します。
 * @throws `runId` が空の場合は validation error、該当 Run がない場合は not_found error を送出します。
 *
 * @example
 * ```ts
 * const run = requireRun(repositories, query.runId);
 * ```
 */
export function requireRun(repositories: AgentStorageRepositories, runId: string): AgentRunRow {
  if (runId.trim() === '') {
    throw createAgentDomainError({ kind: 'validation', message: 'run_id must not be empty.' });
  }
  const run = repositories.pendingRuns.findRunById(runId);
  if (run === undefined) {
    throw createAgentDomainError({ kind: 'not_found', message: 'Agent Run not found.' });
  }
  return run;
}
