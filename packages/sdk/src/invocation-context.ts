import type { ActingUserContext, TamacAgentRpcScope } from './auth/types';

/**
 * 1 回の SDK execution に結び付く request/correlation identifier です。
 *
 * @remarks
 * `requestId` は Agent audit の HTTP metadata、`correlationId` は consumer 側の UI status と運用調査の
 * 相関に使います。どちらも秘密値を含めず、server-side caller が request ごとに生成します。
 *
 * @example
 * ```ts
 * const correlation: RequestCorrelationContext = {
 *   requestId: 'request-001',
 *   correlationId: 'correlation-001',
 * };
 * ```
 */
export interface RequestCorrelationContext {
  /** Agent audit と RPC metadata を結ぶ request ID です。 */
  readonly requestId: string;
  /** consumer の安全な status/log 出力を横断して結ぶ correlation ID です。 */
  readonly correlationId: string;
}

/**
 * 冪等な command execution に関連付ける idempotency context です。
 *
 * @remarks
 * Query-only invocation では省略できます。Command の request body にも同じ key を入れる責任は generated
 * Protobuf contract を使う caller にあり、SDK は header metadata へ同じ key を関連付けます。
 *
 * @example
 * ```ts
 * const idempotency: IdempotencyContext = { idempotencyKey: 'command-001' };
 * ```
 */
export interface IdempotencyContext {
  /** 同一 principal と Agent の command replay を識別する non-empty key です。 */
  readonly idempotencyKey: string;
}

/**
 * Tamac Agent SDK の server-side 呼び出し文脈です。
 *
 * @remarks
 * Agent ID、最小権限 scope、acting user、request/correlation、任意の idempotency key を同じ aggregate の
 * 全 service client で共有します。SDK はこの object を browser-visible module から受け取るための API として
 * 使わず、consumer の server-side execution boundary だけで構築します。
 *
 * @example
 * ```ts
 * const invocation: TamacSdkInvocationContext = {
 *   agentId: 'agent-alpha',
 *   scopes: ['agent:read'],
 *   actingUser: { actingUserId: 'operator-001' },
 *   requestId: 'request-001',
 *   correlationId: 'correlation-001',
 * };
 * ```
 */
export interface TamacSdkInvocationContext extends RequestCorrelationContext {
  /** すべての generated RPC request body と JWT が scope する Agent ID です。 */
  readonly agentId: string;
  /** JWT に入れ、Agent Service の method scope matrix と照合する最小権限 scope です。 */
  readonly scopes: readonly TamacAgentRpcScope[];
  /** JWT の `acting_user_id` に入れる server-side で検証済みの利用者文脈です。 */
  readonly actingUser: ActingUserContext;
  /** command execution にだけ付与する任意の replay/idempotency 文脈です。 */
  readonly idempotency?: IdempotencyContext;
}

/**
 * Connect method path から得る generated Protobuf service/method identity です。
 *
 * @remarks
 * SDK はこの値を JWT extension claim と metadata に関連付けます。ただし Agent Service は caller supplied
 * header を認可判断に使わず、受信した Connect path と Protobuf request body を正として検証します。
 *
 * @example
 * ```ts
 * const method: TamacAgentRpcMethodContext = {
 *   serviceName: 'cftamac.agent.v1.AgentHealthService',
 *   methodName: 'Check',
 * };
 * ```
 */
export interface TamacAgentRpcMethodContext {
  /** fully-qualified Protobuf service name です。 */
  readonly serviceName: string;
  /** generated Protobuf RPC method name です。 */
  readonly methodName: string;
}
