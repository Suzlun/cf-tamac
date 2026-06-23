import { computeAgentBlobSha256Hex, createAgentBlobObjectRef } from '../storage/blob-offload';
import {
  agentInlineBodyLimitBytes,
  assertAgentBodyStorageAllowed,
  decideAgentBodyStorage,
} from '../storage/storage-thresholds';

/**
 * Event payload を inline 保存できる byte 数です。
 *
 * Agent storage threshold policy の 64 KiB 初期値を Event 層の互換的な名前として
 * re-export し、Event payload と ThreadHistory body の inline 判定を同じ値に揃えます。
 */
export const inlineEventPayloadLimitBytes = agentInlineBodyLimitBytes;

/**
 * Input for creating Event payload storage metadata.
 */
export interface CreateEventPayloadDescriptorInput {
  readonly agentId: string;
  readonly contentType?: string;
  readonly eventId: string;
  readonly payload?: Uint8Array;
  readonly payloadReference?: {
    readonly byteSize: number;
    readonly contentType: string;
    readonly ref: string;
    readonly sha256: string;
    readonly storageClass: string;
  };
  readonly storageUsagePercent?: number;
}

/**
 * Event payload metadata stored with an accepted Event row.
 */
export interface EventPayloadDescriptor {
  readonly byteSize: number;
  readonly contentType: string;
  readonly inlineBase64?: string;
  readonly inlineBytes?: Uint8Array;
  readonly ref: string;
  readonly r2ObjectKey?: string;
  readonly sha256: string;
  readonly storageClass: 'inline' | 'r2' | 'reference';
}

/**
 * Create payload metadata and R2 object identity without exposing payload bytes in logs.
 */
export async function createEventPayloadDescriptor(
  input: CreateEventPayloadDescriptorInput
): Promise<EventPayloadDescriptor | undefined> {
  if (input.payloadReference !== undefined) {
    return {
      byteSize: input.payloadReference.byteSize,
      contentType: input.payloadReference.contentType,
      ref: input.payloadReference.ref,
      sha256: input.payloadReference.sha256,
      storageClass: 'reference',
    };
  }
  if (input.payload === undefined || input.payload.byteLength === 0) {
    return undefined;
  }
  const decision = decideAgentBodyStorage({
    byteSize: input.payload.byteLength,
    currentPercent: input.storageUsagePercent,
    operationClass: 'mutation',
  });
  assertAgentBodyStorageAllowed(decision);
  const sha256 = await computeAgentBlobSha256Hex(input.payload);
  const contentType = input.contentType ?? 'application/octet-stream';
  if (decision.storageClass === 'inline') {
    return {
      byteSize: input.payload.byteLength,
      contentType,
      inlineBase64: encodeBase64Bytes(input.payload),
      inlineBytes: input.payload,
      ref: `inline:${sha256}`,
      sha256,
      storageClass: 'inline',
    };
  }
  const r2ObjectKey = `agents/${input.agentId}/events/${input.eventId}/payload.bin`;
  return {
    byteSize: input.payload.byteLength,
    contentType,
    r2ObjectKey,
    ref: createAgentBlobObjectRef(r2ObjectKey),
    sha256,
    storageClass: 'r2',
  };
}

function encodeBase64Bytes(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}
