import type { CookieOptions, Response } from 'express';
import { env, isProduction } from '../config/env.js';

/**
 * Auth cookie policy.
 *
 * All auth cookies are `httpOnly`, so JavaScript — including any script injected
 * by an XSS — cannot read them. That is the central reason tokens live in
 * cookies rather than `localStorage`: a token the page can read is a token an
 * attacker can exfiltrate.
 *
 * The cost of cookies is CSRF, which the double-submit token middleware closes.
 */

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';
export const GUEST_CART_COOKIE = 'guest_cart_id';
/**
 * A readable flag saying "this browser has a refresh token".
 *
 * It carries no secret — just `1` — and exists so the SPA can tell whether a
 * token refresh is worth attempting. The refresh token itself is httpOnly and
 * therefore invisible to scripts, so without this hint every anonymous visitor
 * fires a doomed POST /auth/refresh on page load, and a signed-out user's very
 * first request pair is two guaranteed failures.
 */
export const SESSION_HINT_COOKIE = 'has_session';

const baseCookie: CookieOptions = {
  httpOnly: true,
  secure: env.COOKIE_SECURE,
  // Lax, not Strict, for the access token: Strict would drop the cookie on any
  // inbound link from another site (an emailed order link, a search result),
  // logging the user out for no security gain — Lax already blocks the
  // cross-site POSTs that CSRF depends on.
  sameSite: 'lax',
  path: '/',
  ...(isProduction && env.COOKIE_DOMAIN !== 'localhost' ? { domain: env.COOKIE_DOMAIN } : {}),
};

export function setAccessCookie(res: Response, token: string): void {
  res.cookie(ACCESS_COOKIE, token, {
    ...baseCookie,
    maxAge: 15 * 60 * 1000,
  });
}

/**
 * The refresh cookie is scoped tighter than the access cookie in two ways:
 *
 * - `path` limits it to the auth routes, so it is not attached to every API call
 *   — the most valuable credential travels the least.
 * - `sameSite: strict` is affordable here because refresh is only ever triggered
 *   by same-site XHR, never by a top-level navigation from elsewhere.
 */
export function setRefreshCookie(res: Response, token: string): void {
  res.cookie(REFRESH_COOKIE, token, {
    ...baseCookie,
    sameSite: 'strict',
    path: `${env.API_PREFIX}/auth`,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

/** Readable by design — it is a hint, not a credential. */
export function setSessionHintCookie(res: Response): void {
  res.cookie(SESSION_HINT_COOKIE, '1', {
    ...baseCookie,
    httpOnly: false,
    maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
  });
}

export function setGuestCartCookie(res: Response, guestId: string): void {
  res.cookie(GUEST_CART_COOKIE, guestId, {
    ...baseCookie,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

/**
 * Clear the auth cookies.
 *
 * The options must match those used when setting them — a browser will not
 * clear a cookie whose path or domain differs, which is the classic "logout
 * didn't work" bug.
 */
export function clearAuthCookies(res: Response): void {
  res.clearCookie(ACCESS_COOKIE, { ...baseCookie });
  res.clearCookie(SESSION_HINT_COOKIE, { ...baseCookie, httpOnly: false });
  res.clearCookie(REFRESH_COOKIE, {
    ...baseCookie,
    sameSite: 'strict',
    path: `${env.API_PREFIX}/auth`,
  });
}
