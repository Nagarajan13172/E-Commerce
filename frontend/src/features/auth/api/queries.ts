import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { LoginInput, RegisterInput } from '@ecom/shared';
import { ApiError } from '@/lib/apiClient';
import { useAppDispatch } from '@/store/hooks';
import {
  authFailed,
  authRequestFailed,
  authRequestStarted,
  sessionEstablished,
  sessionEnded,
} from '@/store/slices/authSlice';
import * as authApi from './auth.api';
import type { AuthUser } from './auth.api';

/**
 * Auth data fetching.
 *
 * The division of responsibility, applied consistently across the app:
 *
 *   TanStack Query  — every HTTP call, plus its caching, deduplication,
 *                     retry policy and in-flight state.
 *   Redux Toolkit   — the resulting application state, which components and
 *                     route guards read from.
 *
 * These hooks are the seam. They call the API layer and commit the outcome to
 * the store, so no reducer ever performs I/O and no component has to know
 * whether the session came from cache or the network.
 */

export const authKeys = {
  all: ['auth'] as const,
  currentUser: () => [...authKeys.all, 'me'] as const,
};

/**
 * Restore the session on boot.
 *
 * The access token is an httpOnly cookie the app cannot read, so the only way
 * to learn whether a session exists is to ask. A 401 is a normal answer here —
 * it means "signed out", not "something failed" — so it resolves to null rather
 * than throwing.
 */
export function useCurrentUser() {
  const dispatch = useAppDispatch();

  const query = useQuery({
    queryKey: authKeys.currentUser(),
    queryFn: async (): Promise<AuthUser | null> => {
      try {
        return await authApi.fetchCurrentUser();
      } catch (error) {
        if (error instanceof ApiError && error.status === 401) return null;
        throw error;
      }
    },
    // The session is the one thing that must never be served stale — a signed
    // out user seeing their old name in the header is alarming.
    staleTime: 0,
    retry: false,
  });

  // Commit the query outcome to the store, which is what the rest of the app
  // reads. Kept in an effect so the reducer stays synchronous and pure.
  useEffect(() => {
    if (query.isPending) return;
    if (query.isError) {
      dispatch(authFailed());
      return;
    }
    dispatch(query.data ? sessionEstablished(query.data) : sessionEnded());
  }, [query.isPending, query.isError, query.data, dispatch]);

  return query;
}

function useAuthMutation(mutationFn: (input: never) => Promise<AuthUser>, fallbackMessage: string) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onMutate: () => {
      dispatch(authRequestStarted());
    },
    onSuccess: (user: AuthUser) => {
      // Seed the cache so a later `useCurrentUser` does not refetch what we
      // already know, then publish to the store.
      queryClient.setQueryData(authKeys.currentUser(), user);
      dispatch(sessionEstablished(user));
      // The guest bag was merged server-side during sign-in, so the cached
      // anonymous cart is now wrong.
      void queryClient.invalidateQueries({ queryKey: ['cart'] });
      void queryClient.invalidateQueries({ queryKey: ['wishlist'] });
    },
    onError: (error: unknown) => {
      const isApiError = error instanceof ApiError;
      dispatch(
        authRequestFailed({
          message: isApiError ? error.message : fallbackMessage,
          fieldErrors: isApiError ? error.fieldErrorMap : {},
        }),
      );
    },
  });
}

export function useLogin() {
  return useAuthMutation(
    (credentials: never) => authApi.login(credentials as unknown as LoginInput),
    'Unable to sign in. Please try again.',
  );
}

export function useRegister() {
  return useAuthMutation(
    (input: never) => authApi.register(input as unknown as RegisterInput),
    'Unable to create your account.',
  );
}

export function useLogout() {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: authApi.logout,
    onSuccess: () => {
      dispatch(sessionEnded());
      // Every cached query was fetched as the previous user. Keeping any of it
      // would leak one account's data into the next session on this device.
      queryClient.clear();
      toast.success('Signed out');
      // Deliberately no redirect. Signing out on a public page should leave the
      // customer where they were; a page that genuinely requires auth is sent to
      // /login by its route guard, which also records where to return to.
    },
  });
}

export function useResendVerification() {
  return useMutation({
    mutationFn: authApi.resendVerification,
    onSuccess: () => toast.success('Confirmation email sent. Check your inbox.'),
  });
}
