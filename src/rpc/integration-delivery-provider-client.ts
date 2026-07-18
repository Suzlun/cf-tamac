import {
  create,
  fromBinary,
  toBinary,
  type DescMessage,
  type MessageShape,
} from '@bufbuild/protobuf';

import {
  BytePayloadReferenceSchema,
  DeliverRequestSchema,
  DeliverResponseSchema,
  IntegrationDeliveryService,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';
import type {
  BytePayloadReference,
  DeliverResponse,
  RawBodyDigest,
  SignatureMetadata,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { createAgentDomainError } from '../domain/errors';
import { buildIntegrationDeliverySignatureMetadata } from '../domain/security/provider-signing';
import { IntegrationDeliveryProviderCallError } from '../integrations/provider-client';

import type { AgentToProviderSigningKey } from '../domain/security/provider-signing';
import type {
  DeliverIntegrationProviderInput,
  DeliverIntegrationProviderResult,
  IntegrationDeliveryProviderClient,
  IntegrationDeliveryProviderOperationResult,
  IntegrationDeliveryProviderRequestRecord,
} from '../integrations/provider-client';

/**
 * Provider へ送る Delivery unary binary Protobuf request です。
 */
export interface IntegrationDeliveryUnaryRequest {
  readonly body: Uint8Array;
  readonly headers: Readonly<Record<string, string>>;
  readonly method: 'POST';
  readonly url: string;
}

/**
 * Provider から返る Delivery unary binary Protobuf response です。
 */
export interface IntegrationDeliveryUnaryResponse {
  readonly body: Uint8Array;
  readonly headers?: Readonly<Record<string, string>>;
  readonly status: number;
}

/**
 * Delivery Provider への実 network 境界です。
 */
export interface IntegrationDeliveryUnaryTransport {
  send(request: IntegrationDeliveryUnaryRequest): Promise<IntegrationDeliveryUnaryResponse>;
}

/**
 * 署名鍵と binary unary transport から Delivery Provider client seam を作成します。
 *
 * @param input Agent-to-Provider 署名鍵と network transport seam です。
 * @returns Integration runtime へ注入できる Delivery Provider client です。
 */
export function createIntegrationDeliveryProviderClient(input: {
  readonly signingKey: AgentToProviderSigningKey;
  readonly transport: IntegrationDeliveryUnaryTransport;
}): IntegrationDeliveryProviderClient {
  return {
    deliver(request) {
      return deliverIntegrationProvider({ ...request, ...input });
    },
  };
}

/**
 * generated `IntegrationDeliveryService.Deliver` descriptor を使って Delivery を送信します。
 *
 * @param input Delivery Provider domain 入力、署名鍵、transport です。
 * @returns Provider 応答と署名済み request metadata です。
 */
export async function deliverIntegrationProvider(
  input: DeliverIntegrationProviderInput & ProviderRuntimeInput
): Promise<DeliverIntegrationProviderResult> {
  const baseMessage = create(DeliverRequestSchema, {
    agentId: input.agentId,
    connectionId: input.connectionId,
    deliveryContextId: input.deliveryContextId,
    deliveryId: input.deliveryId,
    idempotencyKey: input.idempotencyKey,
    installationId: input.installationId,
    nonce: createNonce(input),
    payload: toBytePayloadReference(input.payloadRef),
    runId: input.runId,
    threadId: input.threadId,
    timestamp: createTimestamp(input.timestampUnixMs),
  });
  const signed = await signDeliveryRequest({ ...input, baseMessage });
  const response = await sendSignedBinaryUnary({
    body: toBinary(
      DeliverRequestSchema,
      create(DeliverRequestSchema, { ...baseMessage, ...signed.fields })
    ),
    headers: signed.headers,
    methodName: IntegrationDeliveryService.method.deliver.name,
    outputSchema: DeliverResponseSchema,
    providerTargetRef: input.providerTargetRef,
    record: signed.record,
    transport: input.transport,
  });
  return { record: signed.record, response: mapDeliverResponse(response) };
}

interface ProviderRuntimeInput {
  readonly signingKey: AgentToProviderSigningKey;
  readonly transport: IntegrationDeliveryUnaryTransport;
}

async function signDeliveryRequest(
  input: DeliverIntegrationProviderInput & ProviderRuntimeInput & { readonly baseMessage: unknown }
) {
  const rawBodyBytes = toBinary(DeliverRequestSchema, input.baseMessage as never);
  const metadata = await buildIntegrationDeliverySignatureMetadata({
    agentId: input.agentId,
    connectionId: input.connectionId,
    deliveryContextId: input.deliveryContextId,
    idempotencyKey: input.idempotencyKey,
    installationId: input.installationId,
    method: 'Deliver',
    nonce: input.nonce,
    rawBodyBytes,
    signingKey: input.signingKey,
    timestampUnixMs: input.timestampUnixMs,
  });
  return {
    fields: {
      rawBodyDigest: toRawBodyDigest(metadata.rawBodyDigest),
      signature: toSignatureMetadata(metadata),
    },
    headers: createSignedHeaders(input, metadata.signatureBaseDigest.digestHex),
    record: {
      bodyByteLength: rawBodyBytes.byteLength,
      method: 'Deliver',
      nonce: input.nonce,
      rawBodyDigestHex: metadata.rawBodyDigest.digestHex,
      requestUrl: createProviderRpcUrl(
        input.providerTargetRef,
        IntegrationDeliveryService.method.deliver.name
      ),
      signatureDigestHex: metadata.signatureBaseDigest.digestHex,
    } satisfies IntegrationDeliveryProviderRequestRecord,
  };
}

async function sendSignedBinaryUnary<OutputSchema extends DescMessage>(input: {
  readonly body: Uint8Array;
  readonly headers: Readonly<Record<string, string>>;
  readonly methodName: string;
  readonly outputSchema: OutputSchema;
  readonly providerTargetRef: string;
  readonly record: IntegrationDeliveryProviderRequestRecord;
  readonly transport: IntegrationDeliveryUnaryTransport;
}): Promise<MessageShape<OutputSchema>> {
  try {
    return await sendBinaryUnary(input);
  } catch (error) {
    throw new IntegrationDeliveryProviderCallError({
      message: error instanceof Error ? error.message : 'Integration Delivery Provider RPC failed.',
      originalError: error,
      record: input.record,
    });
  }
}

async function sendBinaryUnary<OutputSchema extends DescMessage>(input: {
  readonly body: Uint8Array;
  readonly headers: Readonly<Record<string, string>>;
  readonly methodName: string;
  readonly outputSchema: OutputSchema;
  readonly providerTargetRef: string;
  readonly transport: IntegrationDeliveryUnaryTransport;
}): Promise<MessageShape<OutputSchema>> {
  const response = await input.transport.send({
    body: input.body,
    headers: input.headers,
    method: 'POST',
    url: createProviderRpcUrl(input.providerTargetRef, input.methodName),
  });
  if (response.status < 200 || response.status > 299) {
    throw createAgentDomainError({
      kind: 'provider_failure',
      message: 'Integration Delivery Provider RPC failed.',
      safeDetails: { status: String(response.status) },
    });
  }
  return fromBinary(input.outputSchema, response.body);
}

function createProviderRpcUrl(providerTargetRef: string, method: string): string {
  return `${providerTargetRef.replace(/\/+$/, '')}/${IntegrationDeliveryService.typeName}/${method}`;
}

function createTimestamp(timestampUnixMs: number) {
  return { acceptedSkewMs: 300_000n, source: 'agent', unixMs: BigInt(timestampUnixMs) };
}

function createNonce(input: { readonly installationId: string; readonly nonce: string }) {
  return {
    firstSeenUnixMs: undefined,
    nonce: input.nonce,
    principalId: input.installationId,
    ttlSeconds: 300,
  };
}

function toBytePayloadReference(ref: string): BytePayloadReference {
  return create(BytePayloadReferenceSchema, {
    byteSize: 0n,
    contentType: 'application/octet-stream',
    ref,
    sha256: '',
    storageClass: 'reference',
  });
}

function toRawBodyDigest(input: {
  readonly algorithm: string;
  readonly byteLength: number;
  readonly digestHex: string;
}): RawBodyDigest {
  return {
    $typeName: 'cftamac.agent.v1.RawBodyDigest',
    algorithm: input.algorithm,
    byteLength: BigInt(input.byteLength),
    digestHex: input.digestHex,
  };
}

function toSignatureMetadata(input: {
  readonly algorithm: string;
  readonly keyId: string;
  readonly method: string;
  readonly service: string;
  readonly signature: Uint8Array;
  readonly timestampUnixMs: number;
}): SignatureMetadata {
  return {
    $typeName: 'cftamac.agent.v1.SignatureMetadata',
    algorithm: input.algorithm,
    keyId: input.keyId,
    method: input.method,
    service: input.service,
    signature: input.signature,
    signedAtUnixMs: BigInt(input.timestampUnixMs),
  };
}

function createSignedHeaders(
  input: DeliverIntegrationProviderInput & ProviderRuntimeInput,
  signatureDigestHex: string
): Readonly<Record<string, string>> {
  return {
    'Content-Type': 'application/proto',
    'x-agent-connection-id': input.connectionId,
    'x-agent-delivery-context-id': input.deliveryContextId,
    'x-agent-delivery-id': input.deliveryId,
    'x-agent-id': input.agentId,
    'x-agent-idempotency-key': input.idempotencyKey,
    'x-agent-installation-id': input.installationId,
    'x-agent-nonce': input.nonce,
    'x-agent-provider-method': 'Deliver',
    'x-agent-provider-service': IntegrationDeliveryService.typeName,
    'x-agent-provider-target-ref': input.providerTargetRef,
    'x-agent-signature-digest': signatureDigestHex,
    'x-agent-signature-key-id': input.signingKey.keyId,
  };
}

function mapDeliverResponse(response: DeliverResponse) {
  return { operation: mapProviderOperation(response.operation), status: response.status };
}

function mapProviderOperation(
  operation:
    | {
        readonly operationId: string;
        readonly providerOperationRef?: string;
        readonly status: string;
      }
    | undefined
): IntegrationDeliveryProviderOperationResult | undefined {
  if (operation === undefined) return undefined;
  return {
    operationId: operation.operationId,
    providerOperationRef: operation.providerOperationRef,
    status: operation.status,
  };
}
