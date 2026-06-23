/**
 * Provider へ送った Delivery RPC request の保存用 metadata です。
 *
 * @remarks
 * generated RPC descriptor を Integration domain へ漏らさず、Delivery ledger に必要な
 * raw protobuf digest、nonce、署名 digest、送信先だけを保持します。
 */
export interface IntegrationDeliveryProviderRequestRecord {
  readonly bodyByteLength: number;
  readonly method: 'Deliver';
  readonly nonce: string;
  readonly rawBodyDigestHex: string;
  readonly requestUrl: string;
  readonly signatureDigestHex: string;
}

/**
 * Delivery Provider が返す operation の domain-safe view です。
 */
export interface IntegrationDeliveryProviderOperationResult {
  readonly operationId: string;
  readonly providerOperationRef?: string;
  readonly status: string;
}

/**
 * Delivery Provider 呼び出しの入力です。
 */
export interface DeliverIntegrationProviderInput {
  readonly agentId: string;
  readonly connectionId: string;
  readonly deliveryContextId: string;
  readonly deliveryId: string;
  readonly idempotencyKey: string;
  readonly installationId: string;
  readonly nonce: string;
  readonly payloadRef: string;
  readonly providerTargetRef: string;
  readonly runId: string;
  readonly threadId: string;
  readonly timestampUnixMs: number;
}

/**
 * Delivery Provider 呼び出しの応答です。
 */
export interface DeliverIntegrationProviderResponse {
  readonly operation?: IntegrationDeliveryProviderOperationResult;
  readonly status: string;
}

/**
 * Delivery Provider 呼び出し結果と送信 metadata です。
 */
export interface DeliverIntegrationProviderResult {
  readonly record: IntegrationDeliveryProviderRequestRecord;
  readonly response: DeliverIntegrationProviderResponse;
}

/**
 * Integration runtime 層から注入される Delivery Provider client seam です。
 *
 * @remarks
 * 実装は RPC layer に置かれ、ここでは Provider protocol と generated descriptor の詳細を扱いません。
 */
export interface IntegrationDeliveryProviderClient {
  deliver(input: DeliverIntegrationProviderInput): Promise<DeliverIntegrationProviderResult>;
}

/**
 * Provider RPC が失敗したときも request metadata を保持する error です。
 */
export class IntegrationDeliveryProviderCallError extends Error {
  readonly originalError: unknown;
  readonly record: IntegrationDeliveryProviderRequestRecord;

  constructor(input: {
    readonly message: string;
    readonly originalError?: unknown;
    readonly record: IntegrationDeliveryProviderRequestRecord;
  }) {
    super(input.message);
    this.name = 'IntegrationDeliveryProviderCallError';
    this.originalError = input.originalError;
    this.record = input.record;
  }
}

/**
 * unknown error から Delivery Provider request metadata を取り出します。
 *
 * @param error Provider client から送出された任意の error です。
 * @returns metadata 付き Delivery Provider error なら request record、それ以外は `undefined` です。
 */
export function getIntegrationDeliveryProviderRequestRecord(
  error: unknown
): IntegrationDeliveryProviderRequestRecord | undefined {
  return error instanceof IntegrationDeliveryProviderCallError ? error.record : undefined;
}
