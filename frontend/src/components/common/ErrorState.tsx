import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/lib/apiClient';
import { cn } from '@/lib/utils';

interface ErrorStateProps {
  error: unknown;
  onRetry?: () => void;
  className?: string;
}

/**
 * A failed request, presented usefully.
 *
 * The server's message is shown when the error is one we raised deliberately —
 * those are written for customers. Anything else falls back to generic text,
 * because an unexpected 500's message is for engineers and may leak internals.
 * The request id is surfaced so a support conversation can start with something
 * findable in the logs.
 */
export function ErrorState({ error, onRetry, className }: ErrorStateProps) {
  const isApiError = error instanceof ApiError;
  const isServerFault = isApiError && error.status >= 500;

  const message =
    isApiError && !isServerFault
      ? error.message
      : 'Something went wrong on our side. Please try again in a moment.';

  return (
    <div
      role="alert"
      className={cn('flex flex-col items-center justify-center px-6 py-16 text-center', className)}
    >
      <div className="bg-destructive/10 text-destructive mb-4 flex size-12 items-center justify-center rounded-full">
        <AlertTriangle className="size-6" aria-hidden="true" />
      </div>
      <h2 className="text-base font-semibold">We couldn&rsquo;t load this</h2>
      <p className="text-muted-foreground mt-1.5 max-w-sm text-sm leading-relaxed">{message}</p>

      {isApiError && error.requestId && (
        <p className="text-muted-foreground mt-2 font-mono text-xs">Reference: {error.requestId}</p>
      )}

      {onRetry && (
        <Button type="button" variant="outline" onClick={onRetry} className="mt-6">
          <RefreshCw className="size-4" aria-hidden="true" />
          Try again
        </Button>
      )}
    </div>
  );
}
