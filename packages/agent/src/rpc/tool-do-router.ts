import type {
  ApproveInvocationRequest,
  ApproveInvocationResponseSchema,
  GetInvocationRequest,
  GetInvocationResponseSchema,
  ListInvocationsRequest,
  ListInvocationsResponseSchema,
  ListToolsRequest,
  ListToolsResponseSchema,
  RejectInvocationRequest,
  RejectInvocationResponseSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { getAIAgentDurableObjectStub } from '../agent-routing';

import { createAgentCoreContext } from './command-context';
import { requireAgentId } from './message-mappers';
import {
  mapApproveInvocationResponse,
  mapGetInvocationResponse,
  mapListInvocationsResponse,
  mapListToolsResponse,
  mapRejectInvocationResponse,
} from './tool-message-mappers';

import type { AgentWorkerEnv } from '../env';
import type { MessageInitShape } from '@bufbuild/protobuf';

const agentToolServiceName = 'cftamac.agent.v1.AgentToolService';

type ListToolsResponseInit = MessageInitShape<typeof ListToolsResponseSchema>;
type GetInvocationResponseInit = MessageInitShape<typeof GetInvocationResponseSchema>;
type ListInvocationsResponseInit = MessageInitShape<typeof ListInvocationsResponseSchema>;
type ApproveInvocationResponseInit = MessageInitShape<typeof ApproveInvocationResponseSchema>;
type RejectInvocationResponseInit = MessageInitShape<typeof RejectInvocationResponseSchema>;

/**
 * AgentToolService.ListTools を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った Agent scope、page、filter 条件です。
 * @returns generated ListToolsResponse の初期化値です。
 * @throws Agent ID が空の場合、または AIAgent 側の final authorization / storage 処理で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchListTools(env, request);
 * ```
 */
export async function dispatchListTools(
  env: AgentWorkerEnv,
  request: ListToolsRequest
): Promise<ListToolsResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createToolContext(agentId, request, 'ListTools');
  const result = await getAIAgentDurableObjectStub(env, agentId).listTools({
    context,
    includeUnavailable: request.includeUnavailable,
    installationId: request.installationId,
    pageSize: request.page?.pageSize,
  });
  return mapListToolsResponse(result);
}

/**
 * AgentToolService.GetInvocation を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った invocation ID と payload 表示条件です。
 * @returns generated GetInvocationResponse の初期化値です。
 * @throws Agent ID / invocation ID が不正な場合、または final authorization / storage 処理で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchGetInvocation(env, request);
 * ```
 */
export async function dispatchGetInvocation(
  env: AgentWorkerEnv,
  request: GetInvocationRequest
): Promise<GetInvocationResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createToolContext(agentId, request, 'GetInvocation');
  const result = await getAIAgentDurableObjectStub(env, agentId).getToolInvocation({
    context,
    includePayloadRefs: request.includePayloadRefs,
    invocationId: request.invocationId,
  });
  return mapGetInvocationResponse(result);
}

/**
 * AgentToolService.ListInvocations を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った Thread/Run/status/page filter です。
 * @returns generated ListInvocationsResponse の初期化値です。
 * @throws cursor scope が要求 filter と一致しない場合、または final authorization / storage 処理で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchListInvocations(env, request);
 * ```
 */
export async function dispatchListInvocations(
  env: AgentWorkerEnv,
  request: ListInvocationsRequest
): Promise<ListInvocationsResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createToolContext(agentId, request, 'ListInvocations');
  const result = await getAIAgentDurableObjectStub(env, agentId).listToolInvocations({
    context,
    installationId: request.installationId,
    pageCursorScope: request.page?.cursorScope,
    pageSize: request.page?.pageSize,
    pageToken: request.page?.pageToken,
    runId: request.runId,
    status: request.status,
    threadId: request.threadId,
  });
  return mapListInvocationsResponse(result);
}

/**
 * AgentToolService.ApproveInvocation を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った idempotency key、invocation ID、承認理由です。
 * @returns generated ApproveInvocationResponse の初期化値です。
 * @throws idempotency key / nonce / final authorization / 状態遷移のいずれかが不正な場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchApproveInvocation(env, request);
 * ```
 */
export async function dispatchApproveInvocation(
  env: AgentWorkerEnv,
  request: ApproveInvocationRequest
): Promise<ApproveInvocationResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createToolContext(agentId, request, 'ApproveInvocation');
  const result = await getAIAgentDurableObjectStub(env, agentId).approveToolInvocation({
    context,
    invocationId: request.invocationId,
    reason: request.reason,
  });
  return mapApproveInvocationResponse(result);
}

/**
 * AgentToolService.RejectInvocation を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った idempotency key、invocation ID、却下理由です。
 * @returns generated RejectInvocationResponse の初期化値です。
 * @throws idempotency key / nonce / final authorization / 状態遷移のいずれかが不正な場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchRejectInvocation(env, request);
 * ```
 */
export async function dispatchRejectInvocation(
  env: AgentWorkerEnv,
  request: RejectInvocationRequest
): Promise<RejectInvocationResponseInit> {
  const agentId = requireAgentId(request.agentId);
  const context = await createToolContext(agentId, request, 'RejectInvocation');
  const result = await getAIAgentDurableObjectStub(env, agentId).rejectToolInvocation({
    context,
    invocationId: request.invocationId,
    reason: request.reason,
  });
  return mapRejectInvocationResponse(result);
}

async function createToolContext(
  agentId: string,
  request:
    | ApproveInvocationRequest
    | GetInvocationRequest
    | ListInvocationsRequest
    | ListToolsRequest
    | RejectInvocationRequest,
  method: string
) {
  return createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    idempotencyKey: 'idempotencyKey' in request ? request.idempotencyKey : undefined,
    method,
    security: 'security' in request ? request.security : undefined,
    service: agentToolServiceName,
  });
}
