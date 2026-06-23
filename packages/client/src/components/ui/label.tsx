import { forwardRef } from 'react';

import { cn } from './cn';

/** Props for the shadcn-style Label component. */
export type LabelProps = React.LabelHTMLAttributes<HTMLLabelElement>;

/**
 * shadcn-style Label component.
 *
 * Uses plain HTML `<label>` (no `@radix-ui/react-label` dependency required).
 * Styled with `--signal` text color and monospace font per the wireframe §4.7
 * typography mapping for form labels.
 */
export const Label = forwardRef<HTMLLabelElement, LabelProps>(({ className, ...props }, ref) => {
  return (
    <label
      ref={ref}
      className={cn(
        'block mb-1.5 font-mono text-xs uppercase tracking-wider text-primary',
        className
      )}
      {...props}
    />
  );
});
Label.displayName = 'Label';
