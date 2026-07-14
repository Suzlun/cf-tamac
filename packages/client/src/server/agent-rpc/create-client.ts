import 'server-only';

import {
  createTamacAgentClient,
  type ClientServiceSigningContext,
  type TamacAgentClient,
  type TamacSdkInvocationContext,
} from '@cf-tamac/sdk';

import type { ActingUserContext } from './acting-user';
import type { ApprovedAgentRpcOrigin } from './origin-policy';

/**
 * Client-owned context から SDK-backed server-only Agent RPC client を作る設定です。
 *
 * @remarks
 * Agent RPC origin、Client D1 signing store が復号した signing context、acting user は server-only module
 * 内でだけ扱います。SDK には解決済み context だけを渡し、Browser-visible module へ渡してはなりません。
 */
export interface ServerAgentRpcClientConfig {
  /** current server-managed allowlist で再検証済みの canonical HTTPS transport destination です。 */
  readonly agentRpcOrigin: ApprovedAgentRpcOrigin;
  readonly signingContext: ClientServiceSigningContext;
  readonly actingUser: ActingUserContext;
  readonly fetch?: typeof globalThis.fetch;
}

/**
 * SDK が集約した generated Agent RPC clients を Client Server Actions 向けに公開する bundle です。
 *
 * @remarks
 * Connect unary binary Protobuf transport、JWT metadata、generated descriptor、raw Connect error の正規化は
 * `@cf-tamac/sdk` が所有します。Client は D1/signing/acting-user ownership を保ったまま、既存 Server Action の
 * 呼び出し形を維持する `withErrorNormalization` seam だけを追加します。
 */
export interface ServerAgentRpcClients extends TamacAgentClient {
  /** SDK aggregate が共有する、server-side で作成済みの transport destination です。 */
  readonly agentRpcOrigin: ApprovedAgentRpcOrigin;
  /** Browser に返さない request/correlation/acting-user context です。 */
  readonly invocation: TamacSdkInvocationContext;
  /**
   * SDK が既に正規化した Agent RPC 呼び出しを Server Action の既存呼び出し形で実行します。
   *
   * @remarks SDK transport が service/method/request context を使い raw Connect error を
   * `TamacSdkOperationError` へ変換済みのため、この helper は二重変換せず result/error を透過します。
   * Server Action は捕捉した error を Client の safe result helper で Browser payload へ変換します。
   */
  readonly withErrorNormalization: <T>(operation: () => Promise<T>) => Promise<T>;
}

/**
 * Client-owned resolved context を SDK client aggregate へ渡し、server-only Agent RPC clients を作成します。
 *
 * @param config - Agent RPC origin、Client D1 signing context、acting user、任意 fetch 実装を含む factory 設定。
 * @returns SDK が作った service clients と既存 Server Action 用の error seam。
 * @remarks
 * Client は SDK の transport、Connect runtime、generated Agent RPC descriptor を直接 import しません。
 * この関数は Client の D1/signing/acting-user resolution 完了後にだけ呼び、browser bundle から import してはなりません。
 */
export function createServerAgentRpcClients(
  config: ServerAgentRpcClientConfig
): ServerAgentRpcClients {
  // Client が解決した operator/scope と新しい request correlation を SDK invocation へ限定して渡します。
  const invocation = {
    actingUser: { actingUserId: config.actingUser.operatorId },
    agentId: config.signingContext.credential.agentId,
    correlationId: globalThis.crypto.randomUUID(),
    requestId: globalThis.crypto.randomUUID(),
    scopes: config.actingUser.scopes,
  } as const;
  // SDK が binary Connect transport、JWT metadata、generated service aggregate、error normalization を構築します。
  const sdkClients = createTamacAgentClient({
    agentRpcOrigin: config.agentRpcOrigin,
    fetch: config.fetch,
    invocation,
    signingContext: config.signingContext,
  });
  // 既存 Server Actions の operation wrapper を残しつつ、SDK normalized error を二重に変換せず透過します。
  return {
    ...sdkClients,
    agentRpcOrigin: config.agentRpcOrigin,
    invocation,
    withErrorNormalization: async <T>(operation: () => Promise<T>): Promise<T> => await operation(),
  };
}
