import { authorizeAgentOperation } from '../domain/agent-operation-utils';

import { toolOperationNames } from './operation-names';

import type { AgentCoreRequestContext } from '../domain';
import type { AgentStorageRepositories } from '../storage';

/**
 * Tool 操作の authorization policy 分岐を表す内部 mode です。
 *
 * @remarks
 * 読み取り、作成/実行、承認、Provider 操作、Provider result callback のそれぞれで
 * required grants・principal type・scope が異なるため、呼び出し側は mode だけを渡します。
 */
export type ToolAuthorizationMode = 'approve' | 'invoke' | 'provider' | 'read' | 'result';

/**
 * Tool 操作に共通する Agent authorization を実行します。
 *
 * @param repositories Agent-owned storage repository set です。
 * @param context 検証済み Agent request context です。
 * @param action 監査・認可で使う action 名です。
 * @param method 呼び出し元 RPC/Provider method 名です。
 * @param mode Tool 操作種別に応じた認可 policy selector です。
 * @param capability Tool/installation scope の grant 照合に使う capability です。
 * @returns 認可に成功した場合は値を返さず、呼び出し元の処理を継続させます。
 * @throws 認可条件を満たさない場合は Agent domain authorization error を投げます。
 * @example
 * ```ts
 * authorizeToolOperation(repositories, context, 'tool.invocation.get', 'GetInvocation', 'read');
 * ```
 */
export function authorizeToolOperation(
  repositories: AgentStorageRepositories,
  context: AgentCoreRequestContext,
  action: string,
  method: string,
  mode: ToolAuthorizationMode,
  capability?: Parameters<typeof authorizeAgentOperation>[0]['capability']
): void {
  authorizeAgentOperation({
    action,
    capability,
    context,
    method,
    repositories,
    requiredGrants: mode === 'result' ? ['integration.tool.result'] : ['agent.tool'],
    requiredPrincipalTypes:
      mode === 'result'
        ? ['INTEGRATION_INSTALLATION', 'INTERNAL_SERVICE']
        : ['CLIENT_SERVICE', 'ADMIN_OPERATOR', 'INTERNAL_SERVICE'],
    requiredScopes:
      mode === 'read'
        ? ['agent.rpc', 'agent.read']
        : mode === 'approve'
          ? ['agent.rpc', 'agent.tool.approve']
          : ['agent.rpc', 'agent.tool'],
    service:
      mode === 'result'
        ? toolOperationNames.integrationIngressService
        : toolOperationNames.toolService,
  });
}
