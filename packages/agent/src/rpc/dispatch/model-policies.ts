import type {
  ArchiveModelPolicyRequest,
  ArchiveModelPolicyResponseSchema,
  GetModelPolicyRequest,
  GetModelPolicyResponseSchema,
  ListModelPoliciesRequest,
  ListModelPoliciesResponseSchema,
  UpsertModelPolicyRequest,
  UpsertModelPolicyResponseSchema,
  ValidateModelPolicyRequest,
  ValidateModelPolicyResponseSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { getAIAgentDurableObjectStub } from '../../agent-routing';
import { createAgentCoreContext } from '../command-context';
import { requireAgentId } from '../mappers/core';
import {
  mapArchiveModelPolicyResponse,
  mapGetModelPolicyResponse,
  mapListModelPoliciesResponse,
  mapModelPolicyCommandInput,
  mapUpsertModelPolicyResponse,
  mapValidateModelPolicyResponse,
} from '../mappers/model-policies';

import type { AgentWorkerEnv } from '../../env';
import type { MessageInitShape } from '@bufbuild/protobuf';

type UpsertModelPolicyResponseInit = MessageInitShape<typeof UpsertModelPolicyResponseSchema>;
type GetModelPolicyResponseInit = MessageInitShape<typeof GetModelPolicyResponseSchema>;
type ListModelPoliciesResponseInit = MessageInitShape<typeof ListModelPoliciesResponseSchema>;
type ArchiveModelPolicyResponseInit = MessageInitShape<typeof ArchiveModelPolicyResponseSchema>;
type ValidateModelPolicyResponseInit = MessageInitShape<typeof ValidateModelPolicyResponseSchema>;

const modelPolicyService = 'cftamac.agent.v1.AgentModelPolicyService';

/**
 * AgentModelPolicyService.UpsertModelPolicy を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った model policy、idempotency key、security metadata です。
 * @returns generated UpsertModelPolicyResponse の初期化値です。
 * @throws Agent ID、policy 入力、idempotency key、final authorization、永続化のいずれかが不正な場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchUpsertModelPolicy(env, request);
 * ```
 */
export async function dispatchUpsertModelPolicy(
  env: AgentWorkerEnv,
  request: UpsertModelPolicyRequest
): Promise<UpsertModelPolicyResponseInit> {
  // Model policy mutation は Agent ID scope を必須化し、policy repository を AIAgent Durable Object 内に閉じます。
  const agentId = requireAgentId(request.agentId);
  // idempotency key と security metadata を context 化し、認可と replay 判定を Durable Object 側へ渡します。
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    idempotencyKey: request.idempotencyKey,
    method: 'UpsertModelPolicy',
    security: request.security,
    service: modelPolicyService,
  });
  // generated policy DTO は mapper で domain command 入力へ変換してから DO method へ渡します。
  const result = await getAIAgentDurableObjectStub(env, agentId).upsertModelPolicy({
    context,
    policy: mapModelPolicyCommandInput(request.policy),
  });
  // Upsert result を generated RPC response init へ変換します。
  return mapUpsertModelPolicyResponse(result);
}

/**
 * AgentModelPolicyService.GetModelPolicy を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った Agent scope と policy ref です。
 * @returns generated GetModelPolicyResponse の初期化値です。
 * @throws Agent ID や policy ref が不正な場合、または AIAgent 側の参照・認可で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchGetModelPolicy(env, request);
 * ```
 */
export async function dispatchGetModelPolicy(
  env: AgentWorkerEnv,
  request: GetModelPolicyRequest
): Promise<GetModelPolicyResponseInit> {
  // Policy 参照は Agent-owned model policy repository に限定し、Agent 横断 lookup を作りません。
  const agentId = requireAgentId(request.agentId);
  // query request も service/method と digest seed を context 化し、監査情報を揃えます。
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'GetModelPolicy',
    service: modelPolicyService,
  });
  // Durable Object public method の getModelPolicy に policy ref だけを渡します。
  const result = await getAIAgentDurableObjectStub(env, agentId).getModelPolicy({
    context,
    policyRef: request.policyRef,
  });
  // Policy domain result を generated RPC response init へ変換します。
  return mapGetModelPolicyResponse(result);
}

