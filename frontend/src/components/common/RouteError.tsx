import { isRouteErrorResponse, useRouteError, Link } from 'react-router';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';
import { ApiError } from '@/lib/apiClient';

/**
 * Last-resort boundary for anything a route throws.
 *
 * It distinguishes a genuine 404 from an API failure from an unexpected crash,
 * because the useful next action differs in each case: browse elsewhere, retry,
 * or go home.
 */
export function RouteError() {
  const error = useRouteError();

  let title = 'Something went wrong';
  let description = 'An unexpected error occurred. Please try again.';
  let requestId: string | undefined;

  if (isRouteErrorResponse(error)) {
    if (error.status === 404) {
      title = 'Page not found';
      description = 'The page you are looking for does not exist or has been moved.';
    } else {
      title = `Error ${error.status}`;
      description = error.statusText || description;
    }
  } else if (error instanceof ApiError) {
    title = error.status === 404 ? 'Not found' : 'We hit a problem';
    description = error.message;
    requestId = error.requestId;
  }

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
      <div className="bg-destructive/10 text-destructive mb-6 flex size-14 items-center justify-center rounded-full">
        <AlertTriangle className="size-7" aria-hidden="true" />
      </div>

      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-muted-foreground mt-2 max-w-md text-sm">{description}</p>

      {requestId && (
        <p className="text-muted-foreground mt-3 font-mono text-xs">Reference: {requestId}</p>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="border-input hover:bg-accent inline-flex h-10 items-center gap-2 rounded-md border px-4 text-sm font-medium transition-colors"
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Try again
        </button>
        <Link
          to="/"
          className="bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-10 items-center gap-2 rounded-md px-4 text-sm font-medium transition-colors"
        >
          <Home className="size-4" aria-hidden="true" />
          Back to home
        </Link>
      </div>
    </div>
  );
}
