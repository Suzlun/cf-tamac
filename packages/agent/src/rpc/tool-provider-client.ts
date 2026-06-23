import {
  create,
  fromBinary,
  toBinary,
  type DescMessage,
  type MessageShape,
} from '@bufbuild/protobuf';

import {
  CancelOperationRequestSchema,
  CancelOperationResponseSchema,
  BytePayloadReferenceSchema,
  GetOperationRequestSchema,
  GetOperationResponseSchema,
  IntegrationToolService,
  InvokeToolRequestSchema,
  InvokeToolResponseSchema,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';
import type {
  BytePayloadReference,
  CancelOperationResponse,
  GetOperationResponse,
  InvokeToolResponse,
  RawBodyDigest,
  SignatureMetadata,
} from '@cf-tamac/agent-rpc/cftamac/agent/v1_pb';

import { createAgentDomainError } from '../domain/errors';
import { buildIntegrationToolSignatureMetadata } from '../domain/security/provider-signing';
import { IntegrationToolProviderCallError } from '../tools/provider-client';

import type { AgentToProviderSigningKey } from '../domain/security/provider-signing';
import type {
  CancelIntegrationToolOperationInput,
  CancelIntegrationToolOperationResult,
  GetIntegrationToolOperationInput,
  GetIntegrationToolOperationResult,
  IntegrationToolProviderCallBase,
  IntegrationToolProviderClient,
  IntegrationToolProviderOperationResult,
  IntegrationToolProviderRequestRecord,
  InvokeIntegrationToolInput,
  InvokeIntegrationToolResult,
} from '../tools/provider-client';

/**
 * Provider へ送る unary binary Protobuf request です。
 */
export interface IntegrationToolUnaryRequest {
  readonly body: Uint8Array;
  readonly headers: Readonly<Record<string, string>>;
  readonly method: 'POST';
  readonly url: string;
}

/**
 * Provider から返る unary binary Protobuf response です。
 */
export interface IntegrationToolUnaryResponse {
  readonly body: Uint8Array;
  readonly headers?: Readonly<Record<string, string>>;
  readonly status: number;
}

/**
 * 実 network 境界を注入する transport seam です。
 */
export interface IntegrationToolUnaryTransport {
  send(request: IntegrationToolUnaryRequest): Promise<IntegrationToolUnaryResponse>;
}

/**
 * 署名鍵と binary unary transport から generated IntegrationToolService client seam を作成します。
 *
 * @param input Agent-to-Provider 署名鍵と network transport seam です。
 * @returns Tool runtime 層へ注入できる Provider client seam です。
 * @throws 各 method 呼び出し時に署名生成、binary Protobuf encode/decode、Provider transport が失敗した場合は例外を伝播します。
 * @example
 * ```ts
 * const client = createIntegrationToolProviderClient({ signingKey, transport });
 * ```
 */
export function createIntegrationToolProviderClient(input: {
  readonly signingKey: AgentToProviderSigningKey;
  readonly transport: IntegrationToolUnaryTransport;
}): IntegrationToolProviderClient {
  return {
    cancelOperation(request) {
      return cancelIntegrationToolOperation({ ...request, ...input });
    },
    getOperation(request) {
      return getIntegrationToolOperation({ ...request, ...input });
    },
    invokeTool(request) {
      return invokeIntegrationTool({ ...request, ...input });
    },
  };
}

/**
 * generated `IntegrationToolService.InvokeTool` descriptor を使い binary Protobuf RPC を送信します。
 */
export async function invokeIntegrationTool(
  input: InvokeIntegrationToolInput & ProviderRuntimeInput
): Promise<InvokeIntegrationToolResult> {
  const baseMessage = create(InvokeToolRequestSchema, {
    agentId: input.agentId,
    idempotencyKey: input.idempotencyKey,
    input: toBytePayloadReference(input.inputRef),
    installationId: input.installationId,
    invocationId: input.invocationId,
    nonce: createNonce(input),
    runId: input.runId,
    threadId: input.threadId,
    timestamp: createTimestamp(input.timestampUnixMs),
    toolId: input.toolId,
  });
  const signed = await signToolRequest({ ...input, baseMessage, method: 'InvokeTool' });
  const response = await sendSignedBinaryUnary({
    body: toBinary(
      InvokeToolRequestSchema,
      create(InvokeToolRequestSchema, { ...baseMessage, ...signed.fields })
    ),
    headers: signed.headers,
    methodName: IntegrationToolService.method.invokeTool.name,
    outputSchema: InvokeToolResponseSchema,
    providerTargetRef: input.providerTargetRef,
    record: signed.record,
    transport: input.transport,
  });
  return { record: signed.record, response: mapInvokeResponse(response) };
}

/**
 * generated `IntegrationToolService.GetOperation` descriptor を使い Provider operation を照合します。
 */
export async function getIntegrationToolOperation(
  input: GetIntegrationToolOperationInput & ProviderRuntimeInput
): Promise<GetIntegrationToolOperationResult> {
  const baseMessage = create(GetOperationRequestSchema, {
    agentId: input.agentId,
    installationId: input.installationId,
    invocationId: input.invocationId,
    nonce: createNonce(input),
    operationId: input.operationId,
    timestamp: createTimestamp(input.timestampUnixMs),
  });
  const signed = await signToolRequest({ ...input, baseMessage, method: 'GetOperation' });
  const response = await sendSignedBinaryUnary<typeof GetOperationResponseSchema>({
    body: toBinary(
      GetOperationRequestSchema,
      create(GetOperationRequestSchema, { ...baseMessage, ...signed.fields })
    ),
    headers: signed.headers,
    methodName: IntegrationToolService.method.getOperation.name,
    outputSchema: GetOperationResponseSchema,
    providerTargetRef: input.providerTargetRef,
    record: signed.record,
    transport: input.transport,
  });
  return { record: signed.record, response: mapGetOperationResponse(response) };
}

/**
 * generated `IntegrationToolService.CancelOperation` descriptor を使い Provider operation 取消を伝播します。
 */
export async function cancelIntegrationToolOperation(
  input: CancelIntegrationToolOperationInput & ProviderRuntimeInput
): Promise<CancelIntegrationToolOperationResult> {
  const baseMessage = create(CancelOperationRequestSchema, {
    agentId: input.agentId,
    idempotencyKey: input.idempotencyKey,
    installationId: input.installationId,
    invocationId: input.invocationId,
    nonce: createNonce(input),
    operationId: input.operationId,
    reason: input.reason,
    timestamp: createTimestamp(input.timestampUnixMs),
  });
  const signed = await signToolRequest({ ...input, baseMessage, method: 'CancelOperation' });
  const response = await sendSignedBinaryUnary<typeof CancelOperationResponseSchema>({
    body: toBinary(
      CancelOperationRequestSchema,
      create(CancelOperationRequestSchema, { ...baseMessage, ...signed.fields })
    ),
    headers: signed.headers,
    methodName: IntegrationToolService.method.cancelOperation.name,
    outputSchema: CancelOperationResponseSchema,
    providerTargetRef: input.providerTargetRef,
    record: signed.record,
    transport: input.transport,
  });
  return { record: signed.record, response: mapCancelOperationResponse(response) };
}

interface ProviderRuntimeInput {
  readonly signingKey: AgentToProviderSigningKey;
  readonly transport: IntegrationToolUnaryTransport;
}

type ToolProviderMethod = 'CancelOperation' | 'GetOperation' | 'InvokeTool';

async function signToolRequest(
  input: IntegrationToolProviderCallBase &
    ProviderRuntimeInput & {
      readonly baseMessage: unknown;
      readonly invocationId: string;
      readonly method: ToolProviderMethod;
    }
) {
  const rawBodyBytes = encodeBaseMessage(input.method, input.baseMessage);
  const metadata = await buildIntegrationToolSignatureMetadata({
    agentId: input.agentId,
    idempotencyKey: input.idempotencyKey,
    installationId: input.installationId,
    invocationId: input.invocationId,
    method: input.method,
    nonce: input.nonce,
    rawBodyBytes,
    signingKey: input.signingKey,
    timestampUnixMs: input.timestampUnixMs,
    toolId: input.toolId,
  });
  const rawBodyDigest = toRawBodyDigest(metadata.rawBodyDigest);
  const signature = toSignatureMetadata(metadata);
  return {
    fields: { rawBodyDigest, signature },
    headers: createSignedHeaders(input, metadata.signatureBaseDigest.digestHex),
    record: {
      bodyByteLength: rawBodyBytes.byteLength,
      method: input.method,
      nonce: input.nonce,
      rawBodyDigestHex: metadata.rawBodyDigest.digestHex,
      requestUrl: createProviderRpcUrl(input.providerTargetRef, input.method),
      signatureDigestHex: metadata.signatureBaseDigest.digestHex,
    } satisfies IntegrationToolProviderRequestRecord,
  };
}

function encodeBaseMessage(method: ToolProviderMethod, message: unknown): Uint8Array {
  if (method === 'InvokeTool') return toBinary(InvokeToolRequestSchema, message as never);
  if (method === 'GetOperation') return toBinary(GetOperationRequestSchema, message as never);
  return toBinary(CancelOperationRequestSchema, message as never);
}

async function sendSignedBinaryUnary<OutputSchema extends DescMessage>(input: {
  readonly body: Uint8Array;
  readonly headers: Readonly<Record<string, string>>;
  readonly methodName: string;
  readonly outputSchema: OutputSchema;
  readonly providerTargetRef: string;
  readonly record: IntegrationToolProviderRequestRecord;
  readonly transport: IntegrationToolUnaryTransport;
}): Promise<MessageShape<OutputSchema>> {
  try {
    // Provider へ送る直前に確定済み record を保持し、transport failure でも監査 ledger へ戻せるようにします。
    return await sendBinaryUnary(input);
  } catch (error) {
    // raw error は secrets を含む可能性があるため、Tool 層へは安全な message と request record だけを渡します。
    throw new IntegrationToolProviderCallError({
      message: error instanceof Error ? error.message : 'Integration Tool Provider RPC failed.',
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
  readonly transport: IntegrationToolUnaryTransport;
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
      message: 'Integration Tool Provider RPC failed.',
      safeDetails: { status: String(response.status) },
    });
  }
  return fromBinary(input.outputSchema, response.body);
}

function createProviderRpcUrl(providerTargetRef: string, method: string): string {
  return `${providerTargetRef.replace(/\/+$/, '')}/${IntegrationToolService.typeName}/${method}`;
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

function toBytePayloadReference(ref: string | undefined): BytePayloadReference | undefined {
  if (ref === undefined) return undefined;
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
  input: IntegrationToolProviderCallBase &
    ProviderRuntimeInput & {
      readonly invocationId: string;
      readonly method: ToolProviderMethod;
    },
  signatureDigestHex: string
): Readonly<Record<string, string>> {
  return {
    'Content-Type': 'application/proto',
    'x-agent-id': input.agentId,
    'x-agent-idempotency-key': input.idempotencyKey,
    'x-agent-installation-id': input.installationId,
    'x-agent-invocation-id': input.invocationId,
    'x-agent-nonce': input.nonce,
    'x-agent-provider-method': input.method,
    'x-agent-provider-service': IntegrationToolService.typeName,
    'x-agent-provider-target-ref': input.providerTargetRef,
    'x-agent-signature-digest': signatureDigestHex,
    'x-agent-signature-key-id': input.signingKey.keyId,
    'x-agent-tool-id': input.toolId,
  };
}

function mapInvokeResponse(response: InvokeToolResponse) {
  return {
    invocationStatus: response.invocationStatus,
    operation: mapProviderOperation(response.operation),
    outputRef: response.output?.ref,
  };
}

function mapGetOperationResponse(response: GetOperationResponse) {
  return { operation: mapProviderOperation(response.operation), outputRef: response.output?.ref };
}

function mapCancelOperationResponse(response: CancelOperationResponse) {
  return {
    cancellationStatus: response.cancellationStatus,
    operation: mapProviderOperation(response.operation),
  };
}

function mapProviderOperation(
  operation:
    | {
        readonly operationId: string;
        readonly providerOperationRef?: string;
        readonly status: string;
      }
    | undefined
): IntegrationToolProviderOperationResult | undefined {
  if (operation === undefined) return undefined;
  return {
    operationId: operation.operationId,
    providerOperationRef: operation.providerOperationRef,
    status: operation.status,
  };
}
