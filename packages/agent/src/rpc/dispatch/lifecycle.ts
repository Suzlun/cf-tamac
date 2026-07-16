import type {
  DestroyAgentRequest,
  DestroyAgentResponseSchema,
  GetAgentRequest,
  GetAgentResponseSchema,
  InitializeAgentRequest,
  InitializeAgentResponseSchema,
  RotateAgentCredentialRequest,
  RotateAgentCredentialResponseSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { getAIAgentDurableObjectStub } from '../../agent-routing';
import { createAgentCoreContext } from '../command-context';
import {
  mapConfigCommand,
  mapCredentialCommand,
  mapDestroyAgentResponse,
  mapGetAgentResponse,
  mapInitializeAgentResponse,
  mapRotateAgentCredentialResponse,
  requireAgentId,
} from '../mappers/core';
import { mapModelPolicyCommandInput } from '../mappers/model-policies';

import type { AgentWorkerEnv } from '../../env';
import type { MessageInitShape } from '@bufbuild/protobuf';

type InitializeAgentResponseInit = MessageInitShape<typeof InitializeAgentResponseSchema>;
type GetAgentResponseInit = MessageInitShape<typeof GetAgentResponseSchema>;
type DestroyAgentResponseInit = MessageInitShape<typeof DestroyAgentResponseSchema>;
type RotateAgentCredentialResponseInit = MessageInitShape<
  typeof RotateAgentCredentialResponseSchema
>;

/**
 * AgentLifecycleService.InitializeAgent を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った初期表示名、設定、credential policy、model policy です。
 * @returns generated InitializeAgentResponse の初期化値です。
 * @throws Agent ID や idempotency key が不正な場合、または AIAgent 側の認可・永続化で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchInitializeAgent(env, request);
 * ```
 */
export async function dispatchInitializeAgent(
  env: AgentWorkerEnv,
  request: InitializeAgentRequest
): Promise<InitializeAgentResponseInit> {
  // public request body の agent_id を必須化し、1 Agent ID = 1 Durable Object の境界へ閉じます。
  const agentId = requireAgentId(request.agentId);
  // RPC 認証・idempotency・body digest を Durable Object 内の command context へ集約します。
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    idempotencyKey: request.idempotencyKey,
    method: 'InitializeAgent',
    security: request.security,
    service: 'cftamac.agent.v1.AgentLifecycleService',
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).initializeAgent({
    context,
    credential: mapCredentialCommand(agentId, request.credentialPolicy, request.idempotencyKey),
    displayName: request.displayName,
    initialConfig: mapConfigCommand(request.initialConfig),
    initialModelPolicy:
      request.initialModelPolicy === undefined
        ? undefined
        : mapModelPolicyCommandInput(request.initialModelPolicy),
    registrationRequestDigest: request.registrationRequestDigest,
  });
  // Durable Object の domain result を generated RPC response init へ変換します。
  return mapInitializeAgentResponse(result);
}

/**
 * AgentLifecycleService.GetAgent を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った Agent ID です。
 * @returns generated GetAgentResponse の初期化値です。
 * @throws Agent ID が空の場合、または AIAgent 側の参照・認可で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchGetAgent(env, request);
 * ```
 */
export async function dispatchGetAgent(
  env: AgentWorkerEnv,
  request: GetAgentRequest
): Promise<GetAgentResponseInit> {
  // Agent ID のみで Durable Object scope を確定し、Agent-cross な参照にしません。
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'GetAgent',
    service: 'cftamac.agent.v1.AgentLifecycleService',
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).getAgent({ context });
  return mapGetAgentResponse(result);
}

/**
 * AgentLifecycleService.DestroyAgent を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った Agent ID、idempotency key、破棄理由です。
 * @returns generated DestroyAgentResponse の初期化値です。
 * @throws Agent ID や idempotency key が不正な場合、または AIAgent 側の認可・状態遷移で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchDestroyAgent(env, request);
 * ```
 */
export async function dispatchDestroyAgent(
  env: AgentWorkerEnv,
  request: DestroyAgentRequest
): Promise<DestroyAgentResponseInit> {
  // mutation は Agent ID と idempotency key を context 化し、リプレイ防止を Durable Object 側へ伝えます。
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    idempotencyKey: request.idempotencyKey,
    method: 'DestroyAgent',
    security: request.security,
    service: 'cftamac.agent.v1.AgentLifecycleService',
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).destroyAgent({
    context,
    reason: request.reason,
  });
  return mapDestroyAgentResponse(result);
}

/**
 * AgentLifecycleService.RotateAgentCredential を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った credential ID、policy、idempotency key です。
 * @returns generated RotateAgentCredentialResponse の初期化値です。
 * @throws Agent ID や credential 入力が不正な場合、または AIAgent 側の認可・永続化で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchRotateAgentCredential(env, request);
 * ```
 */
export async function dispatchRotateAgentCredential(
  env: AgentWorkerEnv,
  request: RotateAgentCredentialRequest
): Promise<RotateAgentCredentialResponseInit> {
  // Credential rotation も lifecycle service の mutation として同じ認証・idempotency context を使います。
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    idempotencyKey: request.idempotencyKey,
    method: 'RotateAgentCredential',
    security: request.security,
    service: 'cftamac.agent.v1.AgentLifecycleService',
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).rotateAgentCredential({
    context,
    credential: mapCredentialCommand(agentId, request.policy, request.credentialId),
  });
  return mapRotateAgentCredentialResponse(result);
}
