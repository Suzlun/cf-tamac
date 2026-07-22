import 'server-only';

import { TamacSdkOperationError, type TamacSdkErrorCategory } from '@cf-tamac/sdk';

import { AgentRpcOriginPolicyError } from './origin-policy';

/**
 * Browser に返せる SDK-backed Agent RPC result の安全な status です。
 *
 * @remarks
 * Server Action は raw Connect/SDK error や credential context を返さず、成功・失敗をこの固定値で表します。
 * UI はこの値、safe error category、correlation identifier だけを状態表示や運用問い合わせの導線に使えます。
 */
export type BrowserSafeAgentRpcStatus = 'failed' | 'succeeded';

/**
 * Browser が SDK-backed operation の失敗を分岐できる閉じた安全な category です。
 *
 * @remarks
 * SDK transport の stable category に、Client server-side origin/signing configuration の失敗を表す
 * `configuration` だけを追加します。raw Connect code、SDK diagnostic、credential detail は含みません。
 */
export type BrowserSafeAgentRpcErrorCategory = TamacSdkErrorCategory | 'configuration';

/**
 * Browser-safe error category を固定の利用者向け見出しへ対応付けます。
 *
 * @param category - raw transport diagnostic を含まない Server Action failure category です。
 * @returns 権限、可用性、入力不備を区別する固定安全見出しです。
 * @remarks
 * Browser は SDK/Connect error message を表示せず、この mapping と action 固有の安全本文を組み合わせます。
 * `permission_denied`、`unavailable`、`invalid_argument` を同じ generic title に畳み込まないことを保証します。
 *
 * @example
 * ```ts
 * const title = browserSafeErrorTitle('permission_denied');
 * // '権限を確認してください'
 * ```
 */
export function browserSafeErrorTitle(category: BrowserSafeAgentRpcErrorCategory): string {
  if (category === 'permission_denied') return '権限を確認してください';
  if (category === 'unavailable') return '接続状態を確認してください';
  if (category === 'invalid_argument') return '入力内容を確認してください';
  if (category === 'configuration') return '接続設定を確認してください';
  return '操作結果を確認してください';
}

/**
 * SDK-backed Agent RPC 成功時に Browser へ返す安全な envelope です。
 *
 * @typeParam TDisplayData - Server Action が許可 field だけへ map 済みの表示データです。
 * @remarks
 * `displayData` は generated response、credential、JWT、RPC origin を直接入れず、各 Server Action が browser-safe
 * view model へ変換してから渡します。この envelope 自体は signing context を保持しません。
 */
export interface BrowserSafeAgentRpcSuccess<TDisplayData> {
  /** Browser 表示用に安全化済みのデータです。 */
  readonly displayData: TDisplayData;
  /** 成功した server-side Agent RPC execution を表す固定 status です。 */
  readonly safeStatus: 'succeeded';
  /** 成功時は error category を必ず `null` として明示します。 */
  readonly safeErrorCategory: null;
  /** server-side request/log と Browser status を結ぶ secret-free correlation identifier です。 */
  readonly correlationId: string;
}

/**
 * SDK-backed Agent RPC 失敗時に Browser へ返す安全な envelope です。
 *
 * @remarks
 * raw error message、stack trace、Connect response、JWT、private key、D1 record は保持しません。
 * Browser は `safeStatus`、`safeErrorCategory`、`correlationId` だけで表示と問い合わせを行います。
 */
export interface BrowserSafeAgentRpcFailure<TDisplayData> {
  /** action 固有の固定安全文言、field association、許可済み metadata だけを持つ表示データです。 */
  readonly displayData: TDisplayData;
  /** Browser が retry/permission guidance に使える stable SDK error category です。 */
  readonly safeErrorCategory: BrowserSafeAgentRpcErrorCategory;
  /** 失敗した server-side Agent RPC execution を表す固定 status です。 */
  readonly safeStatus: 'failed';
  /** server-side request/log と Browser status を結ぶ secret-free correlation identifier です。 */
  readonly correlationId: string;
}

/**
 * SDK-backed Server Action が Browser へ返す四属性で閉じた結果です。
 *
 * @typeParam TDisplayData - action 固有の allowlisted display DTO です。
 * @remarks
 * success と failure のどちらも最上位 key を `displayData`、`safeStatus`、`safeErrorCategory`、
 * `correlationId` に固定します。Browser-visible code はこの four-field envelope 以外へ SDK、transport、
 * credential、署名、raw error を要求してはなりません。
 */
export type BrowserSafeAgentRpcResult<TDisplayData> =
  | BrowserSafeAgentRpcSuccess<TDisplayData>
  | BrowserSafeAgentRpcFailure<TDisplayData>;

