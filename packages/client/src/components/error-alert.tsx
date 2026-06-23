import { Alert, AlertDescription, AlertTitle } from './ui/alert';

interface ErrorAlertProps {
  readonly message: string;
  readonly title?: string;
  readonly retryLabel?: string;
  readonly onRetry?: () => void;
}

/**
 * Inline alert with safe error copy and `role="alert"`.
 *
 * Built on the shadcn-style `Alert` primitive with `destructive` variant.
 * Never renders raw stack traces or secret material per the wireframe §5.1
 * `ErrorAlert` mapping and §2 secrecy invariants.
 */
export function ErrorAlert({ message, title = 'Error', retryLabel, onRetry }: ErrorAlertProps) {
  return (
    <Alert variant="destructive" role="alert">
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{message}</AlertDescription>
      {onRetry !== undefined ? (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 font-mono text-xs uppercase tracking-wider text-error underline"
        >
          {retryLabel ?? 'Retry'}
        </button>
      ) : null}
    </Alert>
  );
}
