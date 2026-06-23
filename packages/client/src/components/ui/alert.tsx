import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from './cn';

const alertVariants = cva(
  'relative w-full rounded-lg border p-4 [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground [&>svg~*]:pl-7',
  {
    variants: {
      variant: {
        default: 'border-border bg-card text-card-foreground',
        destructive: 'border-error/60 text-error [&>svg]:text-error',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

/** Props for the shadcn-style Alert component. */
export type AlertProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>;

/**
 * shadcn-style Alert component customized to the control-room theme.
 *
 * The `destructive` variant uses `--error` for error states per the wireframe
 * §4.5 `.state-error` token. `role="alert"` is set by the wrapper when used
 * for error announcements.
 */
export function Alert({ className, variant, ...props }: AlertProps) {
  return <div className={cn(alertVariants({ variant }), className)} {...props} />;
}

/** Props for the AlertTitle heading. */
export type AlertTitleProps = React.HTMLAttributes<HTMLHeadingElement>;

/**
 * shadcn-style AlertTitle heading for Alert content.
 */
export function AlertTitle({ className, ...props }: AlertTitleProps) {
  return (
    <h5
      className={cn('mb-1 font-mono text-xs uppercase tracking-wider leading-none', className)}
      {...props}
    />
  );
}

/** Props for the AlertDescription body. */
export type AlertDescriptionProps = React.HTMLAttributes<HTMLParagraphElement>;

/**
 * shadcn-style AlertDescription for Alert body copy.
 */
export function AlertDescription({ className, ...props }: AlertDescriptionProps) {
  return <div className={cn('text-sm text-muted-foreground', className)} {...props} />;
}

export { alertVariants };
