import { Code, ConnectError } from '@connectrpc/connect';

import type { TamacAgentRpcMethodContext } from './invocation-context';

/**
 * Connect failure を consumer が安全に扱うための stable SDK error category です。
 *
 * @remarks
 * Category は retry、権限確認、入力修正、UI status の分岐に使えます。Agent Service の raw error message、
 * stack trace、token、private key はこの分類にも normalized error detail にも含めません。
 *
 * @example
 * ```ts
 * if (error.category === 'permission_denied') {
 *   // consumer の server-side policy を確認する。
 * }
 * ```
 */
export type TamacSdkErrorCategory =
  | 'invalid_argument'
  | 'unauthenticated'
  | 'permission_denied'
  | 'not_found'
  | 'already_exists'
  | 'failed_precondition'
  | 'aborted'
  | 'resource_exhausted'
  | 'cancelled'
  | 'deadline_exceeded'
  | 'unavailable'
  | 'internal'
  | 'unknown';

/**
 * SDK normalized error へ関連付ける secret-free RPC operation identity です。
 *
 * @remarks
 * この context は service/method、Agent、request/idempotency/correlation を保持します。Client Service JWT と
 * Provider detached signature のどちらの aggregate も、同じ安全な operation identity へ正規化できます。consumer
 * は error category と correlation ID を安全な UI status や server-side log に使えますが、raw Connect error を
 * browser payload へ直列化してはなりません。
 *
 * @example
 * ```ts
 * const operation: TamacSdkOperationContext = {
 *   agentId: 'agent-alpha',
 *   requestId: 'request-001',
 *   correlationId: 'correlation-001',
 *   methodContext,
 * };
 * ```
 */
export interface TamacSdkOperationContext {
  /** 失敗した generated Protobuf service/method identity です。 */
  readonly methodContext: TamacAgentRpcMethodContext;
  /** request body、JWT、または detached signature が scope した Agent aggregate ID です。 */
  readonly agentId: string;
  /** server-side observability と Agent audit を結ぶ secret-free request ID です。 */
  readonly requestId: string;
  /** consumer/provider の安全な operation log を横断する secret-free correlation ID です。 */
  readonly correlationId: string;
  /** command replay と Agent audit に関連付ける optional idempotency key です。 */
  readonly idempotencyKey?: string;
}

/**
 * Agent RPC failure を stable category と safe observability metadata に正規化した error です。
 *
 * @remarks
 * `safeDetail` と Error message は固定の安全な説明だけを含みます。raw transport message、response body、
 * JWT、credential material は保持・表示しません。`connectCode` は retry policy を決めるための元の Connect
 * code、他の field は request correlation 用です。
 *
 * @example
 * ```ts
 * try {
 *   await client.health.check({ agentId: 'agent-alpha' });
 * } catch (error) {
 *   if (error instanceof TamacSdkOperationError) console.error(error.correlationId);
 * }
 * ```
 */
export class TamacSdkOperationError extends Error {
  /** stable SDK error category です。 */
  readonly category: TamacSdkErrorCategory;
  /** 元の Connect code、または non-Connect failure を表す `internal` code です。 */
  readonly connectCode: Code;
  /** request body/JWT が scope した Agent ID です。 */
  readonly agentId: string;
  /** Agent audit metadata に渡した request ID です。 */
  readonly requestId: string;
  /** consumer-side status/log を横断する correlation ID です。 */
  readonly correlationId: string;
  /** command replay metadata の idempotency key。query failure では未設定です。 */
  readonly idempotencyKey?: string;
  /** fully-qualified Protobuf service name です。 */
  readonly serviceName: string;
  /** generated Protobuf method name です。 */
  readonly methodName: string;
  /** raw error を含まない consumer/browser-safe detail です。 */
  readonly safeDetail: string;

  /**
   * normalized SDK operation error を構築します。
   *
   * @param input - category、Connect code、safe detail、secret-free RPC operation context です。
   * @returns `TamacSdkOperationError` instance を初期化します。
   * @remarks
   * constructor は raw error cause を public property に保持しません。server-side caller が必要な transport
   * diagnostics を扱う場合も、SDK normalized error を browser serializable data と混同してはなりません。
   */
  constructor(input: TamacSdkOperationErrorInput) {
    // Error.message へ safe detail だけを渡し、raw Connect message の露出を防ぎます。
    super(input.safeDetail);
    // runtime type discrimination と safe error reporting を一定にします。
    this.name = 'TamacSdkOperationError';
    this.agentId = input.operation.agentId;
    this.category = input.category;
    this.connectCode = input.connectCode;
    this.correlationId = input.operation.correlationId;
    this.idempotencyKey = input.operation.idempotencyKey;
    this.methodName = input.operation.methodContext.methodName;
    this.requestId = input.operation.requestId;
    this.safeDetail = input.safeDetail;
    this.serviceName = input.operation.methodContext.serviceName;
  }
}

