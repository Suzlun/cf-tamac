import { createAgentDomainError } from '../domain/errors';
import {
  recordAgentImmutableBlobReference,
  writeAgentImmutableBlob,
} from '../storage/blob-offload';
import {
  AgentStorageThresholdViolation,
  assertAgentBodyStorageAllowed,
  decideAgentBodyStorage,
} from '../storage/storage-thresholds';

import type { CommitSuccessfulThreadCompactionInput } from './output-types';
import type { AgentStorageRepositories, AgentThreadCompactionRow } from '../storage';

const jsonContentType = 'application/json';

/**
 * Compaction JSON body の inline encoding 結果です。
 *
 * @property byteSize UTF-8 JSON body の byte 数です。
 * @property bytes UTF-8 JSON body bytes です。R2 offload が必要な場合だけ writer に渡します。
 * @property digestSha256 body bytes の SHA-256 digest です。
 * @property ref inline body 参照です。
 * @property storageClass inline 保存を表す storage class です。
 * @property text stable stringify 済み JSON 文字列です。
 */
export interface EncodedCompactionJsonPayload {
  readonly byteSize: number;
  readonly bytes: Uint8Array;
  readonly digestSha256: string;
  readonly ref: string;
  readonly storageClass: 'inline';
  readonly text: string;
}

/**
 * ThreadHistory body の保存結果です。
 *
 * inline の場合は inline ref、R2 の場合は immutable object ref と digest/size を返します。
 */
export interface StoredCompactionJsonPayload {
  readonly byteSize: number;
  readonly digestSha256: string;
  readonly objectKey?: string;
  readonly ref: string;
  readonly storageClass: 'inline' | 'r2';
  readonly text: string;
}

/**
 * ThreadHistory body を threshold policy に従って inline または R2 に保存します。
 *
 * @param input Compaction 成功 commit の入力です。
 * @param compaction body の Thread/Section/Event 範囲を所有する Compaction row です。
 * @param payload stable JSON encoding 済みの History body です。
 * @returns SQLite index に保存できる body metadata を返します。
 * @throws AgentDomainError large body に blob writer がない場合、または critical policy が拒否した場合に発生します。
 */
export async function storeThreadHistoryBody(
  input: CommitSuccessfulThreadCompactionInput,
  compaction: AgentThreadCompactionRow,
  payload: EncodedCompactionJsonPayload
): Promise<StoredCompactionJsonPayload> {
  const decision = decideAgentBodyStorage({
    byteSize: payload.byteSize,
    currentPercent: input.storageUsagePercent,
    operationClass: 'compact',
  });
  assertHistoryStorageDecisionAllowed(decision);
  if (decision.storageClass === 'inline') return payload;
  if (input.blobWriter === undefined) {
    throw createAgentDomainError({
      kind: 'precondition',
      message: 'Large ThreadHistory body requires an Agent-owned blob writer.',
      target: input.historyId,
    });
  }

  // compact は critical mode でも優先される操作なので、まず body だけを R2 へ逃がします。
  const stored = await writeAgentImmutableBlob({
    agentId: input.agentId,
    body: payload.bytes,
    contentType: jsonContentType,
    objectKey: createHistoryBodyObjectKey(input, compaction),
    ownerId: input.historyId,
    ownerKind: 'thread_history_body',
    writer: input.blobWriter,
  });
  return {
    byteSize: stored.byteSize,
    digestSha256: stored.sha256,
    objectKey: stored.objectKey,
    ref: stored.ref,
    storageClass: stored.storageClass,
    text: payload.text,
  };
}

/**
 * R2 に保存済みの ThreadHistory body descriptor を transaction 内の DO SQLite index に登録します。
 *
 * @param input Compaction 成功 commit の入力です。
 * @param compaction body の Thread/Section/Event 範囲を所有する Compaction row です。
 * @param payload `storeThreadHistoryBody` が返した body metadata です。
 * @param repositories transaction 内の repository set です。
 * @throws AgentDomainError R2 payload に object key が欠けている場合に発生します。
 */
export function recordThreadHistoryBodyReference(input: {
  readonly commit: CommitSuccessfulThreadCompactionInput;
  readonly compaction: AgentThreadCompactionRow;
  readonly payload: StoredCompactionJsonPayload;
  readonly repositories: AgentStorageRepositories;
}): void {
  if (input.payload.storageClass !== 'r2') return;
  if (input.payload.objectKey === undefined) {
    throw createAgentDomainError({
      kind: 'internal',
      message: 'R2 ThreadHistory body metadata is missing an object key.',
      target: input.commit.historyId,
    });
  }
  // History index / Compaction output と同じ SQLite transaction で R2 object reference を作成します。
  recordAgentImmutableBlobReference({
    descriptor: {
      byteSize: input.payload.byteSize,
      contentType: jsonContentType,
      objectKey: input.payload.objectKey,
      ref: input.payload.ref,
      sha256: input.payload.digestSha256,
      storageClass: 'r2',
    },
    nowMs: input.commit.nowMs,
    ownerId: input.commit.historyId,
    ownerKind: 'thread_history_body',
    provenanceRef: input.commit.provenanceRef,
    repositories: input.repositories,
    retentionStatus: 'active',
    threadId: input.compaction.threadId,
  });
}

function assertHistoryStorageDecisionAllowed(
  decision: ReturnType<typeof decideAgentBodyStorage>
): void {
  try {
    assertAgentBodyStorageAllowed(decision);
  } catch (error) {
    if (error instanceof AgentStorageThresholdViolation) {
      throw createAgentDomainError({
        kind: 'precondition',
        message: error.message,
        safeDetails: { storageStatus: error.status },
      });
    }
    throw error;
  }
}

function createHistoryBodyObjectKey(
  input: CommitSuccessfulThreadCompactionInput,
  compaction: AgentThreadCompactionRow
): string {
  // object key に Agent/Thread/Compaction/History identity を含め、R2 body の所有関係を path でも追跡できるようにします。
  const agentSegment = encodeURIComponent(input.agentId);
  const threadSegment = encodeURIComponent(compaction.threadId);
  const compactionSegment = encodeURIComponent(compaction.compactionId);
  const historySegment = encodeURIComponent(input.historyId);
  return `agents/${agentSegment}/threads/${threadSegment}/compactions/${compactionSegment}/history/${historySegment}.json`;
}
