import type {
  GetLatestCompactionRequest,
  GetLatestCompactionResponseSchema,
  GetThreadMemoryRequest,
  GetThreadMemoryResponseSchema,
  GetThreadRequest,
  GetThreadResponseSchema,
  ListSectionsRequest,
  ListSectionsResponseSchema,
  ListThreadsRequest,
  ListThreadsResponseSchema,
  SearchThreadHistoryRequest,
  SearchThreadHistoryResponseSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { getAIAgentDurableObjectStub } from '../../agent-routing';
import { createAgentCoreContext } from '../command-context';
import {
  mapGetThreadResponse,
  mapListSectionsResponse,
  mapListThreadsResponse,
  requireAgentId,
  toNumber,
} from '../mappers/core';
import {
  mapGetLatestCompactionResponse,
  mapGetThreadMemoryResponse,
  mapSearchThreadHistoryResponse,
} from '../mappers/threads';

import type { AgentWorkerEnv } from '../../env';
import type { MessageInitShape } from '@bufbuild/protobuf';

const agentThreadServiceName = 'cftamac.agent.v1.AgentThreadService';

type ListThreadsResponseInit = MessageInitShape<typeof ListThreadsResponseSchema>;
type GetThreadResponseInit = MessageInitShape<typeof GetThreadResponseSchema>;
type ListSectionsResponseInit = MessageInitShape<typeof ListSectionsResponseSchema>;
type GetLatestCompactionResponseInit = MessageInitShape<typeof GetLatestCompactionResponseSchema>;
type GetThreadMemoryResponseInit = MessageInitShape<typeof GetThreadMemoryResponseSchema>;
type SearchThreadHistoryResponseInit = MessageInitShape<typeof SearchThreadHistoryResponseSchema>;

/**
 * AgentThreadService.ListThreads を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った thread key prefix、status、page filter です。
 * @returns generated ListThreadsResponse の初期化値です。
 * @throws Agent ID や pagination 入力が不正な場合、または AIAgent 側の参照・認可で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchListThreads(env, request);
 * ```
 */
export async function dispatchListThreads(
  env: AgentWorkerEnv,
  request: ListThreadsRequest
): Promise<ListThreadsResponseInit> {
  // Thread 一覧は Agent ID scope の Durable Object 内にある Thread index だけを対象にします。
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'ListThreads',
    service: agentThreadServiceName,
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).listThreads({
    context,
    pageCursorScope: request.page?.cursorScope,
    pageSize: request.page?.pageSize,
    pageToken: request.page?.pageToken,
    status: request.status,
    threadKeyPrefix: request.threadKeyPrefix,
  });
  return mapListThreadsResponse(result);
}

/**
 * AgentThreadService.GetThread を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った Thread ID です。
 * @returns generated GetThreadResponse の初期化値です。
 * @throws Agent ID や Thread ID が不正な場合、または AIAgent 側の参照・認可で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchGetThread(env, request);
 * ```
 */
export async function dispatchGetThread(
  env: AgentWorkerEnv,
  request: GetThreadRequest
): Promise<GetThreadResponseInit> {
  // Thread 詳細は Agent-local ID 空間だけで解決します。
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'GetThread',
    service: agentThreadServiceName,
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).getThread({
    context,
    threadId: request.threadId,
  });
  return mapGetThreadResponse(result);
}

/**
 * AgentThreadService.ListSections を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った Thread ID、sequence 範囲、page filter です。
 * @returns generated ListSectionsResponse の初期化値です。
 * @throws Agent ID、Thread ID、pagination 入力が不正な場合、または AIAgent 側の参照・認可で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchListSections(env, request);
 * ```
 */
