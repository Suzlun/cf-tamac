import { create, toBinary } from '@bufbuild/protobuf';
import { createClient } from '@connectrpc/connect';

import { normalizeTamacSdkError } from './errors';
import {
  IntegrationIngressService,
  NonceMetadataSchema,
  PublishDeliveryResultRequestSchema,
  PublishIntegrationEventRequestSchema,
  PublishToolResultRequestSchema,
  RawBodyDigestSchema,
  RequestTimestampSchema,
  SignatureMetadataSchema,
} from './generated/agent-rpc/cftamac/agent/v1_pb';
import { createTamacProviderIngressTransport } from './provider-ingress-transport';

import type {
  NonceMetadata,
  PublishDeliveryResultResponse,
  PublishIntegrationEventResponse,
  PublishToolResultResponse,
  RawBodyDigest,
  RequestTimestamp,
  SignatureMetadata,
} from './generated/agent-rpc/cftamac/agent/v1_pb';
import type {
  ProviderIngressInvocationContext,
  TamacProviderIngressClientConfig,
  TamacProviderPublishDeliveryResultInput,
  TamacProviderPublishEventInput,
  TamacProviderPublishToolResultInput,
} from './provider-ingress-types';

const PROVIDER_INGRESS_SERVICE = IntegrationIngressService.typeName;
const PROVIDER_SIGNATURE_ALGORITHM = 'Ed25519';
const PROVIDER_TIMESTAMP_SKEW_MS = 300_000n;
const PROVIDER_NONCE_TTL_SECONDS = 300;
const textEncoder = new TextEncoder();

/**
 * Integration Provider が detached signature で Agent ingress を呼ぶ three-method surface です。
 *
 * @remarks
 * Client Service lifecycle/configuration operation は公開しません。各 method は Provider invocation から
 * Installation principal identity、timestamp、nonce、idempotency、request/correlation metadata を得て、unsigned
 * Protobuf body の digest と fixed-order canonical input を Ed25519 signer callback へ渡します。
 *
 * @example
 * ```ts
 * await client.publishEvent({ connectionId: 'connection-001', threadKey: 'thread-001' });
 * ```
 */
export interface TamacProviderIngressClient {
  /** signed `IntegrationIngressService.PublishEvent` request を送信します。 */
  readonly publishEvent: (
    input: TamacProviderPublishEventInput
  ) => Promise<PublishIntegrationEventResponse>;
  /** signed `IntegrationIngressService.PublishToolResult` request を送信します。 */
  readonly publishToolResult: (
    input: TamacProviderPublishToolResultInput
  ) => Promise<PublishToolResultResponse>;
  /** signed `IntegrationIngressService.PublishDeliveryResult` request を送信します。 */
  readonly publishDeliveryResult: (
    input: TamacProviderPublishDeliveryResultInput
  ) => Promise<PublishDeliveryResultResponse>;
}

/**
 * Provider detached-signature principal 専用の Integration ingress client を作成します。
 *
 * @param config - HTTPS Agent origin、Provider invocation identity、Provider-owned Ed25519 signer、任意 fetch です。
 * @returns event、tool result、delivery result だけを持つ Provider ingress client。
 * @throws Provider identity、canonical signer、HTTPS transport が不完全な場合、request を送信せずに投げます。
 * @remarks
 * 返却 surface は Client Service aggregate と完全に分離され、JWT、acting user、scope、Client D1/Next.js context を
 * 受け取りません。署名対象には raw request ではなく、security metadata を除いた unsigned generated Protobuf bytes の
 * lowercase SHA-256 digest と byte length を使います。
 */
