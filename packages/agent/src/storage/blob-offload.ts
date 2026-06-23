import { agentInlineBodyLimitBytes } from './storage-thresholds';

import type { AgentR2ObjectReferenceRow } from './archive-repository';
import type { AgentStorageRepositories } from './repositories';

/**
 * Agent-owned blob storage の binding 名です。
 *
 * R2 object reference index は binding 名だけを保存し、bucket の secret や raw body は保存しません。
 */
export const agentBlobBucketBindingName = 'AGENT_BLOBS' as const;

/**
 * immutable R2 offload が表現できる owner 種別です。
 *
 * Stage 4 では Event payload と ThreadHistory body を実際に書き込みます。Transcript、Tool result、
 * artifact、Event archive segment は Stage 6/7 実装が同じ seam を呼び出せるよう、ここで同じ
 * owner metadata policy として定義します。
 */
export const agentImmutableBlobOwnerKinds = [
  'event_payload',
  'thread_history_body',
  'transcript',
  'tool_result_blob',
  'artifact',
  'event_archive_segment',
  'history_archive_segment',
  'export_bundle',
] as const;

/**
 * Agent-owned immutable R2 object の owner 種別です。
 */
export type AgentImmutableBlobOwnerKind = (typeof agentImmutableBlobOwnerKinds)[number];

/**
 * R2 へ immutable body を書き込むための入力です。
 *
 * writer は Worker/DO boundary で `AGENT_BLOBS.put` に接続され、storage/domain 層は R2Bucket を
 * 直接 import しません。
 */
export interface AgentImmutableBlobWriteInput {
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly key: string;
  readonly sha256: string;
}

/**
 * R2 write 後に writer が返す検証用 metadata です。
 *
 * `sha256`、`byteSize`、`key` が期待値と一致しない場合は、SQLite index を作成しません。
 */
export interface AgentImmutableBlobWriteResult {
  readonly byteSize: number;
  readonly contentType?: string;
  readonly key: string;
  readonly sha256: string;
}

/**
 * Agent-owned immutable blob writer seam です。
 *
 * R2Bucket への具体的な put は AIAgent Durable Object など outer layer が実装します。
 */
export type AgentImmutableBlobWriter = (
  input: AgentImmutableBlobWriteInput
) => Promise<AgentImmutableBlobWriteResult>;

/**
 * R2 に保存済み、または保存予定の body descriptor です。
 *
 * raw body は含めず、SQLite index と query response に保存できる参照・digest・size だけを持ちます。
 */
export interface AgentStoredImmutableBlobDescriptor {
  readonly byteSize: number;
  readonly contentType: string;
  readonly objectKey: string;
  readonly ref: string;
  readonly sha256: string;
  readonly storageClass: 'r2';
}

/**
 * R2 write と DO SQLite object reference index をまとめて作成する入力です。
 */
export interface StoreAgentImmutableBlobInput {
  readonly agentId: string;
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly nowMs: number;
  readonly objectKey?: string;
  readonly ownerId: string;
  readonly ownerKind: AgentImmutableBlobOwnerKind;
  readonly provenanceRef?: string;
  readonly repositories: AgentStorageRepositories;
  readonly retentionStatus?: string;
  readonly threadId?: string;
  readonly writer: AgentImmutableBlobWriter;
}

/**
 * R2 write のみを行う入力です。
 */
export interface WriteAgentImmutableBlobInput {
  readonly agentId: string;
  readonly body: Uint8Array;
  readonly contentType: string;
  readonly objectKey?: string;
  readonly ownerId: string;
  readonly ownerKind: AgentImmutableBlobOwnerKind;
  readonly writer: AgentImmutableBlobWriter;
}

/**
 * SQLite object reference index を作成する入力です。
 */
export interface RecordAgentImmutableBlobReferenceInput {
  readonly descriptor: AgentStoredImmutableBlobDescriptor;
  readonly nowMs: number;
  readonly ownerId: string;
  readonly ownerKind: AgentImmutableBlobOwnerKind;
  readonly provenanceRef?: string;
  readonly repositories: AgentStorageRepositories;
  readonly retentionStatus?: string;
  readonly threadId?: string;
}

