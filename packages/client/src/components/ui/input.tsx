import { cn } from './cn';

/** Props for the shadcn-style Input component. */
export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

/**
 * shadcn-style Input component customized to the control-room theme.
 *
 * Styled with `--line` border, `--coal` background, `--paper` text, and
 * `--cyan` focus ring per the wireframe §4.7 token mapping.
 */
export function Input({ className, type, ...props }: InputProps) {
  return (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-coal/40 px-3 py-2 font-mono text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}
