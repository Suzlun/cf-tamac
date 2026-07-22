import 'server-only';

/**
 * Client Worker の Agent RPC destination として承認済みの canonical HTTPS origin です。
 *
 * @remarks
 * この branded type は、未検証の Browser 入力や Client D1 から読み取った文字列を SDK transport へ
 * 渡さないための server-only 境界です。値は常に `URL.origin` が返す canonical string であり、
 * allowlist との完全一致検証を通過した場合だけ生成されます。
 *
 * @example
 * ```ts
 * const approved = approveAgentRpcOrigin('https://agent.example.com', allowedOrigins);
 * ```
 */
export type ApprovedAgentRpcOrigin = string & {
  readonly __approvedAgentRpcOrigin: unique symbol;
};

/**
 * Agent RPC origin policy の設定または照合違反を表す server-only error です。
 *
 * @remarks
 * `message` は Browser payload へ直列化しません。Server Action はこの型を検出して、固定された
 * `configuration` category と action 固有の安全な表示データへ投影します。
 */
export class AgentRpcOriginPolicyError extends Error {
  /** policy 違反を Server Action の安全な error category へ対応付ける固定値です。 */
  readonly category = 'configuration' as const;

  /**
   * policy error を作成します。
   *
   * @param message - server-side observability だけで使う診断理由です。
   */
  constructor(message: string) {
    super(message);
    this.name = 'AgentRpcOriginPolicyError';
  }
}

/**
 * `AGENT_RPC_ALLOWED_ORIGINS` の JSON 値を、canonical HTTPS origin の完全一致 Set へ変換します。
 *
 * @param rawOrigins - Client Worker env から得た JSON string array です。
 * @returns unique で canonical な承認済み HTTPS origins の読み取り専用 Set です。
 * @throws JSON が配列でない、空配列、非文字列、重複、非 canonical HTTPS URL の場合に
 * `AgentRpcOriginPolicyError` を送出します。
 * @remarks
 * allowlist literal は canonical string でなければなりません。hostname lowercase、IDN の punycode、
 * default `:443` の除去は `URL.origin` に委譲し、literal と `URL.origin` の完全一致で設定誤りを fail closed にします。
 */
export function parseApprovedAgentRpcOrigins(
  rawOrigins: string
): ReadonlySet<ApprovedAgentRpcOrigin> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawOrigins);
  } catch {
    throw new AgentRpcOriginPolicyError('AGENT_RPC_ALLOWED_ORIGINS must be valid JSON.');
  }

  if (!Array.isArray(parsed) || parsed.length === 0) {
    throw new AgentRpcOriginPolicyError(
      'AGENT_RPC_ALLOWED_ORIGINS must be a non-empty JSON array.'
    );
  }

  const approvedOrigins = new Set<ApprovedAgentRpcOrigin>();
  for (const literal of parsed) {
    if (typeof literal !== 'string') {
      throw new AgentRpcOriginPolicyError('AGENT_RPC_ALLOWED_ORIGINS entries must be strings.');
    }
    const canonical = parseCanonicalHttpsOrigin(literal, 'AGENT_RPC_ALLOWED_ORIGINS entry');
    if (canonical !== literal) {
      throw new AgentRpcOriginPolicyError(
        'AGENT_RPC_ALLOWED_ORIGINS entries must use canonical HTTPS origin strings.'
      );
    }
    const approved = canonical as ApprovedAgentRpcOrigin;
    if (approvedOrigins.has(approved)) {
      throw new AgentRpcOriginPolicyError('AGENT_RPC_ALLOWED_ORIGINS entries must be unique.');
    }
    approvedOrigins.add(approved);
  }
  return approvedOrigins;
}

/**
 * Browser registration input または Client D1 record の origin を canonical HTTPS origin へ変換し、
 * 現在の server-managed allowlist との完全一致を検証します。
 *
 * @param value - Browser registration input または Client D1 に保存された未検証の origin 文字列です。
 * @param allowedOrigins - 現在の `AGENT_RPC_ALLOWED_ORIGINS` から構築した canonical allowlist です。
 * @returns SDK transport に渡してよい `ApprovedAgentRpcOrigin` です。
 * @throws HTTPS component constraints に違反する、または canonical origin が allowlist にない場合に
 * `AgentRpcOriginPolicyError` を送出します。
 * @remarks
 * 入力は canonical である必要はありません。`https://AGENT.example.com:443` のような Browser 入力は
 * `URL.origin` へ正規化して照合し、Client D1 には返却した canonical string だけを保存します。
 */
export function approveAgentRpcOrigin(
  value: string,
  allowedOrigins: ReadonlySet<ApprovedAgentRpcOrigin>
): ApprovedAgentRpcOrigin {
  const canonical = parseCanonicalHttpsOrigin(value, 'Agent RPC origin') as ApprovedAgentRpcOrigin;
  if (!allowedOrigins.has(canonical)) {
    throw new AgentRpcOriginPolicyError('Agent RPC origin is not approved by the current policy.');
  }
  return canonical;
}

/**
 * 未検証の文字列を URL component constraints を満たす canonical HTTPS origin へ変換します。
 *
 * @param value - 解析対象の Browser input または server configuration literal です。
 * @param label - server-side error 文脈にだけ使う入力種別ラベルです。
 * @returns `URL.origin` が返す canonical HTTPS origin string です。
 * @throws URL 解析、protocol、user info、path、query、fragment のいずれかが contract に違反した場合に
 * `AgentRpcOriginPolicyError` を送出します。
 */
function parseCanonicalHttpsOrigin(value: string, label: string): string {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new AgentRpcOriginPolicyError(`${label} must be a valid HTTPS URL.`);
  }

  if (
    url.protocol !== 'https:' ||
    url.username !== '' ||
    url.password !== '' ||
    url.pathname !== '/' ||
    url.search !== '' ||
    url.hash !== ''
  ) {
    throw new AgentRpcOriginPolicyError(
      `${label} must contain only scheme, host, and optional port.`
    );
  }
  return url.origin;
}