/**
 * Agent-owned body を immutable R2 object として保存し、DO SQLite index を検証付きで作成します。
 *
 * @param input R2 writer、Agent identity、owner metadata、body、repository set です。
 * @returns raw body を含まない R2 descriptor を返します。
 * @throws Error writer metadata または SQLite index が digest/size/key と一致しない場合に発生します。
 */
export async function storeAgentImmutableBlob(
  input: StoreAgentImmutableBlobInput
): Promise<AgentStoredImmutableBlobDescriptor> {
  // 先に R2 body を書き、成功した descriptor だけを SQLite index に登録します。
  const descriptor = await writeAgentImmutableBlob(input);
  recordAgentImmutableBlobReference({
    descriptor,
    nowMs: input.nowMs,
    ownerId: input.ownerId,
    ownerKind: input.ownerKind,
    provenanceRef: input.provenanceRef,
    repositories: input.repositories,
    retentionStatus: input.retentionStatus,
    threadId: input.threadId,
  });
  return descriptor;
}

/**
 * Agent-owned body を immutable R2 object として書き込みます。
 *
 * @param input R2 writer、Agent identity、owner metadata、body です。
 * @returns raw body を含まない R2 descriptor を返します。
 * @throws Error writer が返す key、digest、byte size が期待値と違う場合に発生します。
 */
export async function writeAgentImmutableBlob(
  input: WriteAgentImmutableBlobInput
): Promise<AgentStoredImmutableBlobDescriptor> {
  // R2 object key は caller 指定を優先し、未指定時は owner と digest から安定生成します。
  const sha256 = await computeAgentBlobSha256Hex(input.body);
  const objectKey =
    input.objectKey ??
    createAgentBlobObjectKey(input.agentId, input.ownerKind, input.ownerId, sha256);
  const descriptor = createAgentStoredImmutableBlobDescriptor({
    byteSize: input.body.byteLength,
    contentType: input.contentType,
    objectKey,
    sha256,
  });
  const writeResult = await input.writer({
    body: input.body,
    contentType: input.contentType,
    key: objectKey,
    sha256,
  });

  // writer が返した metadata と digest を照合し、壊れた body を index へ進めません。
  verifyAgentBlobWriteResult({ descriptor, writeResult });
  return descriptor;
}

/**
 * Agent-owned immutable R2 descriptor を DO SQLite の object reference index に登録します。
 *
 * @param input descriptor、owner metadata、repository set です。
 * @returns 検証済み object reference row を返します。
 * @throws Error 既存または新規 index が descriptor と一致しない場合に発生します。
 */
export function recordAgentImmutableBlobReference(
  input: RecordAgentImmutableBlobReferenceInput
): AgentR2ObjectReferenceRow {
  // 既存 row がある場合は immutable object として同一 metadata であることを確認します。
  const existing = input.repositories.archives.findR2ObjectReference(input.descriptor.ref);
  if (existing !== undefined) {
    verifyAgentBlobIndex({ descriptor: input.descriptor, row: existing });
    return existing;
  }

  // DO SQLite は R2 body の権威 index として owner、digest、size、retention を保持します。
  const row = input.repositories.archives.recordR2ObjectReference({
    bucketBinding: agentBlobBucketBindingName,
    byteSize: input.descriptor.byteSize,
    contentType: input.descriptor.contentType,
    createdAtMs: input.nowMs,
    objectKey: input.descriptor.objectKey,
    objectRef: input.descriptor.ref,
    ownerId: input.ownerId,
    ownerKind: input.ownerKind,
    provenanceRef: input.provenanceRef,
    retentionStatus: input.retentionStatus ?? 'active',
    sha256: input.descriptor.sha256,
    status: 'active',
    storageClass: input.descriptor.storageClass,
    threadId: input.threadId,
  });
  verifyAgentBlobIndex({ descriptor: input.descriptor, row });
  return row;
}

/**
 * R2 object key から raw body を含まない object reference を作成します。
 *
 * @param objectKey Agent-owned R2 bucket 内の object key です。
 * @returns `r2://` scheme の object reference を返します。
 */
