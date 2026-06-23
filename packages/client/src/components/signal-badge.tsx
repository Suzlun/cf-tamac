import { Badge, type BadgeProps } from './ui/badge';
import { cn } from './ui/cn';

/**
 * `SignalBadge` が表示する dot/status の visual variant です。
 *
 * @remarks
 * `signal` は通常の amber 状態、`cyan` は成功/健全、`muted` は非アクティブ、`error` は失敗/危険状態を表します。
 * 値は shadcn/ui `Badge` variant に変換され、DOM や network への副作用はありません。
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

function toBadgeVariant(variant: SignalBadgeVariant): BadgeProps['variant'] {
  switch (variant) {
    case 'cyan':
      return 'success';
    case 'muted':
      return 'muted';
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
 * @returns shadcn/ui `Badge` primitive を使った status badge を返します。
 *
 * @remarks
 * lifecycle、credential、run、schedule、tool などの状態表示で使います。表示専用 component のため副作用はありません。
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
      className={cn('signal-badge-dot', className)}
    >
      {label}
    </Badge>
  );
}