export function createTamacProviderIngressClient(
  config: TamacProviderIngressClientConfig
): TamacProviderIngressClient {
  // Provider identity と signer key identity を先に検証し、部分的な signature metadata を作らないようにします。
  assertProviderIngressConfig(config);
  // three operations が共有する binary transport を一度だけ作り、HTTP metadata の許可面を一定にします。
  const transport = createTamacProviderIngressTransport({
    agentRpcOrigin: config.agentRpcOrigin,
    fetch: config.fetch,
    invocation: config.invocation,
  });
  // generated Integration ingress descriptor は private closure に閉じ、Provider 専用 3 method だけを公開します。
  const ingress = createClient(IntegrationIngressService, transport);
  return {
    publishDeliveryResult: async (input) => {
      // delivery record と capability context の identity を signer/fetch より前に検証し、sentinel 署名を許可しません。
      assertRequiredProviderOperationIdentity(input.deliveryId, 'deliveryId');
      assertRequiredProviderOperationIdentity(input.deliveryContextId, 'deliveryContextId');
      // unsigned request を一回だけ binary 化して digest/byte length を決定します。
      const unsignedRequest = create(PublishDeliveryResultRequestSchema, {
        ...input,
        agentId: config.invocation.agentId,
        idempotencyKey: config.invocation.idempotencyKey,
        installationId: config.invocation.installationId,
      });
      const security = await createProviderIngressSecurityMetadata({
        identity: { deliveryContextId: input.deliveryContextId, method: 'PublishDeliveryResult' },
        invocation: config.invocation,
        signing: config.signing,
        unsignedBody: toBinary(PublishDeliveryResultRequestSchema, unsignedRequest),
      });
      // generated request に署名済み metadata を設定してから、typed binary Connect method へ渡します。
      return normalizeProviderIngressOperation(
        () =>
          ingress.publishDeliveryResult(
            create(PublishDeliveryResultRequestSchema, { ...unsignedRequest, ...security })
          ),
        config.invocation,
        'PublishDeliveryResult'
      );
    },
    publishEvent: async (input) => {
      // active Adapter connection identity を signer/fetch より前に検証し、未所属 event ingress を許可しません。
      assertRequiredProviderOperationIdentity(input.connectionId, 'connectionId');
      // unsigned request を一回だけ binary 化して digest/byte length を決定します。
      const unsignedRequest = create(PublishIntegrationEventRequestSchema, {
        ...input,
        agentId: config.invocation.agentId,
        idempotencyKey: config.invocation.idempotencyKey,
        installationId: config.invocation.installationId,
      });
      const security = await createProviderIngressSecurityMetadata({
        identity: { connectionId: input.connectionId, method: 'PublishEvent' },
        invocation: config.invocation,
        signing: config.signing,
        unsignedBody: toBinary(PublishIntegrationEventRequestSchema, unsignedRequest),
      });
      // generated request に署名済み metadata を設定してから、typed binary Connect method へ渡します。
      return normalizeProviderIngressOperation(
        () =>
          ingress.publishEvent(
            create(PublishIntegrationEventRequestSchema, { ...unsignedRequest, ...security })
          ),
        config.invocation,
        'PublishEvent'
      );
    },
    publishToolResult: async (input) => {
      // Agent-owned Tool invocation identity を signer/fetch より前に検証し、sentinel result callback を許可しません。
      assertRequiredProviderOperationIdentity(input.invocationId, 'invocationId');
      // unsigned request を一回だけ binary 化して digest/byte length を決定します。
      const unsignedRequest = create(PublishToolResultRequestSchema, {
        ...input,
        agentId: config.invocation.agentId,
        idempotencyKey: config.invocation.idempotencyKey,
        installationId: config.invocation.installationId,
      });
      const security = await createProviderIngressSecurityMetadata({
        identity: { invocationId: input.invocationId, method: 'PublishToolResult' },
        invocation: config.invocation,
        signing: config.signing,
        unsignedBody: toBinary(PublishToolResultRequestSchema, unsignedRequest),
      });
      // generated request に署名済み metadata を設定してから、typed binary Connect method へ渡します。
      return normalizeProviderIngressOperation(
        () =>
          ingress.publishToolResult(
            create(PublishToolResultRequestSchema, { ...unsignedRequest, ...security })
          ),
        config.invocation,
        'PublishToolResult'
      );
    },
  };
}

