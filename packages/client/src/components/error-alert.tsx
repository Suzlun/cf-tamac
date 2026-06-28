import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { Button } from './ui/button';

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
        <Button
          type="button"
          onClick={onRetry}
          variant="link"
          size="sm"
          className="mt-2 h-auto p-0 text-destructive"
        >
          {retryLabel ?? 'Retry'}
        </Button>
      ) : null}
    </Alert>
  );
}
