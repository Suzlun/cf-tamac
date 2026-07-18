/**
 * Provider へ送った Tool RPC request の保存用 metadata です。
 *
 * @remarks
 * この型は generated RPC descriptor に依存せず、Tool domain/runtime 層が Provider 呼び出しの結果を
 * storage へ記録するために必要な最小限の監査情報だけを表します。
 */
export interface IntegrationToolProviderRequestRecord {
  readonly bodyByteLength: number;
  readonly method: 'CancelOperation' | 'GetOperation' | 'InvokeTool';
  readonly nonce: string;
  readonly rawBodyDigestHex: string;
  readonly requestUrl: string;
  readonly signatureDigestHex: string;
}

/**
 * Provider RPC が失敗したときにも署名済み request metadata を保持する error です。
 *
 * @remarks
 * Tool runtime は generated RPC descriptor を直接参照できないため、RPC layer が送信前に作った
 * raw protobuf digest、nonce、署名 digest、Provider target をこの error に閉じ込めます。
 * 呼び出し側はこの metadata を Agent-owned ledger に保存し、timeout や Provider failure 後も
 * `GetOperation` による照合へ進めます。
 *
 * @example
 * ```ts
 * throw new IntegrationToolProviderCallError({ message, record });
 * ```
 */
export class IntegrationToolProviderCallError extends Error {
  /**
   * RPC layer が署名時に確定した Provider request metadata です。
   */
  readonly record: IntegrationToolProviderRequestRecord;

  /**
   * 元の transport / Provider error です。secrets を含む可能性があるため外部応答には直接出しません。
   */
  readonly originalError: unknown;

  constructor(input: {
    readonly message: string;
    readonly originalError?: unknown;
    readonly record: IntegrationToolProviderRequestRecord;
  }) {
    super(input.message);
    this.name = 'IntegrationToolProviderCallError';
    this.originalError = input.originalError;
    this.record = input.record;
  }
}

/**
 * unknown error から Provider request metadata を安全に取り出します。
 *
 * @param error Provider client が投げた任意の error です。
 * @returns metadata 付き Provider call error なら request record、それ以外は `undefined` です。
 * @throws この関数は型判定のみを行うため例外を投げません。
 * @example
 * ```ts
 * const record = getIntegrationToolProviderRequestRecord(error);
 * ```
 */
export function getIntegrationToolProviderRequestRecord(
  error: unknown
): IntegrationToolProviderRequestRecord | undefined {
  return error instanceof IntegrationToolProviderCallError ? error.record : undefined;
}

/**
 * Provider operation の domain-safe view です。
 *
 * @remarks
 * generated ProviderOperation message を Tool runtime 層へ直接渡さず、Agent が永続化・状態遷移に使う
 * operation identity と status だけを保持します。
 */
export interface IntegrationToolProviderOperationResult {
  readonly operationId: string;
  readonly providerOperationRef?: string;
  readonly status: string;
}

/**
 * Provider 呼び出しで共通して必要な Agent-owned metadata です。
 */
export interface IntegrationToolProviderCallBase {
  readonly agentId: string;
  readonly idempotencyKey: string;
  readonly installationId: string;
  readonly nonce: string;
  readonly providerTargetRef: string;
  readonly timestampUnixMs: number;
  readonly toolId: string;
}

/**
 * InvokeTool Provider RPC の domain-safe 入力です。
 */
export interface InvokeIntegrationToolInput extends IntegrationToolProviderCallBase {
  readonly inputRef?: string;
  readonly invocationId: string;
  readonly runId: string;
  readonly threadId: string;
}

/**
 * GetOperation Provider RPC の domain-safe 入力です。
 */
export interface GetIntegrationToolOperationInput extends IntegrationToolProviderCallBase {
  readonly invocationId: string;
  readonly operationId: string;
}

/**
 * CancelOperation Provider RPC の domain-safe 入力です。
 */
export interface CancelIntegrationToolOperationInput extends IntegrationToolProviderCallBase {
  readonly invocationId: string;
  readonly operationId: string;
  readonly reason?: string;
}

/**
 * InvokeTool の domain-safe 応答です。
 */
export interface InvokeIntegrationToolResponse {
  readonly invocationStatus: string;
  readonly operation?: IntegrationToolProviderOperationResult;
  readonly outputRef?: string;
}

/**
 * GetOperation の domain-safe 応答です。
 */
export interface GetIntegrationToolOperationResponse {
  readonly operation?: IntegrationToolProviderOperationResult;
  readonly outputRef?: string;
}

/**
 * CancelOperation の domain-safe 応答です。
 */
export interface CancelIntegrationToolOperationResponse {
  readonly cancellationStatus: string;
  readonly operation?: IntegrationToolProviderOperationResult;
}

/**
 * InvokeTool の結果と送信 metadata です。
 */
export interface InvokeIntegrationToolResult {
  readonly record: IntegrationToolProviderRequestRecord;
  readonly response: InvokeIntegrationToolResponse;
}

/**
 * GetOperation の結果と送信 metadata です。
 */
export interface GetIntegrationToolOperationResult {
  readonly record: IntegrationToolProviderRequestRecord;
  readonly response: GetIntegrationToolOperationResponse;
}

/**
 * CancelOperation の結果と送信 metadata です。
 */
export interface CancelIntegrationToolOperationResult {
  readonly record: IntegrationToolProviderRequestRecord;
  readonly response: CancelIntegrationToolOperationResponse;
}

/**
 * Tool runtime 層から注入される Provider client seam です。
 *
 * @remarks
 * 実装は RPC layer に置き、ここでは generated RPC descriptor や network runtime を参照しません。
 */
export interface IntegrationToolProviderClient {
  cancelOperation(
    input: CancelIntegrationToolOperationInput
  ): Promise<CancelIntegrationToolOperationResult>;
  getOperation(input: GetIntegrationToolOperationInput): Promise<GetIntegrationToolOperationResult>;
  invokeTool(input: InvokeIntegrationToolInput): Promise<InvokeIntegrationToolResult>;
}
