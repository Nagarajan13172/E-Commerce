import type { Request, RequestHandler, Response } from 'express';
import type {
  ChangePasswordInput,
  ForgotPasswordInput,
  LoginInput,
  RegisterInput,
  ResetPasswordInput,
  UpdateProfileInput,
} from '@ecom/shared';
import * as authService from '../services/auth.service.js';
import {
  issueRefreshToken,
  revokeAllUserTokens,
  revokeRefreshToken,
  rotateRefreshToken,
  signAccessToken,
} from '../services/token.service.js';
import { User, type UserDocument } from '../models/user.model.js';
import { validatedBody } from '../middleware/validate.js';
import { sendCreated, sendSuccess } from '../utils/apiResponse.js';
import {
  REFRESH_COOKIE,
  clearAuthCookies,
  setAccessCookie,
  setRefreshCookie,
  setSessionHintCookie,
} from '../utils/cookies.js';
import { AppError } from '../utils/AppError.js';
import { permissionsForRole } from '../config/permissions.js';
import { mergeGuestCart } from '../services/cart.service.js';
import { GUEST_CART_COOKIE } from '../utils/cookies.js';
import { createLogger } from '../config/logger.js';

const log = createLogger('auth:controller');

/**
 * HTTP layer for authentication.
 *
 * Controllers stay thin on purpose: translate the request, call a service,
 * shape the response. No business rules live here — that keeps the rules
 * testable without spinning up Express, and keeps one rule in one place.
 */

/** Everything the client needs about the signed-in user, and nothing more. */
function presentUser(user: UserDocument) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone,
    avatarUrl: user.avatarUrl,
    role: user.role,
    emailVerified: Boolean(user.emailVerifiedAt),
    marketingOptIn: user.marketingOptIn,
    // Sent so the UI can hide controls the user cannot use. This is a UX
    // convenience only — the server re-checks on every request regardless.
    permissions: permissionsForRole(user.role),
    createdAt: user.createdAt,
  };
}

function requestContext(req: Request) {
  return { userAgent: req.get('user-agent'), ip: req.ip };
}

/** Issue both cookies for a freshly authenticated user. */
async function establishSession(req: Request, res: Response, user: UserDocument): Promise<void> {
  const { token: refreshToken } = await issueRefreshToken(user._id, requestContext(req));

  setAccessCookie(
    res,
    signAccessToken({
      sub: String(user._id),
      email: user.email,
      role: user.role,
      tv: user.tokenVersion ?? 0,
      ev: Boolean(user.emailVerifiedAt),
    }),
  );
  setRefreshCookie(res, refreshToken);
  setSessionHintCookie(res);

  // Carry an anonymous bag into the account. Failing to merge must never fail
  // the sign-in itself — the customer is authenticated either way, and losing a
  // cart is far better than being unable to log in.
  const guestId = req.cookies?.[GUEST_CART_COOKIE] as string | undefined;
  if (guestId) {
    try {
      await mergeGuestCart(String(user._id), guestId);
      res.clearCookie(GUEST_CART_COOKIE, { path: '/' });
    } catch (err) {
      log.error({ err, guestId }, 'Failed to merge guest cart on sign-in');
    }
  }
}

// ── Handlers ────────────────────────────────────────────────────────────────

export const register: RequestHandler = async (req, res) => {
  const input = validatedBody<RegisterInput>(req);
  const user = await authService.register(input);
  await establishSession(req, res, user);

  sendCreated(
    res,
    { user: presentUser(user) },
    'Account created. Check your email to confirm your address.',
  );
};

export const login: RequestHandler = async (req, res) => {
  const { email, password } = validatedBody<LoginInput>(req);
  const user = await authService.login(email, password);
  await establishSession(req, res, user);

  sendSuccess(res, { user: presentUser(user) }, { message: 'Signed in' });
};

/**
 * Rotate the session.
 *
 * The rotation itself (and its reuse detection) lives in the token service; this
 * only moves cookies. Note the new access token is rebuilt from freshly read
 * user data, so a role change or email confirmation takes effect on the next
 * refresh without requiring a full sign-out.
 */