export function createAgentBlobObjectRef(objectKey: string): string {
  return `r2://${objectKey}`;
}

/**
 * Agent owner metadata と digest から immutable object key を作成します。
 *
 * @param agentId Agent aggregate ID です。
 * @param ownerKind body の所有種別です。
 * @param ownerId body を所有する Event/History/Tool/Archive などの ID です。
 * @param sha256 body の SHA-256 digest です。
 * @returns Agent-owned R2 bucket 内の object key を返します。
 */
export function createAgentBlobObjectKey(
  agentId: string,
  ownerKind: AgentImmutableBlobOwnerKind,
  ownerId: string,
  sha256: string
): string {
  // path segment は URL encode し、owner ID に slash 等が含まれても bucket 階層を壊さないようにします。
  const encodedAgentId = encodeURIComponent(agentId);
  const encodedOwnerId = encodeURIComponent(ownerId);
  return `agents/${encodedAgentId}/blobs/${ownerKind}/${encodedOwnerId}/${sha256}.bin`;
}

/**
 * body bytes の SHA-256 digest を hex 文字列で計算します。
 *
 * @param bytes digest 対象 byte 列です。
 * @returns 64 文字の lowercase hex digest を返します。
 */
export async function computeAgentBlobSha256Hex(bytes: Uint8Array): Promise<string> {
  // Web Crypto の結果を byte 配列へ変換し、各 byte を 2 桁 hex に揃えます。
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function createAgentStoredImmutableBlobDescriptor(input: {
  readonly byteSize: number;
  readonly contentType: string;
  readonly objectKey: string;
  readonly sha256: string;
}): AgentStoredImmutableBlobDescriptor {
  return {
    byteSize: input.byteSize,
    contentType: input.contentType,
    objectKey: input.objectKey,
    ref: createAgentBlobObjectRef(input.objectKey),
    sha256: input.sha256,
    storageClass: 'r2',
  };
}

function verifyAgentBlobWriteResult(input: {
  readonly descriptor: AgentStoredImmutableBlobDescriptor;
  readonly writeResult: AgentImmutableBlobWriteResult;
}): void {
  // R2 write seam が digest/size/key を戻すことで、body と index の不一致を早期検出します。
  if (input.writeResult.key !== input.descriptor.objectKey) {
    throw new Error('Agent blob writer returned a different object key.');
  }
  if (input.writeResult.sha256 !== input.descriptor.sha256) {
    throw new Error('Agent blob writer digest verification failed.');
  }
  if (input.writeResult.byteSize !== input.descriptor.byteSize) {
    throw new Error('Agent blob writer byte size verification failed.');
  }
  if (
    input.writeResult.contentType !== undefined &&
    input.writeResult.contentType !== input.descriptor.contentType
  ) {
    throw new Error('Agent blob writer content type verification failed.');
  }
}

function verifyAgentBlobIndex(input: {
  readonly descriptor: AgentStoredImmutableBlobDescriptor;
  readonly row: AgentR2ObjectReferenceRow;
}): void {
  // SQLite index は raw body の代わりに digest、size、object reference の整合性を保証します。
  if (input.row.objectKey !== input.descriptor.objectKey) {
    throw new Error('Agent blob index object key mismatch.');
  }
  if (input.row.objectRef !== input.descriptor.ref) {
    throw new Error('Agent blob index object reference mismatch.');
  }
  if (input.row.sha256 !== input.descriptor.sha256) {
    throw new Error('Agent blob index digest mismatch.');
  }
  if (input.row.byteSize !== input.descriptor.byteSize) {
    throw new Error('Agent blob index byte size mismatch.');
  }
  if (input.row.contentType !== input.descriptor.contentType) {
    throw new Error('Agent blob index content type mismatch.');
  }
  if (input.row.storageClass !== 'r2') {
    throw new Error('Agent blob index storage class mismatch.');
  }
}

/**
 * body size が inline threshold を超えているかを返します。
 *
 * @param byteSize body の byte 数です。
 * @returns 64 KiB を超える場合に true を返します。
 */
export function isAgentLargeBody(byteSize: number): boolean {
  return byteSize > agentInlineBodyLimitBytes;
}
