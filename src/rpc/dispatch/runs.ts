import type {
  CancelRunRequest,
  CancelRunResponseSchema,
  GetRunRequest,
  GetRunResponseSchema,
  ListRunsRequest,
  ListRunsResponseSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { getAIAgentDurableObjectStub } from '../../agent-routing';
import { createAgentCoreContext } from '../command-context';
import { requireAgentId, toNumber } from '../mappers/core';
import { mapCancelRunResponse, mapGetRunResponse, mapListRunsResponse } from '../mappers/runs';

import type { AgentWorkerEnv } from '../../env';
import type { MessageInitShape } from '@bufbuild/protobuf';

type GetRunResponseInit = MessageInitShape<typeof GetRunResponseSchema>;
type ListRunsResponseInit = MessageInitShape<typeof ListRunsResponseSchema>;
type CancelRunResponseInit = MessageInitShape<typeof CancelRunResponseSchema>;

/**
 * AgentRunService.GetRun を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った Agent scope と Run ID です。
 * @returns generated GetRunResponse の初期化値です。
 * @throws Agent ID や Run ID が不正な場合、または AIAgent 側の参照・認可で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchGetRun(env, request);
 * ```
 */
export async function dispatchGetRun(
  env: AgentWorkerEnv,
  request: GetRunRequest
): Promise<GetRunResponseInit> {
  // public request body の agent_id を必須化し、対象 Run を所有する Durable Object scope を確定します。
  const agentId = requireAgentId(request.agentId);
  // 参照系 RPC でも body digest と service/method 名を context 化し、監査・認可を AIAgent 側へ渡します。
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'GetRun',
    service: 'cftamac.agent.v1.AgentRunService',
  });
  // Durable Object public method 名は変えず、dispatch 層だけを RPC 配線の責務として保持します。
  const result = await getAIAgentDurableObjectStub(env, agentId).getRun({
    context,
    runId: request.runId,
  });
  // AIAgent domain result を generated RPC response init へ変換し、service 層へ Protobuf 形状だけを返します。
  return mapGetRunResponse(result);
}

/**
 * AgentRunService.ListRuns を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った Agent scope、Thread/status/time/page filter です。
 * @returns generated ListRunsResponse の初期化値です。
 * @throws Agent ID や pagination 入力が不正な場合、または AIAgent 側の参照・認可で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchListRuns(env, request);
 * ```
 */
export async function dispatchListRuns(
  env: AgentWorkerEnv,
  request: ListRunsRequest
): Promise<ListRunsResponseInit> {
  // List query は必ず Agent ID scope の Durable Object に閉じ、Agent 横断検索の public RPC にしません。
  const agentId = requireAgentId(request.agentId);
  // time range と pagination 条件を含む request 全体から command context を作り、再現可能な監査情報を渡します。
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'ListRuns',
    service: 'cftamac.agent.v1.AgentRunService',
  });
  // Protobuf の optional bigint/long 値は mapper 経由で number seam に変換してから DO method へ渡します。
  const result = await getAIAgentDurableObjectStub(env, agentId).listRuns({
    context,
    endMs: toNumber(request.timeRange?.endUnixMs),
    pageCursorScope: request.page?.cursorScope,
    pageSize: request.page?.pageSize,
    pageToken: request.page?.pageToken,
    startMs: toNumber(request.timeRange?.startUnixMs),
    status: request.status,
    threadId: request.threadId,
  });
  // Storage/domain の page result を generated RPC response init に統一します。
  return mapListRunsResponse(result);
}

/**
 * AgentRunService.CancelRun を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った Agent scope、Run ID、idempotency key、取消理由です。
 * @returns generated CancelRunResponse の初期化値です。
 * @throws Agent ID、Run ID、idempotency key、final authorization、状態遷移のいずれかが不正な場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchCancelRun(env, request);
 * ```
 */
export async function dispatchCancelRun(
  env: AgentWorkerEnv,
  request: CancelRunRequest
): Promise<CancelRunResponseInit> {
  // mutation RPC は Agent ID と idempotency key を必須の command context として Durable Object へ渡します。
  const agentId = requireAgentId(request.agentId);
  // security metadata を context に含め、認証済み principal の final authorization を AIAgent 内で実施します。
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    idempotencyKey: request.idempotencyKey,
    method: 'CancelRun',
    security: request.security,
    service: 'cftamac.agent.v1.AgentRunService',
  });
  // Durable Object の cancelRun method 名は公開 RPC から独立した内部 public method として維持します。
  const result = await getAIAgentDurableObjectStub(env, agentId).cancelRun({
    context,
    reason: request.reason,
    runId: request.runId,
  });
  // cancel result を generated RPC response init へ写像し、Connect service 実装へ返します。
  return mapCancelRunResponse(result);
}
