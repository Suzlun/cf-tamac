import { cn } from './cn';

/** Props for the shadcn-style Select component. */
export type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement>;

/**
 * shadcn-style Select component (plain HTML select).
 *
 * Uses native `<select>` element (no `@radix-ui/react-select` dependency
 * required). Styled with `--line` border, `--coal` background, `--paper`
 * text, and `--cyan` focus ring per the wireframe §4.7 token mapping.
 */
export function Select({ className, children, ...props }: SelectProps) {
  return (
    <select
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-coal/40 px-3 py-2 font-mono text-sm text-foreground ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    >
      {children}
    </select>
  );
}
