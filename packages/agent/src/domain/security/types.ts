/**
 * Principal types accepted by the Agent security foundation.
 */
export const agentPrincipalTypes = [
  'CLIENT_SERVICE',
  'INTEGRATION_INSTALLATION',
  'INTERNAL_SERVICE',
  'ADMIN_OPERATOR',
] as const;

/**
 * Principal type value accepted by Agent security checks.
 */
export type AgentPrincipalType = (typeof agentPrincipalTypes)[number];

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
 * Authenticated principal context forwarded to Agent domain modules.
 */
export interface AgentPrincipalContext {
  readonly agentId: string;
  readonly principalId: string;
  readonly principalType: AgentPrincipalType;
  readonly scopes: readonly string[];
  readonly actingUserId?: string;
  readonly audience?: string;
  readonly issuer?: string;
  readonly jwtId?: string;
  readonly keyId?: string;
  readonly subject?: string;
  readonly grants?: readonly string[];
  readonly grantDetails?: readonly AgentPrincipalGrantContext[];
  readonly installationId?: string;
  readonly connectionId?: string;
}

/**
 * SHA-256 digest and byte size for immutable protobuf request bytes.
 */
export interface AgentRawBodyDigest {
  readonly algorithm: 'sha-256';
  readonly digestHex: string;
  readonly byteLength: number;
}

/**
 * Stable RPC operation identity used by security and authorization seams.
 */
export interface AgentRpcOperationIdentity {
  readonly service: string;
  readonly method: string;
}