/**
 * thrown Connect/unknown failure を SDK normalized error に変換します。
 *
 * @param error - generated Connect client または transport interceptor から投げられた値です。
 * @param operation - Agent、service/method、request/idempotency/correlation を持つ secret-free context です。
 * @returns stable category、Connect code、safe detail、operation identity を持つ normalized error。
 * @remarks
 * 既に normalized な error はそのまま返します。raw `ConnectError.rawMessage` は利用せず、未知の failure は
 * `internal` category に fail closed します。
 *
 * @example
 * ```ts
 * const normalized = normalizeTamacSdkError(error, { invocation, methodContext });
 * ```
 */
export function normalizeTamacSdkError(
  error: unknown,
  operation: TamacSdkOperationContext
): TamacSdkOperationError {
  // transport interceptor が二重に通っても context を失わないよう、既存 normalized error を保持します。
  if (error instanceof TamacSdkOperationError) {
    return error;
  }
  // Connect client が interceptor failure を ConnectError cause で包んだ場合は、既存 normalized context を復元します。
  if (error instanceof ConnectError && error.cause instanceof TamacSdkOperationError) {
    return error.cause;
  }
  // Connect failure だけが wire-level code を持つため、未知の throw は internal code へ閉じます。
  const connectCode = error instanceof ConnectError ? error.code : Code.Internal;
  // code mapping と fixed safe detail を組み合わせ、raw error text を consumer output へ伝えません。
  const category = parseErrorCategory(connectCode);
  return new TamacSdkOperationError({
    category,
    connectCode,
    operation,
    safeDetail: resolveSafeDetail(category),
  });
}

interface TamacSdkOperationErrorInput {
  readonly category: TamacSdkErrorCategory;
  readonly connectCode: Code;
  readonly operation: TamacSdkOperationContext;
  readonly safeDetail: string;
}

const connectCodeCategories = new Map<Code, TamacSdkErrorCategory>([
  [Code.InvalidArgument, 'invalid_argument'],
  [Code.Unauthenticated, 'unauthenticated'],
  [Code.PermissionDenied, 'permission_denied'],
  [Code.NotFound, 'not_found'],
  [Code.AlreadyExists, 'already_exists'],
  [Code.FailedPrecondition, 'failed_precondition'],
  [Code.Aborted, 'aborted'],
  [Code.ResourceExhausted, 'resource_exhausted'],
  [Code.Canceled, 'cancelled'],
  [Code.DeadlineExceeded, 'deadline_exceeded'],
  [Code.Unavailable, 'unavailable'],
  [Code.Internal, 'internal'],
  [Code.Unknown, 'unknown'],
  [Code.DataLoss, 'internal'],
  [Code.OutOfRange, 'invalid_argument'],
  [Code.Unimplemented, 'unavailable'],
]);

const safeDetails = new Map<TamacSdkErrorCategory, string>([
  ['invalid_argument', 'The Agent RPC request is invalid.'],
  ['unauthenticated', 'Agent RPC authentication is required.'],
  ['permission_denied', 'The Client Service is not permitted to perform this Agent RPC operation.'],
  ['not_found', 'The requested Agent resource was not found.'],
  ['already_exists', 'The requested Agent resource already exists.'],
  ['failed_precondition', 'The Agent is not in a state that permits this operation.'],
  ['aborted', 'The Agent RPC operation was aborted because its state changed concurrently.'],
  ['resource_exhausted', 'The Agent RPC operation exceeded an available quota or rate limit.'],
  ['cancelled', 'The Agent RPC operation was cancelled.'],
  ['deadline_exceeded', 'The Agent RPC operation exceeded its deadline.'],
  ['unavailable', 'The Agent Service is temporarily unavailable.'],
  ['internal', 'The Agent Service could not complete the operation safely.'],
  ['unknown', 'The Agent Service returned an unknown failure.'],
]);

/**
 * Connect code を SDK consumer 向けの closed error category へ変換します。
 *
 * @param connectCode - Connect transport または generated RPC client が返した protocol-level failure code です。
 * @returns retry、入力修正、権限確認を安全に分岐できる `TamacSdkErrorCategory`。未対応の code は `unknown` です。
 * @throws この function 自身は例外を投げず、未知の code も `unknown` へ fail closed に正規化します。
 * @remarks
 * Provider ingress の HTTP 429 が Connect の `Code.ResourceExhausted` に対応した場合も、ここで
 * `resource_exhausted` に一意に変換されます。raw response body や message は読み取りません。
 *
 * @example
 * ```ts
 * const category = parseErrorCategory(Code.ResourceExhausted);
 * // category === 'resource_exhausted'
 * ```
 */
export function parseErrorCategory(connectCode: Code): TamacSdkErrorCategory {
  // Connect code が将来追加されても unknown へ閉じ、consumer retry policy を推測で広げません。
  return connectCodeCategories.get(connectCode) ?? 'unknown';
}

function resolveSafeDetail(category: TamacSdkErrorCategory): string {
  // static map からのみ detail を選び、server response が含む未知の機密値を反映しません。
  return safeDetails.get(category) ?? safeDetails.get('unknown') ?? 'The Agent Service failed.';
}
