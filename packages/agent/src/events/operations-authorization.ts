import { authorizeAgentOperation } from '../domain/agent-operation-utils';

import type { AgentCoreRequestContext } from '../domain/agent-core';
import type { AgentStorageRepositories } from '../storage';

/**
 * Agent Event 操作に共通する最終認可を実行します。
 *
 * @param repositories Agent Durable Object 内の保存領域へアクセスする repository 群です。
 * @param context 呼び出し元 principal、scope、digest、時刻を含む操作コンテキストです。
 * @param action 監査と grant 判定で利用する Event 操作名です。
 * @param method RPC method 名に対応する操作名です。
 * @returns 認可に成功した場合は値を返さず、呼び出し元の Event operation を継続させます。
 * @throws AgentDomainError principal 種別、scope、grant、credential 状態が操作要件を満たさない場合に送出します。
 * @example
 * ```ts
 * authorizeEventOperation(repositories, context, 'event.publish', 'PublishEvent');
 * ```
 */
export function authorizeEventOperation(
  repositories: AgentStorageRepositories,
  context: AgentCoreRequestContext,
  action: string,
  method: string
): void {
  authorizeAgentOperation({
    action,
    context,
    method,
    repositories,
    requiredPrincipalTypes: [
      'CLIENT_SERVICE',
      'ADMIN_OPERATOR',
      'INTERNAL_SERVICE',
      'INTEGRATION_INSTALLATION',
    ],
    requiredScopes: ['agent.rpc', 'agent.event'],
    service: 'cftamac.agent.v1.AgentEventService',
  });
}
