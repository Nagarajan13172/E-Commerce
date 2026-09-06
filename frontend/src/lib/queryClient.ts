import { QueryClient } from '@tanstack/react-query';
import { ApiError } from './apiClient';

/**
 * Cache policy.
 *
 * `staleTime` is set per-query at the call site, because the right answer varies
 * enormously: a category tree can be stale for half an hour, a cart cannot be
 * stale at all. The defaults here are the conservative middle ground.
 */
export const STALE_TIME = {
  /** Cart, checkout quotes, inventory — anything where staleness is a bug. */
  NONE: 0,
  /** Admin tables: fresh enough to feel live, cached enough to not thrash. */
  SHORT: 30 * 1000,
  /** Product listings, homepage sections. */
  MEDIUM: 5 * 60 * 1000,
  /** Category tree, brand list — changes are rare and admin-triggered. */
  LONG: 30 * 60 * 1000,
} as const;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: STALE_TIME.MEDIUM,
      gcTime: 10 * 60 * 1000,
      refetchOnWindowFocus: false,
      // Retrying a 4xx is pointless — the request was wrong, not unlucky — and
      // it triples the latency of every "not found" the user hits.
      retry: (failureCount, error) => {
        if (error instanceof ApiError && error.status >= 400 && error.status < 500) return false;
        return failureCount < 2;
      },
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
    },
    mutations: {
      // Never silently retry a mutation: replaying "place order" or "pay" is
      // exactly the failure mode idempotency keys exist to prevent.
      retry: false,
    },
  },
});