/**
 * SDK-backed action の成功データと固定安全文言を同居させる display DTO です。
 *
 * @typeParam TData - generated response から action 固有の allowlist view model へ変換済みの値です。
 * @remarks
 * failure では `data` を省略し、title/message/correlation/category だけで Browser の再試行、権限確認、
 * 設定確認を支援します。元の SDK result や raw diagnostic は保持しません。
 */
export interface BrowserSafeAgentRpcActionDisplay<TData> {
  /** 非同期 action の成否を説明する固定安全見出しです。 */
  readonly title: string;
  /** 利用者が次に取るべき行動を示す固定安全本文です。 */
  readonly message: string;
  /** 成功時だけ返す action 固有の allowlisted view model です。 */
  readonly data?: TData;
}

/** SDK-backed action が返す四属性 Browser-safe result の共通 alias です。 */
export type BrowserSafeAgentRpcActionResult<TData> = BrowserSafeAgentRpcResult<
  BrowserSafeAgentRpcActionDisplay<TData>
>;

/**
 * browser-safe display data と SDK invocation correlation から成功 envelope を作ります。
 *
 * @typeParam TDisplayData - Server Action が許可 field だけへ map 済みの表示データです。
 * @param displayData - generated response ではなく、browser-safe view model に変換済みの表示データです。
 * @param correlationId - SDK invocation が生成した、空でない secret-free correlation identifier です。
 * @returns Browser に返せる display data、safe status、correlation identifier だけを持つ envelope。
 * @throws `correlationId` が空の場合に `TypeError` を送出します。
 * @remarks
 * helper は display data の field mapping を推測しません。各 Server Action が Agent-domain response を安全な
 * view model へ変換する既存責務を保ち、envelope は SDK execution metadata の露出だけを統一します。
 */
export function createBrowserSafeAgentRpcSuccess<TDisplayData>(
  displayData: TDisplayData,
  correlationId: string
): BrowserSafeAgentRpcSuccess<TDisplayData> {
  // 空の問い合わせ ID を Browser へ返さないよう、SDK adapter 境界で fail closed にします。
  assertCorrelationId(correlationId);
  // 呼び出し側が map 済みの display data と固定成功 status だけを新しい object に閉じます。
  return { correlationId, displayData, safeErrorCategory: null, safeStatus: 'succeeded' };
}

/**
 * SDK normalized error または未知の server-side failure から Browser-safe failure envelope を作ります。
 *
 * @param error - SDK transport または Client server-only resolution で捕捉した値です。
 * @param fallbackCorrelationId - SDK error 以外の failure に使う secret-free correlation identifier です。
 * @returns raw error detail を含まない safe category、status、correlation identifier の envelope。
 * @throws `fallbackCorrelationId` が空の場合に `TypeError` を送出します。
 * @remarks
 * SDK error では SDK が保持する stable category/correlation を使い、未知の error では `unknown` へ丸めます。
 * いずれの場合も raw message や cause を Browser payload に書き込みません。
 */
export function createBrowserSafeAgentRpcFailure<TDisplayData>(
  error: unknown,
  fallbackCorrelationId: string,
  displayData: TDisplayData
): BrowserSafeAgentRpcFailure<TDisplayData> {
  // SDK outside の signing/D1 failure でも安全な問い合わせ ID を必須にします。
  assertCorrelationId(fallbackCorrelationId);
  // SDK error の stable category と invocation correlation は安全な observability field としてだけ利用します。
  if (error instanceof TamacSdkOperationError) {
    return {
      correlationId: error.correlationId,
      displayData,
      safeErrorCategory: error.category,
      safeStatus: 'failed',
    };
  }
  if (error instanceof AgentRpcOriginPolicyError) {
    return {
      correlationId: fallbackCorrelationId,
      displayData,
      safeErrorCategory: 'configuration',
      safeStatus: 'failed',
    };
  }
  // 未知の failure は raw detail を推測・露出せず、固定 category と caller supplied correlation に閉じます。
  return {
    correlationId: fallbackCorrelationId,
    displayData,
    safeErrorCategory: 'internal',
    safeStatus: 'failed',
  };
}

/**
 * Server Action が既知の安全な失敗 category を返すための四属性 envelope を作ります。
 *
 * @typeParam TDisplayData - action 固有の固定安全文言と許可済み metadata です。
 * @param displayData - Browser に返してよい action 固有の表示データです。
 * @param safeErrorCategory - raw diagnostic を含まない閉じた failure category です。
 * @param correlationId - server-side log と Browser support reference を結ぶ非機密 ID です。
 * @returns top-level key が四属性に閉じた Browser-safe failure result です。
 * @throws `correlationId` が空の場合に `TypeError` を送出します。
 * @remarks
 * Browser input validation や action が明示的に識別できる prerequisite failure は exception detail を
 * 解析せず、この helper の固定 category/copy 経路で返します。
 */
