'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

import { Button } from './ui/button';

import type {
  BrowserSafeAgentRpcResult,
  BrowserSafeOperationDisplayData,
} from './schemas/browser-safe-result';

/**
 * 登録と Agent 選択済み操作で共有する Browser-safe result region の props です。
 *
 * @typeParam TDisplayData - action 固有の許可済み表示データです。
 * @remarks
 * すべての値は Server Action の四属性 result か UI 内部の pending 状態です。SDK transport、credential、
 * signing key、raw diagnostic は props として受け取りません。
 */
export interface OperationResultRegionProps<TDisplayData extends BrowserSafeOperationDisplayData> {
  /** Server Action が返した四属性で閉じた安全な結果です。 */
  readonly result: BrowserSafeAgentRpcResult<TDisplayData> | undefined;
  /** Server Action の完了を待つ UI 内部状態です。 */
  readonly pending: boolean;
  /** 処理中に表示する固定安全見出しです。 */
  readonly pendingTitle: string;
  /** 処理中に表示する固定安全本文です。 */
  readonly pendingMessage: string;
  /** 成功または失敗の結果の後に置く action 固有の安全な導線です。 */
  readonly children?: ReactNode;
}

/**
 * SDK-backed Server Action の進行・成功・安全な失敗を単一ライブ領域で表示します。
 *
 * @typeParam TDisplayData - action 固有の許可済み表示データです。
 * @param props - four-field result、pending copy、分類別の安全な次操作を含む props です。
 * @returns フォーカス、live region、問い合わせ ID コピー導線を備えたインライン結果領域です。
 * @remarks
 * 初期状態は高さ 0 で DOM 位置を保ちます。完了時は見出しへフォーカスし、失敗では correlation ID 全文を
 * 選択可能に表示します。Clipboard API が使えない場合は本文選択によるコピーを案内します。
 */
export function OperationResultRegion<TDisplayData extends BrowserSafeOperationDisplayData>({
  result,
  pending,
  pendingTitle,
  pendingMessage,
  children,
}: OperationResultRegionProps<TDisplayData>) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [copyMessage, setCopyMessage] = useState<string | undefined>();
  const [copyUnavailable, setCopyUnavailable] = useState(false);
  const isComplete = result !== undefined && !pending;
  const clipboard = resolveBrowserClipboard();
  const clipboardAvailable = clipboard !== undefined && !copyUnavailable;

  useEffect(() => {
    // 非同期完了時に結果見出しへ移動し、視覚・キーボード・スクリーンリーダー利用者の通知位置を一致させます。
    if (isComplete) {
      headingRef.current?.focus();
    }
    setCopyMessage(undefined);
    setCopyUnavailable(false);
  }, [isComplete, result?.correlationId]);

  const copyCorrelationId = async (): Promise<void> => {
    if (result === undefined || clipboard === undefined) {
      return;
    }
    // clipboard へは secret-free correlation ID だけを渡し、完了通知は独立した polite live region で一度だけ行います。
    try {
      await clipboard.writeText(result.correlationId);
      setCopyMessage('問い合わせIDをコピーしました。');
    } catch {
      // 権限拒否などで Clipboard API が失敗しても、問い合わせ ID 本文は選択可能なまま残して代替手順を知らせます。
      setCopyUnavailable(true);
      setCopyMessage('問い合わせIDを選択してコピーできます。');
    }
  };

  if (!pending && result === undefined) {
    return <div aria-hidden="true" className="h-0 overflow-hidden" />;
  }

  if (pending) {
    return (
      <div
        aria-atomic="true"
        aria-live="polite"
        className="mb-6 rounded-md border bg-muted px-4 py-3 text-sm text-foreground"
        role="status"
      >
        <h3 className="font-medium">{pendingTitle}</h3>
        <p className="mt-1">{pendingMessage}</p>
      </div>
    );
  }

  if (result === undefined) {
    return null;
  }

  const failed = result.safeStatus === 'failed';
  return (
    <div
      aria-atomic="true"
      aria-live={failed ? undefined : 'polite'}
      className={
        failed
          ? 'mb-6 rounded-md border border-destructive/50 bg-destructive/10 px-4 py-3 text-sm text-foreground'
          : 'mb-6 rounded-md border bg-muted px-4 py-3 text-sm text-foreground'
      }
      role={failed ? 'alert' : 'status'}
    >
      <h3 ref={headingRef} tabIndex={-1} className="font-medium outline-none">
        {result.displayData.title}
      </h3>
      <p className="mt-1">{result.displayData.message}</p>
      {failed ? (
        <div className="mt-4 space-y-2 border-t pt-3">
          <p className="font-medium">問い合わせID</p>
          <code className="block select-text break-all rounded bg-background px-2 py-1 font-mono text-xs text-foreground">
            {result.correlationId}
          </code>
          {clipboardAvailable ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              aria-label={`問い合わせID ${result.correlationId} をコピー`}
              onClick={() => {
                void copyCorrelationId();
              }}
            >
              問い合わせIDをコピー
            </Button>
          ) : (
            <p aria-live="polite" role="status">
              問い合わせIDを選択してコピーできます。
            </p>
          )}
          <p>このIDを運用担当者へ伝えると、サーバー側ログを安全に照合できます。</p>
          {copyMessage === '問い合わせIDをコピーしました。' ? (
            <p aria-live="polite" className="sr-only" role="status">
              {copyMessage}
            </p>
          ) : null}
        </div>
      ) : null}
      {children}
    </div>
  );
}

function resolveBrowserClipboard(): Clipboard | undefined {
  // Server Component pre-render 中は `navigator` が存在しないため、Reflect 経由で Browser API の有無だけを安全に確認します。
  const browserNavigator = Reflect.get(globalThis, 'navigator') as
    | { readonly clipboard?: Clipboard }
    | undefined;
  return browserNavigator?.clipboard;
}
