import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from './cn';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full border font-mono text-xs uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'border-signal/70 bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'border-line bg-secondary text-secondary-foreground hover:bg-secondary/80',
        outline: 'border-line bg-transparent text-foreground hover:bg-secondary',
        ghost: 'border-transparent bg-transparent text-foreground hover:bg-secondary',
        destructive:
          'border-error/60 bg-destructive text-destructive-foreground hover:bg-destructive/90',
        link: 'border-transparent bg-transparent text-cyan underline-offset-4 hover:underline',
      },
      size: {
        default: 'px-4 py-2',
        sm: 'px-3 py-1.5 text-[0.7rem]',
        lg: 'px-6 py-3',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);

/** Props for the shadcn-style Button component. */
export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    readonly asChild?: boolean;
  };

/**
 * shadcn-style Button component customized to the control-room theme.
 *
 * Uses `@radix-ui/react-slot` for `asChild` composition. Variants map to
 * the wireframe §5.1 Button wrapper: `default` (amber signal), `secondary`
 * (panel), `destructive` (error), `outline` (line border), `ghost`.
 */
export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : 'button';
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}

export { buttonVariants };
