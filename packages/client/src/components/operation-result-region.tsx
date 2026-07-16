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
  const clipboard = resolveBrowserClipboard();
  const clipboardAvailable = clipboard !== undefined && !copyUnavailable;
  const completionKey = getCompletionKey(result, pending);

  useEffect(() => {
    // 新しい安全な結果を一度だけ識別し、pending 中の既存 DOM を対象にして focus を奪わないようにします。
    setCopyMessage(undefined);
    setCopyUnavailable(false);
  }, [completionKey]);

  useEffect(() => {
    if (completionKey === undefined) {
      return;
    }

    // React の commit 後に live region と heading が確実に配置されるよう、次の描画フレームで focus を要求します。
    let cancelled = false;
    const focusHeading = (): void => {
      if (cancelled) {
        return;
      }
      const heading = headingRef.current;
      if (heading === null) {
        return;
      }
      // preventScroll を優先し、未対応ブラウザーでも結果位置への focus 自体は失わないように fallback します。
      try {
        heading.focus({ preventScroll: true });
      } catch {
        heading.focus();
      }
    };
    const requestFrame = globalThis.requestAnimationFrame;
    if (typeof requestFrame === 'function') {
      const frameId = requestFrame(focusHeading);
      return () => {
        cancelled = true;
        const cancelFrame = globalThis.cancelAnimationFrame;
        if (typeof cancelFrame === 'function') {
          cancelFrame(frameId);
        }
      };
    }
    const timeoutId = globalThis.setTimeout(focusHeading, 0);
    return () => {
      cancelled = true;
      globalThis.clearTimeout(timeoutId);
    };
  }, [completionKey]);

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

  const tone = resolveOperationTone(result, pending);
  // reconciliation 中も直前の correlation ID と補助操作を残し、確認起点の focus と Tab 順を維持します。
  const failedResult = result?.safeStatus === 'failed' ? result : undefined;
  const failed = !pending && failedResult !== undefined;
  return (
    <div
      aria-atomic="true"
      aria-live={failed ? undefined : 'polite'}
      className={resolveRegionClassName(tone)}
      role={failed ? 'alert' : 'status'}
    >
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="rounded-sm font-medium outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 focus:ring-offset-background"
      >
        {pending ? pendingTitle : result?.displayData.title}
      </h3>
      <p className="mt-1">{pending ? pendingMessage : result?.displayData.message}</p>
      {failedResult !== undefined ? (
        <div className="mt-4 space-y-2 border-t pt-3">
          <p className="font-medium">問い合わせID</p>
          <code className="block select-text break-all rounded bg-background px-2 py-1 font-mono text-xs text-foreground">
            {failedResult.correlationId}
          </code>
          {clipboardAvailable ? (
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              aria-label={`問い合わせID ${failedResult.correlationId} をコピー`}
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
      {/* pending 中も既存の確認・次操作を同じ DOM 位置へ保持し、起点ボタンの focus と Tab 順を壊しません。 */}
      {children}
    </div>
  );
}

function getCompletionKey<TDisplayData extends BrowserSafeOperationDisplayData>(
  result: BrowserSafeAgentRpcResult<TDisplayData> | undefined,
  pending: boolean
): string | undefined {
  if (pending || result === undefined) {
    return undefined;
  }
  // correlation ID だけに依存せず、同じ operation context の状態変化でも結果見出しを再通知します。
  return [
    result.safeStatus,
    result.safeErrorCategory ?? 'none',
    result.correlationId,
    result.displayData.title,
    result.displayData.message,
  ].join('\u0000');
}

type OperationResultTone = 'pending' | 'success' | 'reconciliation' | 'reregistration' | 'failure';

function resolveOperationTone<TDisplayData extends BrowserSafeOperationDisplayData>(
  result: BrowserSafeAgentRpcResult<TDisplayData> | undefined,
  pending: boolean
): OperationResultTone {
  if (pending || result === undefined) {
    return 'pending';
  }
  if (result.safeStatus === 'succeeded') {
    return 'success';
  }
  const displayData = result.displayData as unknown as Record<string, unknown>;
  if (displayData.registrationOutcome === 're_registration_ready') {
    return 'reregistration';
  }
  if (
    displayData.registrationOutcome === 'reconciliation_required' ||
    displayData.reconciliationRequired === true
  ) {
    return 'reconciliation';
  }
  return 'failure';
}

function resolveRegionClassName(tone: OperationResultTone): string {
  const baseClassName = 'mb-6 rounded-md border px-4 py-3 text-sm';
  if (tone === 'success') {
    return `${baseClassName} border-operation-success-border bg-operation-success text-operation-success-foreground`;
  }
  if (tone === 'reconciliation') {
    return `${baseClassName} border-operation-reconciliation-border bg-operation-reconciliation text-operation-reconciliation-foreground`;
  }
  if (tone === 'reregistration') {
    return `${baseClassName} border-operation-reregistration-border bg-operation-reregistration text-operation-reregistration-foreground`;
  }
  if (tone === 'failure') {
    return `${baseClassName} border-destructive/50 bg-destructive/10 text-foreground`;
  }
  return `${baseClassName} border-primary/30 bg-primary/5 text-foreground`;
}

function resolveBrowserClipboard(): Clipboard | undefined {
  // Server Component pre-render 中は `navigator` が存在しないため、Reflect 経由で Browser API の有無だけを安全に確認します。
  const browserNavigator = Reflect.get(globalThis, 'navigator') as
    | { readonly clipboard?: Clipboard }
    | undefined;
  return browserNavigator?.clipboard;
}
