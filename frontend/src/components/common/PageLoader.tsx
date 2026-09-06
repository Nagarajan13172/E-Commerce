import { Loader2 } from 'lucide-react';

/**
 * Fallback while a lazily-loaded route chunk downloads.
 *
 * `role="status"` + `aria-live` means screen readers announce the wait instead
 * of landing on a silently empty page.
 */
export function PageLoader() {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex min-h-[60vh] w-full items-center justify-center"
    >
      <Loader2 className="text-muted-foreground size-6 animate-spin" aria-hidden="true" />
      <span className="sr-only">Loading page</span>
    </div>
  );
}
