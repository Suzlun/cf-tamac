import type { Code } from '@connectrpc/connect';

/**
 * Domain handling 前に Agent RPC guard seam が返す拒否情報です。
 *
 * @remarks
 * `reason` は audit/metric 用の安全な分類だけを保持し、生 token、署名、key material を含めません。
 */
export interface AgentRpcGuardRejection {
  readonly code: Code;
  readonly message: string;
  readonly reason?: string;
}

/**
 * Agent RPC guard が許可した場合は `undefined`、拒否した場合は安全な rejection を返す型です。
 */
export type AgentRpcGuardResult = AgentRpcGuardRejection | undefined;
