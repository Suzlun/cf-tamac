/**
 * Browser が SDK-backed Agent operation の失敗を表示へ対応付ける安定 category です。
 *
 * @remarks
 * Browser-visible module は SDK、Connect、origin policy、credential、raw diagnostic を import しません。
 * この literal union だけを使い、Server Action が返す固定安全文言と次の操作を選びます。
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
 * 要求せず、問い合わせは `correlationId` だけで行います。
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
 * raw SDK error、origin allowlist detail、credential、JWT はここへ含めません。
 */
export interface BrowserSafeOperationDisplayData {
  /** 非同期操作の結果を簡潔に表す安全な見出しです。 */
  readonly title: string;
  /** 利用者が次に取るべき行動を示す固定安全本文です。 */
  readonly message: string;
}
