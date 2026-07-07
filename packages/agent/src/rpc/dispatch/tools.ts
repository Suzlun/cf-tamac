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

import { getAIAgentDurableObjectStub } from '../../agent-routing';
import { createAgentCoreContext } from '../command-context';
import { requireAgentId } from '../mappers/core';
import {
  mapApproveInvocationResponse,
  mapGetInvocationResponse,
  mapListInvocationsResponse,
  mapListToolsResponse,
  mapRejectInvocationResponse,
} from '../mappers/tools';

import type { AgentWorkerEnv } from '../../env';
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
  // Tool catalog 参照は Agent ID scope の Durable Object に限定し、Client/Provider へ直接到達させません。
  const agentId = requireAgentId(request.agentId);
  // ListTools 用の service/method 名と request digest を context 化し、AIAgent 側の監査へ渡します。
  const context = await createToolContext(agentId, request, 'ListTools');
  // Durable Object public method の listTools を維持し、dispatch 層で request shape だけを橋渡しします。
  const result = await getAIAgentDurableObjectStub(env, agentId).listTools({
    context,
    includeUnavailable: request.includeUnavailable,
    installationId: request.installationId,
    pageSize: request.page?.pageSize,
  });
  // Tool catalog domain result を generated RPC response init に統一します。
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
  // Invocation 参照も Agent-owned tool storage に閉じ、payload reference の表示可否は request に従います。
  const agentId = requireAgentId(request.agentId);
  // request 全体を digest seed に含め、payload refs 表示条件も監査可能にします。
  const context = await createToolContext(agentId, request, 'GetInvocation');
  // AIAgent の getToolInvocation method に必要な filter だけを渡し、service 層へ domain seam を漏らしません。
  const result = await getAIAgentDurableObjectStub(env, agentId).getToolInvocation({
    context,
    includePayloadRefs: request.includePayloadRefs,
    invocationId: request.invocationId,
  });
  // Invocation domain result を generated RPC response init へ変換します。
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
  // Invocation list は Agent ID scope と optional Thread/Run filter の範囲だけを検索します。
  const agentId = requireAgentId(request.agentId);
  // pagination cursor scope を含む request を context 化し、cursor 再利用の監査情報を保持します。
  const context = await createToolContext(agentId, request, 'ListInvocations');
  // Durable Object 内の repository query に必要な filter だけを渡し、Agent 横断 list を作りません。
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
  // Repository page result を generated RPC response init へ写像します。
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
  // 承認 mutation は Agent ID と idempotency key を context に含め、再実行防止を Durable Object 側へ委ねます。
  const agentId = requireAgentId(request.agentId);
  // security metadata を含む tool context を作り、acting user と approval intent を監査できるようにします。
  const context = await createToolContext(agentId, request, 'ApproveInvocation');
  // Durable Object public method の approveToolInvocation で状態遷移と audit event を一貫して処理します。
  const result = await getAIAgentDurableObjectStub(env, agentId).approveToolInvocation({
    context,
    invocationId: request.invocationId,
    reason: request.reason,
  });
  // Approval result を generated RPC response init へ変換します。
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
  // 却下 mutation は承認と同じ context 生成規則を使い、audit と状態遷移の一貫性を保ちます。
  const agentId = requireAgentId(request.agentId);
  // idempotency key と security metadata を Durable Object 内の final authorization へ渡します。
  const context = await createToolContext(agentId, request, 'RejectInvocation');
  // Durable Object public method の rejectToolInvocation で rejection reason を永続化します。
  const result = await getAIAgentDurableObjectStub(env, agentId).rejectToolInvocation({
    context,
    invocationId: request.invocationId,
    reason: request.reason,
  });
  // Rejection result を generated RPC response init へ変換します。
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
  // Tool service 共通の service 名、method 名、request digest seed、mutation metadata を集約します。
  return createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    idempotencyKey: 'idempotencyKey' in request ? request.idempotencyKey : undefined,
    method,
    security: 'security' in request ? request.security : undefined,
    service: agentToolServiceName,
  });
}
