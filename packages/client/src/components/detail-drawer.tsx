'use client';

import * as Dialog from '@radix-ui/react-dialog';
import { useId, useRef, type ReactNode } from 'react';

interface DetailDrawerProps {
  readonly open: boolean;
  readonly title: string;
  readonly onClose: () => void;
  readonly children: ReactNode;
  readonly initialFocusSelector?: string;
}

/**
 * Detail drawer / sheet として使う Radix Dialog ベースの accessible dialog。
 *
 * @param open - drawer を表示するかどうか。
 * @param title - dialog heading と accessible label に使うタイトル。
 * @param onClose - overlay click、Esc、Close button、Radix open state change で呼ぶ close callback。
 * @param children - drawer body に表示する詳細 content。
 * @param initialFocusSelector - open 時に最初に focus する drawer 内要素の CSS selector。省略時は title に focus する。
 * @returns focus trap、Esc close、return focus を Radix Dialog primitive で提供する drawer。
 */
export function DetailDrawer({
  open,
  title,
  onClose,
  children,
  initialFocusSelector,
}: DetailDrawerProps) {
  const titleId = useId();
  const contentRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLSpanElement>(null);

  // Radix の open state change を親 state に接続し、overlay click/Esc/Close button を同じ close 経路へ集約する。
  const handleOpenChange = (nextOpen: boolean): void => {
    if (!nextOpen) {
      onClose();
    }
  };

  // wireframe の「初期 focus は review heading」要件に対応し、指定 selector がなければ drawer title に focus する。
  const handleOpenAutoFocus = (event: Event): void => {
    const preferredTarget =
      initialFocusSelector === undefined
        ? undefined
        : contentRef.current?.querySelector<HTMLElement>(initialFocusSelector);
    const target = preferredTarget ?? titleRef.current;
    if (target !== null) {
      event.preventDefault();
      target.focus();
    }
  };

  // close 時は Radix FocusScope の既定処理に任せ、open 後の dialog 内 focus を誤って保存しない。
  const handleCloseAutoFocus = (): void => {
    // no-op: preventDefault しないことで、Radix が保持した open 前 focus へ戻す。
  };

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="detail-drawer-backdrop" />
        <Dialog.Content
          ref={contentRef}
          className="detail-drawer"
          aria-labelledby={titleId}
          onOpenAutoFocus={handleOpenAutoFocus}
          onCloseAutoFocus={handleCloseAutoFocus}
        >
          <div className="topline">
            <Dialog.Title asChild>
              <span id={titleId} ref={titleRef} tabIndex={-1}>
                {title}
              </span>
            </Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" className="nav-link">
                Close
              </button>
            </Dialog.Close>
          </div>
          <div className="page-band">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
