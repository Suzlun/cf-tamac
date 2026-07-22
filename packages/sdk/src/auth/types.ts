/**
 * TAMAC Agent Client Service JWT で許可する具体的な control-plane scope です。
 *
 * @remarks
 * SDK consumer は必要な操作だけを指定し、ワイルドカードや browser 入力由来の scope を渡しては
 * なりません。Agent Service 側の method scope matrix と trust policy が最終的に照合します。
 *
 * @example
 * ```ts
 * const scopes: readonly TamacAgentRpcScope[] = ['agent:read', 'agent:write'];
 * ```
 */
export type TamacAgentRpcScope =
  | 'agent:read'
  | 'agent:write'
  | 'agent:tool:approve'
  | 'agent:integration:admin'
  | 'agent:admin';

/**
 * 秘密鍵を含まない、解決済み Agent RPC credential の公開 view です。
 *
 * @remarks
 * Consumer-owned server-side storage は秘密鍵をこの view と分離して保持します。この値は JWT の
 * public identity claim を組み立てるためだけに使い、秘密値、暗号化済み JWK、生 JWT は含めません。
 *
 * @example
 * ```ts
 * const credential: ResolvedAgentRpcCredential = {
 *   agentId: 'agent-alpha',
 *   issuer: 'cf-tamac-client',
 *   keyId: 'key-2026-07',
 *   publicFingerprint: 'sha256:public-key-fingerprint',
 * };
 * ```
 */
export interface ResolvedAgentRpcCredential {
  /** この credential がアクセスできる単一の Agent aggregate ID です。 */
  readonly agentId: string;
  /** Agent trust config と一致する Client Service issuer です。 */
  readonly issuer: string;
  /** 署名鍵を識別する JWT `kid` および subject に使う key ID です。 */
  readonly keyId: string;
  /** Agent trust config と照合する公開鍵 fingerprint です。 */
  readonly publicFingerprint: string;
}

/**
 * server-side execution boundary が解決した Client Service 署名 context です。
 *
 * @remarks
 * `privateKey` は consumer の安全な storage から復号済みの Web Crypto key であり、JWT 署名中だけ
 * 使用します。SDK は storage、Next.js、D1、環境変数を解決せず、この値を browser payload や log に
 * 直列化しません。
 *
 * @example
 * ```ts
 * const signingContext: ClientServiceSigningContext = {
 *   credential,
 *   audience: 'https://agent.example.com',
 *   privateKey,
 * };
 * ```
 */
export interface ClientServiceSigningContext {
  /** 秘密鍵を含まない Client Service credential identity です。 */
  readonly credential: ResolvedAgentRpcCredential;
  /** Agent Worker が期待する JWT audience です。 */
  readonly audience: string;
  /** Ed25519 JWT の署名にだけ使う non-extractable Web Crypto private key です。 */
  readonly privateKey: CryptoKey;
  /**
   * JWT 署名後に consumer-owned storage の利用監査を更新する server-only callback です。
   *
   * @remarks
   * callback が失敗した場合は SDK が fail closed し、署名済み token を送信しません。
   */
  readonly onJwtSigned?: () => Promise<void>;
}

/**
 * Client Service が Agent audit record へ関連付ける acting user view です。
 *
 * @remarks
 * 値は browser request parameter ではなく、consumer の server-side authentication boundary が検証して
 * 導出します。`displayName` は JWT へ含めず、必要な場合でも consumer 内の表示用途に限定します。
 *
 * @example
 * ```ts
 * const actingUser: ActingUserContext = { actingUserId: 'operator-001' };
 * ```
 */
export interface ActingUserContext {
  /** Agent audit と JWT claim に入れる検証済みの利用者 ID です。 */
  readonly actingUserId: string;
  /** consumer が安全に保持する任意の表示名です。 */
  readonly displayName?: string;
}
