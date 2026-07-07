/**
 * Agent aggregate を Durable Object 境界で識別する最小 identity です。
 *
 * @remarks
 * lifecycle / health / storage initializer が共有する Agent ID だけを含めます。Client 側 ledger や
 * 外部 credential 情報を混ぜず、`1 Agent ID = 1 AIAgent Durable Object instance` の境界を保ちます。
 */
export interface AgentIdentity {
  readonly agentId: string;
}

/**
 * Agent foundation が永続化して扱う lifecycle status 一覧です。
 *
 * @remarks
 * 初期化、利用可能、破棄中、破棄済みの状態だけを表し、後方互換用の旧 demo 状態や
 * Client 管理 ledger の状態は含めません。
 */
export const agentLifecycleStatuses = [
  'initializing',
  'active',
  'destroying',
  'destroyed',
] as const;

/**
 * Agent lifecycle status の union 型です。
 *
 * @remarks
 * `agentLifecycleStatuses` から導出し、storage row と domain view の status 値を同じ集合へ固定します。
 */
export type AgentLifecycleStatus = (typeof agentLifecycleStatuses)[number];
