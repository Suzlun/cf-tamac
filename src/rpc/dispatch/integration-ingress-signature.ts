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
  const nonce = request.nonce?.nonce;
  if (nonce === undefined || nonce === '') {
    throw createAgentDomainError({ kind: 'authentication', message: 'Integration nonce missing.' });
  }

  // protobuf の 64bit 数値表現を domain 層の millisecond/byte 数値へ揃え、署名材料の意味を固定します。
  return {
    acceptedSkewMs: Number(timestamp.acceptedSkewMs),
    algorithm: signature.algorithm,
    byteLength: Number(rawBodyDigest.byteLength),
    digestHex: rawBodyDigest.digestHex,
    keyId: signature.keyId,
    nonce,
    signature: signature.signature,
    signedAtMs: Number(signature.signedAtUnixMs),
    timestampMs: Number(timestamp.unixMs),
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
