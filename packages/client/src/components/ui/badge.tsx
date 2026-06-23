import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from './cn';

const badgeVariants = cva(
  'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-xs uppercase tracking-wider transition-colors',
  {
    variants: {
      variant: {
        default: 'border-signal/70 bg-signal text-primary-foreground',
        secondary: 'border-line bg-secondary text-secondary-foreground',
        outline: 'border-cyan/60 text-cyan',
        muted: 'border-line text-muted-foreground',
        destructive: 'border-error/60 text-error',
        success: 'border-cyan/60 text-cyan',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

/** Props for the shadcn-style Badge component. */
export type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

/**
 * shadcn-style Badge component customized to the control-room theme.
 *
 * Variants map to the wireframe §4.5 state tokens: `default` (amber signal),
 * `outline` (cyan agent token), `muted` (pending), `destructive` (error),
 * `success` (cyan confirmation).
 */
export function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { badgeVariants };
