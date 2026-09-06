import { useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { LoginInput, RegisterInput, UserRole } from '@ecom/shared';
import { ApiError } from '@/lib/apiClient';
import * as authApi from './auth.api';
import type { AuthUser } from './auth.api';

/**
 * Auth data access.
 *
 * The signed-in user is **server state** — it lives in the database and is
 * fetched over HTTP — so TanStack Query owns it outright. It is deliberately
 * NOT mirrored into Redux: a copy in the store would need an effect to keep it
 * in step, and two sources of truth that can drift is precisely the problem
 * this architecture exists to avoid.
 *
 * Redux owns client state (see `store/slices/uiSlice.ts`), which is a different
 * kind of thing and needs no synchronisation with anything.
 */

export const authKeys = {
  all: ['auth'] as const,
  currentUser: () => [...authKeys.all, 'me'] as const,
};

const STAFF_ROLES: readonly UserRole[] = ['support', 'manager', 'admin'];

export interface AuthContext {
  user: AuthUser | null;
  isAuthenticated: boolean;
  /**
   * True until the first `/auth/me` settles.
   *
   * Route guards must wait on this rather than treating "not yet known" as
   * "signed out" — otherwise a hard refresh bounces a perfectly valid session
   * to the login page.
   */
  isResolving: boolean;
  isStaff: boolean;
  hasPermission: (permission: string) => boolean;
}

/**
 * The session.
 *
 * Every component that needs the current user calls this. TanStack Query
 * de-duplicates by key, so N callers share one request and one cache entry —
 * which is what makes a single source of truth practical without prop drilling
 * or a store mirror.
 */
export function useAuth(): AuthContext {
  const query = useQuery({
    queryKey: authKeys.currentUser(),
    queryFn: async (): Promise<AuthUser | null> => {
      try {
        return await authApi.fetchCurrentUser();
      } catch (error) {
        // A 401 is the answer "signed out", not a failure worth retrying or
        // surfacing. Anything else is a real error.
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    // The session must never be served stale: a signed-out user still seeing
    // their name in the header is alarming, and a stale role is a security smell.
    staleTime: 0,
    retry: false,
  });

  const user = query.data ?? null;

  return useMemo(
    () => ({
      user,
      isAuthenticated: user !== null,
      isResolving: query.isPending,
      isStaff: user ? STAFF_ROLES.includes(user.role) : false,
      // Presentation only — hiding a control the user cannot use. The server
      // re-checks every request, so a tampered cache reveals a button, not an
      // ability.
      hasPermission: (permission: string) => user?.permissions.includes(permission) ?? false,
    }),
    [user, query.isPending],
  );
}

/** Shared success handling for sign-in and registration. */
function useEstablishSession() {
  const queryClient = useQueryClient();

  return (user: AuthUser) => {
    // Seed the cache directly so no refetch is needed for what we just learned.
    queryClient.setQueryData(authKeys.currentUser(), user);
    // The guest bag was merged server-side during sign-in, so the cached
    // anonymous cart and wishlist are now wrong.
    void queryClient.invalidateQueries({ queryKey: ['cart'] });
    void queryClient.invalidateQueries({ queryKey: ['wishlist'] });
  };
}

export function useLogin() {
  const establishSession = useEstablishSession();

  return useMutation({
    mutationFn: (credentials: LoginInput) => authApi.login(credentials),
    onSuccess: establishSession,
  });
}

export function useRegister() {
  const establishSession = useEstablishSession();

  return useMutation({
    mutationFn: (input: RegisterInput) => authApi.register(input),
    onSuccess: establishSession,
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      // Order matters. Mark the session signed-out FIRST, so every mounted
      // `useAuth` observer sees `null` synchronously and route guards react on
      // the same tick. Calling `clear()` first would drop the auth query too,
      // leaving its observers holding the previous user until a refetch landed
      // — which is long enough to leave someone sitting on a page they are no
      // longer allowed to see.
      queryClient.setQueryData(authKeys.currentUser(), null);

      // Then discard everything fetched as the previous user; keeping any of it
      // would leak one account's data into the next session on this device.
      queryClient.removeQueries({
        predicate: (query) => query.queryKey[0] !== 'auth',
      });

      toast.success('Signed out');
      // Deliberately no redirect. Signing out on a public page should leave the
      // customer where they were; a page that genuinely requires auth is sent
      // to /login by its route guard, which records where to return to.
    },
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: authApi.resendVerification,
    onSuccess: () => toast.success('Confirmation email sent. Check your inbox.'),
  });
}

/**
 * Field-level errors from a failed auth request.
 *
 * Read straight off the mutation rather than stored anywhere: form feedback is
 * transient and belongs to the form, not to global application state.
 */
export function authFieldErrors(error: unknown): Record<string, string> {
  return error instanceof ApiError ? error.fieldErrorMap : {};
}

export function authErrorMessage(error: unknown, fallback: string): string | null {
  if (!error) return null;
  return error instanceof ApiError ? error.message : fallback;
}
