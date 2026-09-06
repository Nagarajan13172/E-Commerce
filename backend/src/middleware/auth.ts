import type { RequestHandler } from 'express';
import { ERROR_CODES } from '@ecom/shared';
import { User } from '../models/user.model.js';
import { AppError } from '../utils/AppError.js';
import { ACCESS_COOKIE } from '../utils/cookies.js';
import { verifyAccessToken } from '../services/token.service.js';
import { env } from '../config/env.js';

/**
 * Resolve the caller's identity from the access-token cookie.
 *
 * The token is read from a cookie, not an Authorization header: it is httpOnly,
 * so no script on the page can read or forward it.
 */
function extractToken(req: Parameters<RequestHandler>[0]): string | undefined {
  return req.cookies?.[ACCESS_COOKIE] as string | undefined;
}

/**
 * Require a signed-in user.
 *
 * Beyond checking the signature, this re-reads `status` and `tokenVersion` from
 * the database on every request. That costs one indexed lookup, and it is what
 * makes revocation *immediate*: a banned user or a user who just changed their
 * password is rejected on their very next request rather than when their JWT
 * happens to expire. For an e-commerce backend where a compromised session can
 * spend money, that trade is clearly worth it.
 */
export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) {
    return next(AppError.unauthenticated('Please sign in to continue'));
  }

  // Throws on expiry/tamper; the central handler maps it to a specific 401.
  const claims = verifyAccessToken(token);

  const user = await User.findById(claims.sub)
    .select('email role status emailVerifiedAt +tokenVersion')
    .lean();

  if (!user) {
    return next(AppError.unauthenticated('Your account no longer exists'));
  }

  // Password changed, role changed, or session revoked since this token was
  // issued — the claim is stale and the token must not be honoured.
  if (user.tokenVersion !== claims.tv) {
    return next(
      AppError.unauthenticated(
        'Your session is no longer valid. Please sign in again.',
        ERROR_CODES.TOKEN_INVALID,
      ),
    );
  }

  if (user.status !== 'active') {
    return next(AppError.forbidden('This account has been disabled', ERROR_CODES.ACCOUNT_DISABLED));
  }

  req.user = {
    id: String(user._id),
    email: user.email,
    role: user.role,
    tokenVersion: user.tokenVersion,
    emailVerified: Boolean(user.emailVerifiedAt),
  };

  next();
};

/**
 * Attach the user when signed in, but allow anonymous access.
 *
 * Used on endpoints that serve both — product pages that highlight wishlisted
 * items, carts that work for guests. A bad or expired token here is treated as
 * "not signed in" rather than an error, so an expired session degrades to the
 * guest experience instead of a wall.
 */
export const optionalAuth: RequestHandler = async (req, _res, next) => {
  const token = extractToken(req);
  if (!token) return next();

  try {
    const claims = verifyAccessToken(token);
    const user = await User.findById(claims.sub)
      .select('email role status emailVerifiedAt +tokenVersion')
      .lean();

    if (user && user.status === 'active' && user.tokenVersion === claims.tv) {
      req.user = {
        id: String(user._id),
        email: user.email,
        role: user.role,
        tokenVersion: user.tokenVersion,
        emailVerified: Boolean(user.emailVerifiedAt),
      };
    }
  } catch {
    // Intentionally silent: continue as a guest.
  }

  next();
};

/**
 * Require a confirmed email address.
 *
 * Gated behind a flag so local development is not blocked by it, while
 * production can require confirmation before an order is placed.
 */
export const requireVerifiedEmail: RequestHandler = (req, _res, next) => {
  if (!env.REQUIRE_VERIFIED_EMAIL_FOR_CHECKOUT) return next();
  if (req.user?.emailVerified) return next();

  next(
    AppError.forbidden(
      'Please confirm your email address before continuing',
      ERROR_CODES.EMAIL_NOT_VERIFIED,
    ),
  );
};