/**
 * AgentModelPolicyService.ListModelPolicies を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った status/page filter です。
 * @returns generated ListModelPoliciesResponse の初期化値です。
 * @throws pagination cursor scope が filter と一致しない場合、または AIAgent 側の参照・認可で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchListModelPolicies(env, request);
 * ```
 */
export async function dispatchListModelPolicies(
  env: AgentWorkerEnv,
  request: ListModelPoliciesRequest
): Promise<ListModelPoliciesResponseInit> {
  // List query は Agent ID scope の policy repository だけを対象にし、横断検索を導入しません。
  const agentId = requireAgentId(request.agentId);
  // filter と pagination を含む request digest を context 化し、cursor 監査を可能にします。
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'ListModelPolicies',
    service: modelPolicyService,
  });
  // Durable Object public method の listModelPolicies へ generated request filter を渡します。
  const result = await getAIAgentDurableObjectStub(env, agentId).listModelPolicies({
    context,
    pageCursorScope: request.page?.cursorScope,
    pageSize: request.page?.pageSize,
    pageToken: request.page?.pageToken,
    status: request.status,
  });
  // Policy page result を generated RPC response init へ変換します。
  return mapListModelPoliciesResponse(result);
}

/**
 * AgentModelPolicyService.ArchiveModelPolicy を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った policy ref、idempotency key、archive reason です。
 * @returns generated ArchiveModelPolicyResponse の初期化値です。
 * @throws Agent ID、policy ref、idempotency key、final authorization、状態遷移のいずれかが不正な場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchArchiveModelPolicy(env, request);
 * ```
 */
export async function dispatchArchiveModelPolicy(
  env: AgentWorkerEnv,
  request: ArchiveModelPolicyRequest
): Promise<ArchiveModelPolicyResponseInit> {
  // Archive mutation は Agent ID と idempotency key を必須の command context として扱います。
  const agentId = requireAgentId(request.agentId);
  // security metadata を context に含め、final authorization と audit を Durable Object 側で実施します。
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    idempotencyKey: request.idempotencyKey,
    method: 'ArchiveModelPolicy',
    security: request.security,
    service: modelPolicyService,
  });
  // Durable Object public method の archiveModelPolicy へ policy ref と reason を渡します。
  const result = await getAIAgentDurableObjectStub(env, agentId).archiveModelPolicy({
    context,
    policyRef: request.policyRef,
    reason: request.reason,
  });
  // Archive result を generated RPC response init へ変換します。
  return mapArchiveModelPolicyResponse(result);
}

/**
 * AgentModelPolicyService.ValidateModelPolicy を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った検証対象 model policy と security metadata です。
 * @returns generated ValidateModelPolicyResponse の初期化値です。
 * @throws Agent ID や policy 入力が不正な場合、または AIAgent 側の検証・認可で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchValidateModelPolicy(env, request);
 * ```
 */
export async function dispatchValidateModelPolicy(
  env: AgentWorkerEnv,
  request: ValidateModelPolicyRequest
): Promise<ValidateModelPolicyResponseInit> {
  // Validate は永続化しない検証 RPC ですが、Agent ID scope と security metadata は同じく必須にします。
  const agentId = requireAgentId(request.agentId);
  // request digest と method 名を context に固定し、validation audit の入力を揃えます。
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'ValidateModelPolicy',
    security: request.security,
    service: modelPolicyService,
  });
  // generated policy DTO を domain command 入力へ変換し、AIAgent の validateModelPolicy method へ渡します。
  const result = await getAIAgentDurableObjectStub(env, agentId).validateModelPolicy({
    context,
    policy: mapModelPolicyCommandInput(request.policy),
  });
  // Validation result を generated RPC response init へ変換します。
  return mapValidateModelPolicyResponse(result);
}
