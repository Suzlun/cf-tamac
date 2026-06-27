'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useId, useRef, type ReactNode } from 'react';

import { Button } from './ui/button';

interface ConfirmDialogProps {
  readonly open: boolean;
  readonly heading: string;
  readonly children: ReactNode;
  readonly confirmLabel: string;
  readonly onConfirm: () => void | Promise<void>;
  readonly onCancel: () => void;
  readonly pending?: boolean;
  readonly confirmDisabled?: boolean;
}

/**
 * 破壊的または重要な mutation の前に明示確認を求める controlled dialog。
 *
 * @param open - dialog を表示するかどうか。
 * @param heading - `alertdialog` の heading と accessible label に使う文言。
 * @param children - 操作者へ提示する確認本文。acting user echo はここに含める。
 * @param confirmLabel - 確定 button に表示する文言。
 * @param onConfirm - 確定 button click で実行する callback。Server Action は親から渡す。
 * @param onCancel - cancel button、Esc、overlay close で実行する callback。
 * @param pending - mutation 中に dialog controls と outside close を無効化する flag。
 * @param confirmDisabled - terminal state などで確定操作だけを無効化する flag。
 * @returns Radix Dialog primitive で focus trap、heading 初期 focus、return focus を備えた confirmation UI。
 */
export function ConfirmDialog({
  open,
  heading,
  children,
  confirmLabel,
  onConfirm,
  onCancel,
  pending = false,
  confirmDisabled = false,
}: ConfirmDialogProps) {
  const headingId = useId();
  const bodyId = useId();
  const headingRef = useRef<HTMLSpanElement>(null);

  // Radix の Esc/overlay close を cancel semantics に統一し、pending 中は二重操作を防ぐ。
  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen && !pending) {
      onCancel();
    }
  };

  // wireframe の指定通り dialog heading に初期 focus を置き、内容を先に読み上げさせる。
  const handleOpenAutoFocus = (event: Event): void => {
    if (headingRef.current !== null) {
      event.preventDefault();
      headingRef.current.focus();
    }
  };

  // close 時は Radix FocusScope の既定処理に任せ、open 後の dialog 内 focus を誤って保存しない。
  const handleCloseAutoFocus = (): void => {
    // no-op: preventDefault しないことで、Radix が保持した open 前 focus へ戻す。
  };

  // pending 中の overlay/pointer close を抑止し、mutation が完了するまで状態を固定する。
  const handleInteractOutside = (event: Event): void => {
    if (pending) {
      event.preventDefault();
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        {/* Radix Dialog 派生の overlay/portal で focus trap と focus return を提供する。 */}
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/80" aria-disabled={pending} />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-50 w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-background p-6 shadow-lg"
          role="alertdialog"
          aria-labelledby={headingId}
          aria-describedby={bodyId}
          aria-busy={pending}
          onOpenAutoFocus={handleOpenAutoFocus}
          onCloseAutoFocus={handleCloseAutoFocus}
          onInteractOutside={handleInteractOutside}
        >
          <Dialog.Title asChild>
            <span
              id={headingId}
              ref={headingRef}
              tabIndex={-1}
              className="block text-lg font-semibold"
            >
              {heading}
            </span>
          </Dialog.Title>
          <div id={bodyId} className="mt-3 space-y-4 text-sm">
            {children}
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={onCancel}
                disabled={pending}
                aria-disabled={pending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="default"
                onClick={() => {
                  void onConfirm();
                }}
                disabled={pending || confirmDisabled}
                aria-disabled={pending || confirmDisabled}
              >
                {pending ? 'Processing…' : confirmLabel}
              </Button>
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
