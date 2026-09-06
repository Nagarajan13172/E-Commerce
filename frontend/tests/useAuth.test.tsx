import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { useAuth } from '@/features/auth/api/queries';
import * as authApi from '@/features/auth/api/auth.api';
import { ApiError } from '@/lib/apiClient';

/**
 * `useAuth` is the single source of truth for the session.
 *
 * These tests exist to keep it that way: if the session were ever mirrored into
 * Redux again, the "one request for many consumers" assertion below would fail,
 * because a store copy removes the need to subscribe and hides the duplication.
 */

function wrapper(client: QueryClient) {
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
}

const user: authApi.AuthUser = {
  id: 'u1',
  name: 'Priya Sharma',
  email: 'priya@example.com',
  role: 'customer',
  emailVerified: true,
  marketingOptIn: false,
  permissions: [],
  createdAt: new Date('2026-01-01').toISOString(),
};

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('useAuth', () => {
  it('reports "resolving" before the first response, not "signed out"', async () => {
    vi.spyOn(authApi, 'fetchCurrentUser').mockImplementation(
      () => new Promise(() => {}), // never settles
    );
    const { result } = renderHook(() => useAuth(), { wrapper: wrapper(makeClient()) });

    // The distinction route guards depend on: redirecting here would bounce a
    // valid session to /login on every hard refresh.
    expect(result.current.isResolving).toBe(true);
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('exposes the signed-in user once resolved', async () => {
    vi.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(user);
    const { result } = renderHook(() => useAuth(), { wrapper: wrapper(makeClient()) });

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user?.email).toBe('priya@example.com');
  });

  it('treats a 401 as "signed out" rather than an error', async () => {
    vi.spyOn(authApi, 'fetchCurrentUser').mockRejectedValue(
      new ApiError(401, 'UNAUTHENTICATED', 'Please sign in to continue'),
    );
    const { result } = renderHook(() => useAuth(), { wrapper: wrapper(makeClient()) });

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
  });

  it('derives staff status and permissions from the fetched user', async () => {
    vi.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue({
      ...user,
      role: 'manager',
      permissions: ['product:write'],
    });
    const { result } = renderHook(() => useAuth(), { wrapper: wrapper(makeClient()) });

    await waitFor(() => expect(result.current.isResolving).toBe(false));
    expect(result.current.isStaff).toBe(true);
    expect(result.current.hasPermission('product:write')).toBe(true);
    expect(result.current.hasPermission('order:refund')).toBe(false);
  });

  it('issues ONE request no matter how many components ask', async () => {
    const fetchSpy = vi.spyOn(authApi, 'fetchCurrentUser').mockResolvedValue(user);
    const client = makeClient();
    const wrap = wrapper(client);

    // Three independent consumers, as the header, a guard and a page would be.
    const a = renderHook(() => useAuth(), { wrapper: wrap });
    const b = renderHook(() => useAuth(), { wrapper: wrap });
    const c = renderHook(() => useAuth(), { wrapper: wrap });

    await waitFor(() => expect(a.result.current.isResolving).toBe(false));

    // Query de-duplication by key is what makes a single source of truth
    // practical without prop drilling or a store mirror.
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(b.result.current.user?.id).toBe('u1');
    expect(c.result.current.isAuthenticated).toBe(true);
  });
});
