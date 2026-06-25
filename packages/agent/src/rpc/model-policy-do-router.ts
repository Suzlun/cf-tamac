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

import { getAIAgentDurableObjectStub } from '../agent-routing';

import { createAgentCoreContext } from './command-context';
import { requireAgentId } from './message-mappers';
import {
  mapArchiveModelPolicyResponse,
  mapGetModelPolicyResponse,
  mapListModelPoliciesResponse,
  mapModelPolicyCommandInput,
  mapUpsertModelPolicyResponse,
  mapValidateModelPolicyResponse,
} from './model-policy-message-mappers';

import type { AgentWorkerEnv } from '../env';
import type { MessageInitShape } from '@bufbuild/protobuf';

type UpsertModelPolicyResponseInit = MessageInitShape<typeof UpsertModelPolicyResponseSchema>;
type GetModelPolicyResponseInit = MessageInitShape<typeof GetModelPolicyResponseSchema>;
type ListModelPoliciesResponseInit = MessageInitShape<typeof ListModelPoliciesResponseSchema>;
type ArchiveModelPolicyResponseInit = MessageInitShape<typeof ArchiveModelPolicyResponseSchema>;
type ValidateModelPolicyResponseInit = MessageInitShape<typeof ValidateModelPolicyResponseSchema>;

const modelPolicyService = 'cftamac.agent.v1.AgentModelPolicyService';

/**
 * UpsertModelPolicy RPC を Agent-owned Durable Object へ dispatch します。
 */
export async function dispatchUpsertModelPolicy(
  env: AgentWorkerEnv,
  request: UpsertModelPolicyRequest
): Promise<UpsertModelPolicyResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    idempotencyKey: request.idempotencyKey,
    method: 'UpsertModelPolicy',
    security: request.security,
    service: modelPolicyService,
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).upsertModelPolicy({
    context,
    policy: mapModelPolicyCommandInput(request.policy),
  });
  return mapUpsertModelPolicyResponse(result);
}

/**
 * GetModelPolicy RPC を Agent-owned Durable Object へ dispatch します。
 */
export async function dispatchGetModelPolicy(
  env: AgentWorkerEnv,
  request: GetModelPolicyRequest
): Promise<GetModelPolicyResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'GetModelPolicy',
    service: modelPolicyService,
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).getModelPolicy({
    context,
    policyRef: request.policyRef,
  });
  return mapGetModelPolicyResponse(result);
}

/**
 * ListModelPolicies RPC を Agent-owned Durable Object へ dispatch します。
 */
export async function dispatchListModelPolicies(
  env: AgentWorkerEnv,
  request: ListModelPoliciesRequest
): Promise<ListModelPoliciesResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'ListModelPolicies',
    service: modelPolicyService,
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).listModelPolicies({
    context,
    pageCursorScope: request.page?.cursorScope,
    pageSize: request.page?.pageSize,
    pageToken: request.page?.pageToken,
    status: request.status,
  });
  return mapListModelPoliciesResponse(result);
}

/**
 * ArchiveModelPolicy RPC を Agent-owned Durable Object へ dispatch します。
 */
export async function dispatchArchiveModelPolicy(
  env: AgentWorkerEnv,
  request: ArchiveModelPolicyRequest
): Promise<ArchiveModelPolicyResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    idempotencyKey: request.idempotencyKey,
    method: 'ArchiveModelPolicy',
    security: request.security,
    service: modelPolicyService,
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).archiveModelPolicy({
    context,
    policyRef: request.policyRef,
    reason: request.reason,
  });
  return mapArchiveModelPolicyResponse(result);
}

/**
 * ValidateModelPolicy RPC を Agent-owned Durable Object へ dispatch します。
 */
export async function dispatchValidateModelPolicy(
  env: AgentWorkerEnv,
  request: ValidateModelPolicyRequest
): Promise<ValidateModelPolicyResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'ValidateModelPolicy',
    security: request.security,
    service: modelPolicyService,
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).validateModelPolicy({
    context,
    policy: mapModelPolicyCommandInput(request.policy),
  });
  return mapValidateModelPolicyResponse(result);
}