async function normalizeProviderIngressOperation<Response>(
  operation: () => Promise<Response>,
  invocation: ProviderIngressInvocationContext,
  methodName: ProviderCanonicalIdentity['method']
): Promise<Response> {
  try {
    // generated client の typed result をそのまま返し、Provider public surface の response shape を保ちます。
    return await operation();
  } catch (error) {
    // Connect が interceptor error を再度包んだ場合も cause を復元し、Provider operation context を失わず正規化します。
    throw normalizeTamacSdkError(error, {
      agentId: invocation.agentId,
      correlationId: invocation.correlationId,
      idempotencyKey: invocation.idempotencyKey,
      methodContext: { methodName, serviceName: PROVIDER_INGRESS_SERVICE },
      requestId: invocation.requestId,
    });
  }
}

interface ProviderCanonicalIdentity {
  readonly connectionId?: string;
  readonly deliveryContextId?: string;
  readonly invocationId?: string;
  readonly method: 'PublishDeliveryResult' | 'PublishEvent' | 'PublishToolResult';
}

interface ProviderIngressSecurityMetadata {
  readonly nonce: NonceMetadata;
  readonly rawBodyDigest: RawBodyDigest;
  readonly signature: SignatureMetadata;
  readonly timestamp: RequestTimestamp;
}

interface ProviderIngressSecurityMetadataInput {
  readonly identity: ProviderCanonicalIdentity;
  readonly invocation: ProviderIngressInvocationContext;
  readonly signing: TamacProviderIngressClientConfig['signing'];
  readonly unsignedBody: Uint8Array;
}

async function createProviderIngressSecurityMetadata(
  input: ProviderIngressSecurityMetadataInput
): Promise<ProviderIngressSecurityMetadata> {
  // unsigned Protobuf bytes の SHA-256 を計算し、canonical input と body metadata が同じ digest を使うようにします。
  const digestHex = await computeSha256Hex(input.unsignedBody);
  const bodyLength = BigInt(input.unsignedBody.byteLength);
  // fixed field order、NFC trim、sentinel、lowercase digest、base-10 number で canonical UTF-8 text を作ります。
  const canonicalText = createProviderCanonicalText({
    ...input.identity,
    agentId: input.invocation.agentId,
    bodyLength,
    digestHex,
    idempotencyKey: input.invocation.idempotencyKey,
    installationId: input.invocation.installationId,
    nonce: input.invocation.nonce,
    service: PROVIDER_INGRESS_SERVICE,
    timestampUnixMs: input.invocation.timestampUnixMs,
  });
  // Provider-owned signer へ canonical text の UTF-8 bytes だけを渡し、key material を SDK に渡しません。
  const signatureBytes = await input.signing.signDetached(textEncoder.encode(canonicalText));
  // signature callback の空出力を request 送信前に拒否し、Agent 側に検証不能な metadata を渡しません。
  if (signatureBytes.byteLength === 0) {
    throw new TypeError('Provider detached signature must not be empty.');
  }
  // generated security metadata を unsigned request digest、Provider principal、fixed service/method identity で作ります。
  return {
    nonce: create(NonceMetadataSchema, {
      firstSeenUnixMs: BigInt(input.invocation.timestampUnixMs),
      nonce: input.invocation.nonce,
      principalId: input.invocation.installationId,
      ttlSeconds: PROVIDER_NONCE_TTL_SECONDS,
    }),
    rawBodyDigest: create(RawBodyDigestSchema, {
      algorithm: 'sha-256',
      byteLength: bodyLength,
      digestHex,
    }),
    signature: create(SignatureMetadataSchema, {
      algorithm: PROVIDER_SIGNATURE_ALGORITHM,
      keyId: input.signing.keyId,
      method: input.identity.method,
      service: PROVIDER_INGRESS_SERVICE,
      signature: signatureBytes,
      signedAtUnixMs: BigInt(input.invocation.timestampUnixMs),
    }),
    timestamp: create(RequestTimestampSchema, {
      acceptedSkewMs: PROVIDER_TIMESTAMP_SKEW_MS,
      source: 'integration-provider',
      unixMs: BigInt(input.invocation.timestampUnixMs),
    }),
  };
}

