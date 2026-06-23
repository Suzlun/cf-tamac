import { cn } from './cn';

/** Props for the shadcn-style Separator component. */
export type SeparatorProps = React.HTMLAttributes<HTMLDivElement> & {
  readonly orientation?: 'horizontal' | 'vertical';
};

/**
 * shadcn-style Separator component.
 *
 * Uses plain HTML `<div>` (no `@radix-ui/react-separator` dependency required).
 * Styled with `--line` border per the wireframe §4.7 token mapping.
 */
export function Separator({ className, orientation = 'horizontal', ...props }: SeparatorProps) {
  return (
    <div
      role="separator"
      aria-orientation={orientation}
      className={cn(
        'shrink-0 bg-border',
        orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
        className
      )}
      {...props}
    />
  );
}
