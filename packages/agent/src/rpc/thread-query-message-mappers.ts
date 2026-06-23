import type {
  GetLatestCompactionResponseSchema,
  GetThreadMemoryResponseSchema,
  SearchThreadHistoryResponseSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import type {
  AgentPageView,
  AgentPayloadMetadataView,
  GetAgentThreadMemoryResult,
  GetLatestAgentThreadCompactionResult,
  SearchAgentThreadHistoryResult,
} from '../domain';
import type { MessageInitShape } from '@bufbuild/protobuf';

/**
 * latest ready Compaction の domain result を generated response init shape へ変換します。
 *
 * @param result Agent domain が返した latest compaction と snapshot metadata です。
 * @returns generated RPC response initializer と互換の plain object です。
 * @throws bigint 変換不能な数値が渡された場合は JavaScript runtime の例外が発生します。
 * @example
 * ```ts
 * const response = mapGetLatestCompactionResponse(result);
 * ```
 */
export function mapGetLatestCompactionResponse(
  result: GetLatestAgentThreadCompactionResult
): MessageInitShape<typeof GetLatestCompactionResponseSchema> {
  return {
    compaction:
      result.compaction === undefined ? undefined : mapThreadCompaction(result.compaction),
    snapshot: result.snapshot,
  };
}

/**
 * active ThreadMemory の domain result を generated response init shape へ変換します。
 *
 * @param result Thread memory snapshot と item list を含む domain result です。
 * @returns generated RPC response initializer と互換の plain object です。
 * @throws bigint 変換不能な数値が渡された場合は JavaScript runtime の例外が発生します。
 * @example
 * ```ts
 * const response = mapGetThreadMemoryResponse(result);
 * ```
 */
export function mapGetThreadMemoryResponse(
  result: GetAgentThreadMemoryResult
): MessageInitShape<typeof GetThreadMemoryResponseSchema> {
  return {
    items: result.items.map(mapThreadMemoryItem),
    memory: result.memory === undefined ? undefined : mapThreadMemory(result.memory),
  };
}

/**
 * ThreadHistory search の domain result を generated response init shape へ変換します。
 *
 * @param result History search の page 情報と result list です。
 * @returns generated RPC response initializer と互換の plain object です。
 * @throws bigint 変換不能な数値が渡された場合は JavaScript runtime の例外が発生します。
 * @example
 * ```ts
 * const response = mapSearchThreadHistoryResponse(result);
 * ```
 */
export function mapSearchThreadHistoryResponse(
  result: SearchAgentThreadHistoryResult
): MessageInitShape<typeof SearchThreadHistoryResponseSchema> {
  return { page: mapPage(result.page), results: result.results.map(mapThreadHistoryResult) };
}

function mapThreadCompaction(compaction: GetLatestAgentThreadCompactionResult['compaction']) {
  if (compaction === undefined) return undefined;
  return {
    agentId: compaction.agentId,
    completedAtUnixMs: optionalBigInt(compaction.completedAtMs),
    compactionId: compaction.compactionId,
    compactionOrdinal: compaction.compactionOrdinal,
    digestSha256: compaction.digestSha256,
    endThreadSequence: BigInt(compaction.endThreadSequence),
    handoffRef: compaction.handoffRef,
    historyRef: compaction.historyRef,
    memoryDeltaRef: compaction.memoryDeltaRef,
    sectionId: compaction.sectionId,
    sectionOrdinal: compaction.sectionOrdinal,
    startedAtUnixMs: optionalBigInt(compaction.startedAtMs),
    startThreadSequence: BigInt(compaction.startThreadSequence),
    status: compaction.status,
    threadId: compaction.threadId,
  };
}

function mapThreadMemory(memory: NonNullable<GetAgentThreadMemoryResult['memory']>) {
  return {
    agentId: memory.agentId,
    itemCount: memory.itemCount,
    latestCompactionId: memory.latestCompactionId,
    memoryId: memory.memoryId,
    memoryRef: memory.memoryRef,
    rebaseStatus: memory.rebaseStatus,
    snapshotRef: memory.snapshotRef,
    threadId: memory.threadId,
    updatedAtUnixMs: optionalBigInt(memory.updatedAtMs),
    version: String(memory.version),
  };
}

function mapThreadMemoryItem(item: GetAgentThreadMemoryResult['items'][number]) {
  return {
    agentId: item.agentId,
    contentRef: mapPayload(item.contentRef),
    memoryId: item.memoryId,
    memoryItemId: item.memoryItemId,
    provenanceRef: item.provenanceRef,
    status: item.status,
    supersedesItemId: item.supersedesItemId,
    threadId: item.threadId,
  };
}

function mapThreadHistoryResult(result: SearchAgentThreadHistoryResult['results'][number]) {
  return {
    agentId: result.agentId,
    body: mapPayload(result.body),
    compactionId: result.compactionId,
    createdAtUnixMs: optionalBigInt(result.createdAtMs),
    historyId: result.historyId,
    historyRef: result.historyRef,
    provenanceRef: result.provenanceRef,
    sectionId: result.sectionId,
    summary: result.summary,
    threadId: result.threadId,
  };
}

function mapPayload(payload: AgentPayloadMetadataView | undefined) {
  if (payload === undefined) return undefined;
  return {
    byteSize: BigInt(payload.byteSize),
    contentType: payload.contentType,
    inlineBytes: payload.inlineBytes,
    ref: payload.ref,
    sha256: payload.sha256,
    storageClass: payload.storageClass,
  };
}

function mapPage(page: AgentPageView) {
  return {
    cursorScope: page.cursorScope,
    nextPageToken: page.nextPageToken,
    resultCount: page.resultCount,
  };
}

function optionalBigInt(value: number | undefined): bigint | undefined {
  return value === undefined ? undefined : BigInt(value);
}
