import { cn } from '@cf-tamac/client/lib/utils';

import { Badge, type BadgeProps } from './ui/badge';

/**
 * `SignalBadge` が表示する dot/status の visual variant です。
 *
 * @remarks
 * Shadcn 既定の `Badge` variant（`default` / `secondary` / `destructive` / `outline`）だけを使い、
 * 独自の color token や global CSS class には依存しません。
 * `signal` は通常の稼働状態、`cyan` は健全/成功、`muted` は非アクティブ、`error` は失敗/危険を表します。
 * DOM や network への副作用はありません。
 *
 * @example
 * ```tsx
 * <SignalBadge label="active" variant="cyan" />
 * ```
 */
export type SignalBadgeVariant = 'signal' | 'cyan' | 'muted' | 'error';

interface SignalBadgeProps {
  readonly label: string;
  readonly variant?: SignalBadgeVariant;
  readonly className?: string;
}

/**
 * `SignalBadgeVariant` を Shadcn 既定の `Badge` variant に割り当てます。
 * 追加の token や class を使わず、既定の semantic slot のみで状態を区別します。
 */
function toBadgeVariant(variant: SignalBadgeVariant): BadgeProps['variant'] {
  switch (variant) {
    case 'cyan':
      // 健全/成功状態は輪郭強調の outline で表現する。
      return 'outline';
    case 'muted':
      return 'secondary';
    case 'error':
      return 'destructive';
    default:
      return 'default';
  }
}

/**
 * colored dot と uppercase label を組み合わせた status indicator です。
 *
 * @param label - badge 内に表示し、`aria-label` にも使う状態名です。
 * @param variant - 状態の色表現です。未指定時は `signal` を使います。
 * @param className - 呼び出し側が追加する CSS class です。
 * @returns Shadcn/ui `Badge` primitive を使った status badge を返します。
 *
 * @remarks
 * lifecycle、credential、run、schedule、tool などの状態表示で使います。表示専用 component のため副作用はありません。
 * 先頭の dot は Shadcn token 由来の `currentColor` を使う inline utility で描画し、
 * 独自の global CSS class（旧 `.signal-badge-dot`）には依存しません。
 * `label` が空の場合も空 label の badge を描画しますが、呼び出し側は user-facing な状態名を渡してください。
 *
 * @example
 * ```tsx
 * <SignalBadge label="running" variant="signal" />
 * ```
 */
export function SignalBadge({ label, variant = 'signal', className }: SignalBadgeProps) {
  return (
    <Badge
      role="img"
      aria-label={label}
      variant={toBadgeVariant(variant)}
      className={cn('inline-flex items-center gap-1.5', className)}
    >
      {/* 状態色は currentColor（Badge の text token）を利用する。色単独ではなく label で意味を伝える。 */}
      <span aria-hidden="true" className="inline-block size-1.5 rounded-full bg-current" />
      {label}
    </Badge>
  );
}