export async function dispatchListSections(
  env: AgentWorkerEnv,
  request: ListSectionsRequest
): Promise<ListSectionsResponseInit> {
  // Section sequence range は RPC の bigint 系時刻表現から Durable Object 内の number 表現へ安全に写します。
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'ListSections',
    service: agentThreadServiceName,
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).listSections({
    context,
    endSectionOrdinal: toNumber(request.sequenceRange?.endUnixMs),
    pageCursorScope: request.page?.cursorScope,
    pageSize: request.page?.pageSize,
    pageToken: request.page?.pageToken,
    startSectionOrdinal: toNumber(request.sequenceRange?.startUnixMs),
    threadId: request.threadId,
  });
  return mapListSectionsResponse(result);
}

/**
 * AgentThreadService.GetLatestCompaction を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った Thread ID です。
 * @returns generated GetLatestCompactionResponse の初期化値です。
 * @throws Agent ID や Thread ID が不正な場合、または AIAgent 側の参照・認可で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchGetLatestCompaction(env, request);
 * ```
 */
export async function dispatchGetLatestCompaction(
  env: AgentWorkerEnv,
  request: GetLatestCompactionRequest
): Promise<GetLatestCompactionResponseInit> {
  // 最新 compaction は Thread scope に閉じた派生 projection として Durable Object から取得します。
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'GetLatestCompaction',
    service: agentThreadServiceName,
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).getLatestCompaction({
    context,
    threadId: request.threadId,
  });
  return mapGetLatestCompactionResponse(result);
}

/**
 * AgentThreadService.GetThreadMemory を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った Thread ID です。
 * @returns generated GetThreadMemoryResponse の初期化値です。
 * @throws Agent ID や Thread ID が不正な場合、または AIAgent 側の参照・認可で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchGetThreadMemory(env, request);
 * ```
 */
export async function dispatchGetThreadMemory(
  env: AgentWorkerEnv,
  request: GetThreadMemoryRequest
): Promise<GetThreadMemoryResponseInit> {
  // Thread memory は Agent-owned compaction/runtime state から得る summary だけを返します。
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'GetThreadMemory',
    service: agentThreadServiceName,
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).getThreadMemory({
    context,
    threadId: request.threadId,
  });
  return mapGetThreadMemoryResponse(result);
}

/**
 * AgentThreadService.SearchThreadHistory を Agent ID 対応の AIAgent Durable Object へ配送します。
 *
 * @param env Agent Worker の Durable Object binding と secret binding を含む環境です。
 * @param request generated RPC request から受け取った query、filter、page 条件です。
 * @returns generated SearchThreadHistoryResponse の初期化値です。
 * @throws Agent ID、Thread ID、filter、pagination 入力が不正な場合、または AIAgent 側の参照・認可で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const response = await dispatchSearchThreadHistory(env, request);
 * ```
 */
export async function dispatchSearchThreadHistory(
  env: AgentWorkerEnv,
  request: SearchThreadHistoryRequest
): Promise<SearchThreadHistoryResponseInit> {
  // filter.query が明示されている場合は従来どおりトップレベル query より優先します。
  const agentId = requireAgentId(request.agentId);
  const context = await createAgentCoreContext({
    agentId,
    fallbackDigestSeed: request,
    method: 'SearchThreadHistory',
    service: agentThreadServiceName,
  });
  const result = await getAIAgentDurableObjectStub(env, agentId).searchThreadHistory({
    compactionId: request.filter?.compactionId,
    context,
    endCreatedAtMs: toNumber(request.filter?.timeRange?.endUnixMs),
    pageCursorScope: request.page?.cursorScope,
    pageSize: request.page?.pageSize,
    pageToken: request.page?.pageToken,
    provenanceContains: request.filter?.provenanceContains,
    query:
      request.filter?.query === undefined || request.filter.query === ''
        ? request.query
        : request.filter.query,
    sectionId: request.filter?.sectionId,
    startCreatedAtMs: toNumber(request.filter?.timeRange?.startUnixMs),
    threadId: request.threadId,
  });
  return mapSearchThreadHistoryResponse(result);
}
