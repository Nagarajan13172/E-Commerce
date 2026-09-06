import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthResolving, selectIsAuthenticated, selectAuthUser } from '@/store/selectors';
import { PageLoader } from '@/components/common/PageLoader';

/**
 * Route guards.
 *
 * These are a **user-experience** control, not a security control. Anyone can
 * bypass them with devtools or by calling the API directly — which is fine,
 * because the server authorizes every request independently. Their job is to
 * avoid showing a page that is going to fail, and to send people somewhere
 * useful instead.
 */

/**
 * Requires a signed-in user.
 *
 * The `isResolving` branch is essential: on a hard refresh the session is
 * unknown until `/auth/me` returns. Redirecting during that window would bounce
 * a perfectly valid session to the login screen on every page reload.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const isResolving = useAppSelector(selectIsAuthResolving);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);
  const location = useLocation();

  if (isResolving) return <PageLoader />;

  if (!isAuthenticated) {
    // Preserve the destination so sign-in can return the user to it.
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  return <>{children}</>;
}

/** Keeps signed-in users off the login and register pages. */
export function RequireGuest({ children }: { children: ReactNode }) {
  const isResolving = useAppSelector(selectIsAuthResolving);
  const isAuthenticated = useAppSelector(selectIsAuthenticated);

  if (isResolving) return <PageLoader />;
  if (isAuthenticated) return <Navigate to="/account" replace />;
  return <>{children}</>;
}

/**
 * Gate for the admin area.
 *
 * A signed-in customer gets a 404 rather than a redirect to login: telling them
 * "this exists but you may not see it" is information they do not need.
 */
export function RequireRole({ roles, children }: { roles: string[]; children: ReactNode }) {
  const isResolving = useAppSelector(selectIsAuthResolving);
  const user = useAppSelector(selectAuthUser);
  const location = useLocation();

  if (isResolving) return <PageLoader />;

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (!roles.includes(user.role)) return <Navigate to="/404" replace />;

  return <>{children}</>;
}
