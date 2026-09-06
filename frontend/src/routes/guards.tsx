import type { ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router';
import { useAuth } from '@/features/auth/api/queries';
import { PageLoader } from '@/components/common/PageLoader';

/**
 * Route guards.
 *
 * A **user-experience** control, not a security one. Anyone can bypass these
 * with devtools or by calling the API directly — which is fine, because the
 * server authorizes every request independently. Their job is to avoid
 * rendering a page that is going to fail, and to send people somewhere useful.
 *
 * Session state comes from `useAuth()`, whose single source of truth is the
 * query cache; there is no store copy that could disagree with it.
 */

/**
 * Requires a signed-in user.
 *
 * The `isResolving` branch is essential: on a hard refresh the session is
 * unknown until `/auth/me` returns. Redirecting during that window would bounce
 * a perfectly valid session to the login screen on every page reload.
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { isAuthenticated, isResolving } = useAuth();
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
  const { isAuthenticated, isResolving } = useAuth();

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
  const { user, isResolving } = useAuth();
  const location = useLocation();

  if (isResolving) return <PageLoader />;

  if (!user) {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?next=${next}`} replace />;
  }

  if (!roles.includes(user.role)) return <Navigate to="/404" replace />;

  return <>{children}</>;
}
