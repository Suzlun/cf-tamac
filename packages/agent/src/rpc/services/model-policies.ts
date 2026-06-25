import { type ServiceImpl } from '@connectrpc/connect';

import { type AgentModelPolicyService } from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import {
  dispatchArchiveModelPolicy,
  dispatchGetModelPolicy,
  dispatchListModelPolicies,
  dispatchUpsertModelPolicy,
  dispatchValidateModelPolicy,
} from '../model-policy-do-router';

import type { AgentWorkerEnv } from '../../env';

/**
 * Agent model policy RPC service を Connect router に登録するための handler 群を作成します。
 *
 * @param env Agent Worker env です。handler は env から AIAgent Durable Object へ routing し、
 * Agent-owned storage 上の policy repository だけを操作します。
 *
 * @returns `AgentModelPolicyService` の全 unary method を持つ Connect service 実装です。
 * @throws AgentDomainError/ConnectError 認証、認可、validation、routing 失敗時に安全な error へ変換されます。
 *
 * @example
 * ```ts
 * router.service(AgentModelPolicyService, createAgentModelPolicyService(env));
 * ```
 */
export function createAgentModelPolicyService(
  env: AgentWorkerEnv
): Partial<ServiceImpl<typeof AgentModelPolicyService>> {
  return {
    archiveModelPolicy(request) {
      return dispatchArchiveModelPolicy(env, request);
    },
    getModelPolicy(request) {
      return dispatchGetModelPolicy(env, request);
    },
    listModelPolicies(request) {
      return dispatchListModelPolicies(env, request);
    },
    upsertModelPolicy(request) {
      return dispatchUpsertModelPolicy(env, request);
    },
    validateModelPolicy(request) {
      return dispatchValidateModelPolicy(env, request);
    },
  };
}
