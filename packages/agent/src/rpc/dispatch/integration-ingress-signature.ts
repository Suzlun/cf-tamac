import { create, toBinary } from '@bufbuild/protobuf';

import {
  PublishDeliveryResultRequestSchema,
  PublishIntegrationEventRequestSchema,
  PublishToolResultRequestSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';
import type {
  PublishDeliveryResultRequest,
  PublishIntegrationEventRequest,
  PublishToolResultRequest,
  RawBodyDigest,
  RequestTimestamp,
  SignatureMetadata,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { createAgentDomainError } from '../../domain/errors';
import { computeSha256Hex } from '../../domain/security';

import type { AgentRawBodyDigest } from '../../domain/security';
import type { IntegrationIngressSignatureInput } from '../../integrations';

type IntegrationIngressRequest =
  | PublishDeliveryResultRequest
  | PublishIntegrationEventRequest
  | PublishToolResultRequest;

type IntegrationIngressMethod = 'PublishDeliveryResult' | 'PublishEvent' | 'PublishToolResult';

/**
 * Integration ingress request の署名 metadata を domain 検証 input へ写像します。
 *
 * @param request generated IntegrationIngressService request です。timestamp、raw body digest、signature、nonce を必須入力として扱います。
 * @returns Integration domain の署名検証で利用する正規化済み metadata です。
 * @throws timestamp、raw body digest、signature、nonce が欠けている、または digest algorithm が未対応の場合に authentication error を送出します。
 * @example
 * ```ts
 * const signature = mapSignatureInput(request);
 * ```
 */
export function mapSignatureInput(
  request: IntegrationIngressRequest
): IntegrationIngressSignatureInput {
  // 署名検証の必須 metadata は fail-closed で取り出し、AIAgent 側に欠損値を渡しません。
  const timestamp = requireTimestamp(request.timestamp);
  const rawBodyDigest = requireRawBodyDigest(request.rawBodyDigest);
  const signature = requireSignature(request.signature);
  const nonce = requireIngressIdentity(request.nonce?.nonce, 'nonce');
  const keyId = requireIngressIdentity(signature.keyId, 'signature.key_id');
  const digestHex = requireLowercaseSha256Hex(rawBodyDigest.digestHex);
  const timestampMs = requireSafeMilliseconds(timestamp.unixMs, 'timestamp.unix_ms');
  const signedAtMs = requireSafeMilliseconds(
    signature.signedAtUnixMs,
    'signature.signed_at_unix_ms'
  );
  if (signature.algorithm !== 'Ed25519') {
    throw createAgentDomainError({
      kind: 'authentication',
      message: 'Integration signature algorithm must be Ed25519.',
      target: 'signature.algorithm',
    });
  }
  if (signature.signature.byteLength === 0) {
    throw createAgentDomainError({
      kind: 'authentication',
      message: 'Integration signature bytes are required.',
      target: 'signature.signature',
    });
  }

  // Protobuf の 64bit 値と identity を fail-closed に正規化し、Provider が自己申告する skew は一切採用しません。
  return {
    algorithm: signature.algorithm,
    byteLength: requireSafeByteLength(rawBodyDigest.byteLength),
    digestHex,
    keyId,
    nonce,
    signature: signature.signature,
    signedAtMs,
    timestampMs,
  };
}

/**
 * Integration ingress request から署名 metadata を除いた canonical binary body digest を作成します。
 *
 * @param request generated IntegrationIngressService request です。署名 metadata 以外の business payload を digest 対象にします。
 * @param method request をエンコードする generated message schema を選ぶ IntegrationIngressService method 名です。
 * @returns `sha-256` algorithm、encoded byte length、hex digest を持つ AgentRawBodyDigest です。
 * @throws binary encode または digest 計算で失敗した場合に例外を伝播します。
 * @example
 * ```ts
 * const digest = await createUnsignedIngressBodyDigest(request, 'PublishEvent');
 * ```
 */
export async function createUnsignedIngressBodyDigest(
  request: IntegrationIngressRequest,
  method: IntegrationIngressMethod
): Promise<AgentRawBodyDigest> {
  // 署名値そのものを digest に含める循環を避けるため、metadata を落とした message を canonical body として扱います。
  const unsigned = stripIngressSignatureMetadata(request);
  const bytes = encodeUnsignedIngressRequest(unsigned, method);
  return {
    algorithm: 'sha-256',
    byteLength: bytes.byteLength,
    digestHex: await computeSha256Hex(bytes),
  };
}

function encodeUnsignedIngressRequest(
  request: IntegrationIngressRequest,
  method: IntegrationIngressMethod
): Uint8Array {
  // method ごとの generated schema で binary encode し、wire 形式と digest 対象の対応を明示します。
  switch (method) {
    case 'PublishEvent':
      return toBinary(
        PublishIntegrationEventRequestSchema,
        create(PublishIntegrationEventRequestSchema, request as PublishIntegrationEventRequest)
      );
    case 'PublishToolResult':
      return toBinary(
        PublishToolResultRequestSchema,
        create(PublishToolResultRequestSchema, request as PublishToolResultRequest)
      );
    case 'PublishDeliveryResult':
      return toBinary(
        PublishDeliveryResultRequestSchema,
        create(PublishDeliveryResultRequestSchema, request as PublishDeliveryResultRequest)
      );
  }
}

function stripIngressSignatureMetadata<Request extends IntegrationIngressRequest>(
  request: Request
): Request {
  // detached signature、timestamp、nonce、raw digest は検証材料であり、unsigned body digest の対象から除外します。
  return {
    ...request,
    nonce: undefined,
    rawBodyDigest: undefined,
    signature: undefined,
    timestamp: undefined,
  };
}

function requireTimestamp(timestamp: RequestTimestamp | undefined): RequestTimestamp {
  // timestamp がなければ replay window を評価できないため、認証エラーとして即時停止します。
  if (timestamp === undefined) {
    throw createAgentDomainError({
      kind: 'authentication',
      message: 'Integration timestamp missing.',
    });
  }
  return timestamp;
}

function requireRawBodyDigest(rawBodyDigest: RawBodyDigest | undefined): RawBodyDigest {
  // 現行 contract は sha-256 digest に閉じるため、欠損と algorithm mismatch を同じ認証失敗にします。
  if (rawBodyDigest?.algorithm !== 'sha-256') {
    throw createAgentDomainError({
      kind: 'authentication',
      message: 'Integration raw body digest missing or unsupported.',
    });
  }
  return rawBodyDigest;
}

function requireSignature(signature: SignatureMetadata | undefined): SignatureMetadata {
  // detached signature がない ingress は trust key 検証へ進めず、Provider callback として受理しません。
  if (signature === undefined) {
    throw createAgentDomainError({
      kind: 'authentication',
      message: 'Integration signature missing.',
    });
  }
  return signature;
}

function requireIngressIdentity(value: string | undefined, target: string): string {
  // canonical signature base と同じ NFC-trimmed value を context/nonce storage へ渡し、表記揺れを別主体にしません。
  const normalized = value?.trim().normalize('NFC');
  if (normalized === undefined || normalized === '') {
    throw createAgentDomainError({
      kind: 'authentication',
      message: `Integration ${target} is required.`,
      target,
    });
  }
  return normalized;
}

function requireLowercaseSha256Hex(value: string): string {
  // digest は canonical text に lowercase hex で入るため、大小文字を補正せず契約外の metadata を拒否します。
  if (!/^[0-9a-f]{64}$/u.test(value)) {
    throw createAgentDomainError({
      kind: 'authentication',
      message: 'Integration raw body digest must be lowercase SHA-256 hex.',
      target: 'raw_body_digest.digest_hex',
    });
  }
  return value;
}

function requireSafeMilliseconds(value: bigint, target: string): number {
  // JavaScript number へ安全に変換できない値は timestamp window の比較を壊すため、署名前に拒否します。
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw createAgentDomainError({
      kind: 'authentication',
      message: `Integration ${target} is outside the supported range.`,
      target,
    });
  }
  return Number(value);
}

function requireSafeByteLength(value: bigint): number {
  // digest metadata の byte length は unsigned Protobuf body length と厳密比較するため、負値・精度喪失を拒否します。
  if (value < 0n || value > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw createAgentDomainError({
      kind: 'authentication',
      message: 'Integration raw body byte length is outside the supported range.',
      target: 'raw_body_digest.byte_length',
    });
  }
  return Number(value);
}
