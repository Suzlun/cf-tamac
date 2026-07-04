/**
 * Agent security foundation が受け入れる principal 種別です。
 *
 * @remarks
 * Client Service、Integration Installation、内部 service、管理者操作を明示的に区別し、
 * ブラウザー session や曖昧な caller を Agent principal として扱わないための固定集合です。
 */
export const agentPrincipalTypes = [
  'CLIENT_SERVICE',
  'INTEGRATION_INSTALLATION',
  'INTERNAL_SERVICE',
  'ADMIN_OPERATOR',
] as const;

/**
 * Agent security check で使用できる principal 種別の値です。
 */
export type AgentPrincipalType = (typeof agentPrincipalTypes)[number];

/**
 * Agent control-plane trust config で Ed25519 JWT bearer として受け入れる principal 種別です。
 *
 * @remarks
 * `CLIENT_SERVICE` は通常の Management Client 呼び出し、`ADMIN_OPERATOR` は break-glass recovery の
 * 管理者操作に限定して使います。Integration Installation と Internal Service は別の認証境界で扱うため、
 * AGENT_CONTROL_PLANE_TRUST の bearer JWT policy には含めません。
 */
export type AgentControlPlanePrincipalType = Extract<
  AgentPrincipalType,
  'CLIENT_SERVICE' | 'ADMIN_OPERATOR'
>;

/**
 * Client Service JWT と trust config が扱う method scope 名です。
 *
 * @remarks
 * RPC method matrix はこの scope を使って read/write/tool/integration/admin を分離します。
 * `*` は trust config の広い許可を表すためだけに扱い、method requirement そのものには使いません。
 */
export type AgentControlPlaneScope =
  | 'agent:read'
  | 'agent:write'
  | 'agent:tool:approve'
  | 'agent:integration:admin'
  | 'agent:admin'
  | '*';

/**
 * Agent trust config 上の Client Service public key lifecycle 状態です。
 */
export type AgentTrustKeyStatus = 'active' | 'retiring' | 'revoked';

/**
 * Trust config の key ごとに適用される principal policy です。
 *
 * @remarks
 * `allowedAgentIds` は Agent aggregate 境界を、`allowedScopes` は RPC method matrix 境界を表します。
 * どちらも `*` を持てますが、運用上は最小権限に寄せることを前提にします。
 */
export interface AgentPrincipalPolicy {
  readonly allowedAgentIds: readonly string[];
  readonly allowedScopes: readonly AgentControlPlaneScope[];
  readonly principalType: AgentControlPlanePrincipalType;
}

/**
 * Trust config で検証済みの Ed25519 public key policy です。
 */
export interface AgentTrustKeyPolicy extends AgentPrincipalPolicy {
  readonly crv: 'Ed25519';
  readonly fingerprint: string;
  readonly issuer: string;
  readonly kid: string;
  readonly kty: 'OKP';
  readonly publicJwk: JsonWebKey;
  readonly status: AgentTrustKeyStatus;
}

/**
 * Agent Worker が読み込んだ trust config の安全な診断 view です。
 */
export interface AgentTrustConfigDiagnostic {
  readonly fingerprint: string;
  readonly issuerCount: number;
  readonly keyCount: number;
  readonly loadedAtUnixMs: number;
  readonly status: 'serving' | 'degraded' | 'unavailable';
  readonly version: string;
}

/**
 * 認証済み principal が提示した issuer/kid/fingerprint の検証済み要約です。
 */
export interface AgentPrincipalTrustSummary {
  readonly fingerprint: string;
  readonly issuer: string;
  readonly keyStatus: AgentTrustKeyStatus;
  readonly kid: string;
  readonly principalType: AgentPrincipalType;
  readonly verified: boolean;
  readonly verifiedAtUnixMs: number;
}

/**
 * Agent-local grant の capability と scopeRef を principal context へ渡す安全な view です。
 *
 * @remarks
 * `grants` は既存の capability 文字列一覧として残しつつ、Tool / Integration のように
 * installation や tool 単位で絞り込む認可ではこの詳細 view を使います。
 */
export interface AgentPrincipalGrantContext {
  readonly capability: string;
  readonly scopeRef?: string;
}

/**
 * Agent domain module へ渡す認証済み principal context です。
 *
 * @remarks
 * Client Service JWT 由来の issuer/kid/fingerprint/jti/scope を保持し、AIAgent Durable Object 内の
 * final authorization、監査、replay/idempotency 境界で同じ主体情報を再利用できるようにします。
 */
export interface AgentPrincipalContext {
  readonly agentId: string;
  readonly principalId: string;
  readonly principalType: AgentPrincipalType;
  readonly scopes: readonly string[];
  readonly actingUserId?: string;
  readonly allowedAgentIds?: readonly string[];
  readonly allowedScopes?: readonly AgentControlPlaneScope[];
  readonly audience?: string;
  readonly expiresAtUnixMs?: number;
  readonly fingerprint?: string;
  readonly issuer?: string;
  readonly jwtId?: string;
  readonly keyId?: string;
  readonly keyStatus?: AgentTrustKeyStatus;
  readonly notBeforeUnixMs?: number;
  readonly subject?: string;
  readonly trustSummary?: AgentPrincipalTrustSummary;
  readonly grants?: readonly string[];
  readonly grantDetails?: readonly AgentPrincipalGrantContext[];
  readonly installationId?: string;
  readonly connectionId?: string;
}

/**
 * 不変 Protobuf request bytes の SHA-256 digest と byte size です。
 */
export interface AgentRawBodyDigest {
  readonly algorithm: 'sha-256';
  readonly digestHex: string;
  readonly byteLength: number;
}

/**
 * Security と authorization seam が共有する安定した RPC operation identity です。
 */
export interface AgentRpcOperationIdentity {
  readonly service: string;
  readonly method: string;
}