export const refresh: RequestHandler = async (req, res) => {
  const presented = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (!presented) {
    throw AppError.unauthenticated('No session to refresh');
  }

  const { userId, token } = await rotateRefreshToken(presented, requestContext(req));

  const user = await User.findById(userId).select('+tokenVersion');
  if (!user || user.status !== 'active') {
    clearAuthCookies(res);
    throw AppError.unauthenticated('Your session is no longer valid');
  }

  setAccessCookie(
    res,
    signAccessToken({
      sub: String(user._id),
      email: user.email,
      role: user.role,
      tv: user.tokenVersion,
      ev: Boolean(user.emailVerifiedAt),
    }),
  );
  setRefreshCookie(res, token);
  setSessionHintCookie(res);

  sendSuccess(res, { user: presentUser(user) }, { message: 'Session refreshed' });
};

export const logout: RequestHandler = async (req, res) => {
  const presented = req.cookies?.[REFRESH_COOKIE] as string | undefined;
  if (presented) await revokeRefreshToken(presented, 'logout');

  clearAuthCookies(res);
  sendSuccess(res, null, { message: 'Signed out' });
};

/** Sign out on every device — revokes all refresh tokens for the account. */
export const logoutAll: RequestHandler = async (req, res) => {
  if (req.user) {
    await revokeAllUserTokens((await User.findById(req.user.id).select('_id'))!._id, 'logout');
    // Bump the version so existing access tokens die immediately rather than
    // remaining valid until they expire.
    await User.updateOne({ _id: req.user.id }, { $inc: { tokenVersion: 1 } });
  }

  clearAuthCookies(res);
  sendSuccess(res, null, { message: 'Signed out on all devices' });
};

export const me: RequestHandler = async (req, res) => {
  const user = await User.findById(req.user!.id);
  if (!user) throw AppError.notFound('Account');

  sendSuccess(res, { user: presentUser(user) });
};

export const verifyEmail: RequestHandler = async (req, res) => {
  const { token } = validatedBody<{ token: string }>(req);
  const user = await authService.verifyEmail(token);

  sendSuccess(res, { user: presentUser(user) }, { message: 'Email confirmed' });
};

export const resendVerification: RequestHandler = async (req, res) => {
  const { email } = validatedBody<{ email: string }>(req);
  const user = await User.findOne({ email });
  if (user) await authService.sendVerificationEmail(user);

  // Same response whether or not the account exists, to avoid enumeration.
  sendSuccess(res, null, {
    message: 'If that address needs confirming, a new link is on its way.',
  });
};

export const forgotPassword: RequestHandler = async (req, res) => {
  const { email } = validatedBody<ForgotPasswordInput>(req);
  await authService.requestPasswordReset(email);

  sendSuccess(res, null, {
    message: 'If an account exists for that address, a reset link has been sent.',
  });
};

export const resetPassword: RequestHandler = async (req, res) => {
  const { token, password } = validatedBody<ResetPasswordInput>(req);
  await authService.resetPassword(token, password);

  // Deliberately not signed in afterwards: the user should prove they know the
  // new password, and every old session has just been revoked.
  clearAuthCookies(res);
  sendSuccess(res, null, { message: 'Password updated. Please sign in.' });
};

export const changePassword: RequestHandler = async (req, res) => {
  const { currentPassword, newPassword } = validatedBody<ChangePasswordInput>(req);
  await authService.changePassword(req.user!.id, currentPassword, newPassword);

  clearAuthCookies(res);
  sendSuccess(res, null, {
    message: 'Password changed. You have been signed out on all devices.',
  });
};

export const updateProfile: RequestHandler = async (req, res) => {
  const input = validatedBody<UpdateProfileInput>(req);

  const user = await User.findByIdAndUpdate(
    req.user!.id,
    // Only these three fields are writable here. Role, status and email are
    // deliberately excluded — a mass-assignment of `role` would be a complete
    // privilege escalation.
    {
      $set: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.phone !== undefined ? { phone: input.phone } : {}),
        ...(input.marketingOptIn !== undefined ? { marketingOptIn: input.marketingOptIn } : {}),
      },
    },
    { new: true, runValidators: true },
  );

  if (!user) throw AppError.notFound('Account');
  sendSuccess(res, { user: presentUser(user) }, { message: 'Profile updated' });
};

/** Hands the SPA a CSRF token before its first state-changing request. */
export const csrfToken: RequestHandler = (req, res) => {
  sendSuccess(res, { csrfToken: req.cookies?.csrf_token ?? null });
};
