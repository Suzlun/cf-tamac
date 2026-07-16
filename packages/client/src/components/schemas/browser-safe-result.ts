/**
 * Browser が SDK-backed Agent operation の失敗を表示へ対応付ける安定 category です。
 *
 * @remarks
 * Browser-visible module は SDK、Connect、origin policy、credential、raw diagnostic を import しません。
 * この literal union だけを使い、Server Action が返す固定安全文言と次の操作を選びます。
 * 成功時は category を持たず、失敗時だけこの closed vocabulary の値を持ちます。未知の transport detail を新しい文字列へ
 * 展開してはならず、Server Action が安全な category へ正規化します。
 *
 * @example
 * ```ts
 * const category: BrowserSafeAgentRpcErrorCategory = 'permission_denied';
 * // UI は固定の権限案内だけを表示し、raw SDK error を読まない。
 * ```
 */
export type BrowserSafeAgentRpcErrorCategory =
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
  | 'unknown'
  | 'configuration';

/**
 * Browser に返す SDK-backed Agent operation の四属性 result contract です。
 *
 * @typeParam TDisplayData - action が許可した表示データだけを持つ DTO です。
 * @remarks
 * success/error を問わず top-level key は `displayData`、`safeStatus`、`safeErrorCategory`、
 * `correlationId` に閉じます。Browser code は `displayData` の許可済み field 以外へ server-side detail を
 * 要求せず、問い合わせは `correlationId` だけで行います。credential、private/encrypted JWK、JWT、origin policy detail、
 * generated response、raw diagnostic は四属性のどこにも含めません。
 *
 * @example
 * ```ts
 * const succeeded: BrowserSafeAgentRpcResult<{ readonly title: string; readonly message: string }> = {
 *   displayData: { title: '保存しました', message: '安全な結果です。' },
 *   safeStatus: 'succeeded',
 *   safeErrorCategory: null,
 *   correlationId: 'correlation-001',
 * };
 * const failed: BrowserSafeAgentRpcResult<{ readonly title: string; readonly message: string }> = {
 *   displayData: { title: '権限を確認してください', message: '管理権限が必要です。' },
 *   safeStatus: 'failed',
 *   safeErrorCategory: 'permission_denied',
 *   correlationId: 'correlation-002',
 * };
 * ```
 */
export type BrowserSafeAgentRpcResult<TDisplayData> =
  | {
      readonly displayData: TDisplayData;
      readonly safeStatus: 'succeeded';
      readonly safeErrorCategory: null;
      readonly correlationId: string;
    }
  | {
      readonly displayData: TDisplayData;
      readonly safeStatus: 'failed';
      readonly safeErrorCategory: BrowserSafeAgentRpcErrorCategory;
      readonly correlationId: string;
    };

/**
 * 共通の操作結果領域が表示する固定安全文言です。
 *
 * @remarks
 * action 固有 DTO はこの型を拡張して、許可された metadata や field association を追加します。
 * `title` は結果見出し、`message` は次の操作を説明する固定安全本文です。raw SDK error、origin allowlist detail、
 * credential、JWT はここへ含めません。失敗時も同じ二属性を持つため、ResultRegion は success/failure を同じ DOM 構造で扱えます。
 *
 * @example
 * ```ts
 * const display: BrowserSafeOperationDisplayData = {
 *   title: '接続設定を確認してください',
 *   message: '許可済みの設定を確認してから再実行してください。',
 * };
 * ```
 */
export interface BrowserSafeOperationDisplayData {
  /** 非同期操作の結果を簡潔に表す安全な見出しです。 */
  readonly title: string;
  /** 利用者が次に取るべき行動を示す固定安全本文です。 */
  readonly message: string;
}