interface ProviderCanonicalTextInput extends ProviderCanonicalIdentity {
  readonly agentId: string;
  readonly bodyLength: bigint;
  readonly digestHex: string;
  readonly idempotencyKey: string;
  readonly installationId: string;
  readonly nonce: string;
  readonly service: string;
  readonly timestampUnixMs: number;
}

function createProviderCanonicalText(input: ProviderCanonicalTextInput): string {
  // Agent verifier と一致する line order を固定し、fields の追加・並び替えによる signature ambiguity を防ぎます。
  return [
    'agent-detached-signature-v1',
    `service:${canonicalizeIdentity(input.service)}`,
    `method:${canonicalizeIdentity(input.method)}`,
    `agent_id:${canonicalizeIdentity(input.agentId)}`,
    `installation_id:${canonicalizeIdentity(input.installationId)}`,
    `connection_id:${canonicalizeOptionalIdentity(input.connectionId)}`,
    'tool_id:-',
    `invocation_id:${canonicalizeOptionalIdentity(input.invocationId)}`,
    `delivery_context_id:${canonicalizeOptionalIdentity(input.deliveryContextId)}`,
    `timestamp_unix_ms:${String(input.timestampUnixMs)}`,
    `nonce:${canonicalizeIdentity(input.nonce)}`,
    `idempotency_key:${canonicalizeIdentity(input.idempotencyKey)}`,
    `body_sha256:${input.digestHex.toLowerCase()}`,
    `body_length:${String(input.bodyLength)}`,
  ].join('\n');
}

function canonicalizeIdentity(value: string): string {
  // whitespace を除去して NFC に正規化し、Provider/Agent の Unicode 表現差で署名が分岐しないようにします。
  return value.trim().normalize('NFC');
}

function canonicalizeOptionalIdentity(value: string | undefined): string {
  // absent と whitespace-only optional identity を固定 sentinel へ畳み、empty line と意味を区別します。
  if (value === undefined || value.trim() === '') {
    return '-';
  }
  // present value は required identity と同じ NFC trim rule を適用します。
  return canonicalizeIdentity(value);
}

async function computeSha256Hex(bytes: Uint8Array): Promise<string> {
  // Web Crypto へ unsigned Protobuf bytes を渡し、signature base が raw decoded object に依存しないようにします。
  const digest = await globalThis.crypto.subtle.digest('SHA-256', copyToArrayBuffer(bytes));
  // bytes を二桁 lowercase hex へ変換し、canonical contract の digest representation を固定します。
  let digestHex = '';
  for (const byte of new Uint8Array(digest)) {
    digestHex += byte.toString(16).padStart(2, '0');
  }
  return digestHex;
}

function copyToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  // Web Crypto 用に独立した ArrayBuffer を確保し、SharedArrayBuffer を含み得る view を直接渡しません。
  const buffer = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(buffer).set(bytes);
  return buffer;
}

function assertProviderIngressConfig(config: TamacProviderIngressClientConfig): void {
  // canonical identity の空値を送信前に拒否し、Agent verifier と replay repository の曖昧さを防ぎます。
  for (const [name, value] of Object.entries({
    agentId: config.invocation.agentId,
    correlationId: config.invocation.correlationId,
    idempotencyKey: config.invocation.idempotencyKey,
    installationId: config.invocation.installationId,
    keyId: config.signing.keyId,
    nonce: config.invocation.nonce,
    requestId: config.invocation.requestId,
  })) {
    if (value.trim() === '') {
      throw new TypeError(`Provider ingress ${name} must not be empty.`);
    }
  }
  // timestamp は非負の safe integer milliseconds に限定し、canonical decimal representation と Agent replay window を保ちます。
  if (
    !Number.isSafeInteger(config.invocation.timestampUnixMs) ||
    config.invocation.timestampUnixMs < 0
  ) {
    throw new TypeError('Provider ingress timestampUnixMs must be a non-negative safe integer.');
  }
}

function assertRequiredProviderOperationIdentity(value: string, name: string): void {
  // NFC canonicalization 後に空へ畳まれる whitespace-only value を署名・送信前に拒否します。
  if (value.trim().normalize('NFC') === '') {
    throw new TypeError(`Provider ingress ${name} must not be empty.`);
  }
}
