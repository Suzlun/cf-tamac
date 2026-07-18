import { cn } from '@cf-tamac/client/lib/utils';

import type { ReactNode } from 'react';

interface ControlRoomFrameProps {
  /** ページ見出し（h1 相当のタイトル）。 */
  readonly title: string;
  /** topline 相当の短いスコープ/状態ラベル。主に breadcrumb 補助として使う。 */
  readonly signalLabel?: string;
  /** 本文の上に並べる primary action など（任意）。 */
  readonly actions?: ReactNode;
  /** タイトル下の補足説明（任意）。 */
  readonly description?: ReactNode;
  /** 本文。 */
  readonly children: ReactNode;
  /** section wrapper に追加する任意 CSS class。 */
  readonly className?: string;
}

/**
 * Management Client の各 route が main content 領域に描画する共通ページセクションフレーム。
 *
 * @remarks
 * タスク 1.5 / 1.7 / 契約: 旧 control-room 独自 CSS class と Shadcn `Card` による wrapper を廃止した。
 * 本 component は `<section>` + header row + content slot のみを提供し、Card を wrapper として使わない。
 * これにより content 側が Shadcn `Card` を使っても Card-in-Card（nested card）にならない
 * （Impeccable の nested card 禁止を満たす）。global/selected-Agent navigation は root layout sidebar が担うため、
 * 本 component はページコンテンツの heading/actions/slot のみを提供する。
 * 表示専用 component であり、Server Action・Agent RPC・credential には触れない。
 *
 * @example
 * ```tsx
 * <ControlRoomFrame title="Agent registry" description="managed Agents in this Client">
 *   <AgentList {...props} />
 * </ControlRoomFrame>
 * ```
 */
export function ControlRoomFrame({
  title,
  signalLabel,
  actions,
  description,
  children,
  className,
}: ControlRoomFrameProps) {
  return (
    // 固定 id は複数描画時に重複するため避け、section の accessible name は aria-label で与える。
    <section
      className={cn('mx-auto w-full max-w-7xl space-y-8 px-6 py-8 lg:px-10 lg:py-10', className)}
      aria-label={title}
    >
      <header className="flex flex-wrap items-start justify-between gap-6 border-b pb-6">
        <div className="max-w-3xl space-y-2">
          {signalLabel != null && signalLabel !== '' ? (
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              {signalLabel}
            </p>
          ) : null}
          {/* page title。Card wrapper を使わず、見出し階層は section > h1 で表現する。 */}
          <h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
          {description != null ? (
            <p className="text-base leading-7 text-muted-foreground">{description}</p>
          ) : null}
        </div>
        {actions != null ? <div className="flex items-center gap-3">{actions}</div> : null}
      </header>
      <div className="space-y-8">{children}</div>
    </section>
  );
}
