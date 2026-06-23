import { cn } from './cn';

/** Props for the shadcn-style Textarea component. */
export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

/**
 * shadcn-style Textarea component customized to the control-room theme.
 *
 * Styled with `--line` border, `--coal` background, `--paper` text, and
 * `--cyan` focus ring per the wireframe §4.7 token mapping.
 */
export function Textarea({ className, ...props }: TextareaProps) {
  return (
    <textarea
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-input bg-coal/40 px-3 py-2 font-mono text-sm text-foreground ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50',
        className
      )}
      {...props}
    />
  );
}