export function createBrowserSafeAgentRpcFailureForCategory<TDisplayData>(
  displayData: TDisplayData,
  safeErrorCategory: BrowserSafeAgentRpcErrorCategory,
  correlationId: string
): BrowserSafeAgentRpcFailure<TDisplayData> {
  assertCorrelationId(correlationId);
  return { correlationId, displayData, safeErrorCategory, safeStatus: 'failed' };
}

/**
 * allowlisted action view model を Browser-safe success result に包みます。
 *
 * @typeParam TData - action 固有の Browser-safe view model です。
 * @param data - generated response から抽出済みの表示用データです。
 * @param title - 固定安全見出しです。
 * @param message - 固定安全本文です。
 * @param correlationId - SDK invocation が生成した非機密 correlation ID です。
 * @returns top-level key が四属性に閉じた成功 result です。
 */
export function createBrowserSafeAgentRpcActionSuccess<TData>(
  data: TData,
  title: string,
  message: string,
  correlationId: string
): BrowserSafeAgentRpcActionResult<TData> {
  return createBrowserSafeAgentRpcSuccess({ data, message, title }, correlationId);
}

/**
 * thrown server-only failure を固定安全文言付きの action result へ変換します。
 *
 * @typeParam TData - 成功時にだけ返す action view model の型です。
 * @param error - SDK、origin policy、Client D1/signing context が送出した未直列化 error です。
 * @param correlationId - SDK error 以外の failure に使う非機密 correlation ID です。
 * @param title - action 固有の固定安全 failure 見出しです。
 * @param message - action 固有の固定安全 failure 本文です。
 * @returns raw diagnostic を含まない四属性 failure result です。
 */
export function createBrowserSafeAgentRpcActionFailure<TData>(
  error: unknown,
  correlationId: string,
  title: string,
  message: string
): BrowserSafeAgentRpcActionResult<TData> {
  return createBrowserSafeAgentRpcFailure(error, correlationId, { message, title });
}

/**
 * SDK-backed query の未検証 response を、明示的に許可した display DTO と四属性 envelope へ閉じます。
 *
 * @typeParam TResponse - server-only SDK invocation が返す未直列化 response の型です。
 * @typeParam TData - response mapper が構築する Browser 表示用の許可済み DTO です。
 * @param execute - Client D1、署名、acting-user 解決後に SDK query を実行し、response と correlation ID を返す処理です。
 * @param toDisplayData - raw SDK response から allowlisted field だけを抽出する server-only mapper です。
 * @param title - 成功時に Browser へ表示してよい固定安全見出しです。
 * @param message - 成功時に Browser へ表示してよい固定安全本文です。
 * @param failureTitle - 失敗時に Browser へ表示してよい固定安全見出しです。
 * @param failureMessage - 失敗時に Browser へ表示してよい固定安全本文です。
 * @returns 成否を問わず top-level key が四属性だけの Browser-safe query result を返します。
 * @remarks
 * `execute` と mapper は server-only 境界内でだけ動作します。例外、Connect diagnostic、origin policy detail、
 * credential、JWT、生成済み response は catch 節からも返さず、failure envelope の固定文言へ丸めます。
 */
export async function executeBrowserSafeAgentRpcQuery<TResponse, TData>(
  execute: () => Promise<{ readonly correlationId: string; readonly response: TResponse }>,
  toDisplayData: (response: TResponse) => Promise<TData> | TData,
  title: string,
  message: string,
  failureTitle: string,
  failureMessage: string
): Promise<BrowserSafeAgentRpcActionResult<TData>> {
  try {
    // SDK response はこの server-only callback 内だけで受け取り、mapper が許可した field 以外を破棄します。
    const { correlationId, response } = await execute();
    const data = await toDisplayData(response);
    return createBrowserSafeAgentRpcActionSuccess(data, title, message, correlationId);
  } catch (error) {
    // raw error を Browser に渡さず、問い合わせ可能な ID と固定文言だけを持つ failure に正規化します。
    return createBrowserSafeAgentRpcActionFailure(
      error,
      globalThis.crypto.randomUUID(),
      failureTitle,
      failureMessage
    );
  }
}

/**
 * Browser-safe result が追跡可能な correlation identifier を持つことを検査します。
 *
 * @param correlationId - SDK invocation または Server Action が生成した識別子です。
 * @throws 空白だけを含む値の場合に `TypeError` を送出します。
 * @remarks
 * correlation identifier は secret ではありませんが、空値を許すと Browser status と server-side log を安全に
 * 結び付けられなくなるため、envelope を作る直前に fail closed にします。
 */
function assertCorrelationId(correlationId: string): void {
  if (correlationId.trim() === '') {
    throw new TypeError('Browser-safe Agent RPC result requires a correlation identifier.');
  }
}
