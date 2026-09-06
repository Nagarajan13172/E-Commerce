import { AUTH_LIMITS, ERROR_CODES, type RegisterInput } from '@ecom/shared';
import { User, type UserDocument } from '../models/user.model.js';
import { VerificationToken } from '../models/verificationToken.model.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../config/logger.js';
import {
  burnPasswordVerification,
  generateToken,
  hashPassword,
  hashToken,
  verifyPassword,
} from '../utils/hash.js';
import { revokeAllUserTokens } from './token.service.js';
import { emailProvider } from '../integrations/email/index.js';
import {
  passwordChangedTemplate,
  passwordResetTemplate,
  verifyEmailTemplate,
  welcomeTemplate,
} from '../integrations/email/templates/auth.templates.js';
import { eventBus } from '../events/bus.js';

const log = createLogger('auth');

/**
 * Authentication business logic.
 *
 * Controllers below this handle HTTP only; every rule about who may sign in, and
 * what happens when they cannot, lives here.
 */

// ── Registration ────────────────────────────────────────────────────────────

export async function register(input: RegisterInput): Promise<UserDocument> {
  const existing = await User.findOne({ email: input.email }).select('_id').lean();
  if (existing) {
    throw AppError.conflict(
      'An account with this email already exists',
      ERROR_CODES.EMAIL_ALREADY_REGISTERED,
    );
  }

  const user = await User.create({
    name: input.name,
    email: input.email,
    passwordHash: await hashPassword(input.password),
    phone: input.phone,
    marketingOptIn: input.marketingOptIn,
    // Roles are never accepted from client input — that would be a trivial
    // privilege escalation. New accounts are always customers; promotion is an
    // explicit admin action.
    role: 'customer',
  });

  await sendVerificationEmail(user);
  eventBus.emit('user.registered', {
    userId: String(user._id),
    email: user.email,
    name: user.name,
  });

  return user;
}

// ── Login ───────────────────────────────────────────────────────────────────

/**
 * Verify credentials.
 *
 * Two things are deliberate here:
 *
 * 1. **One error message for every failure.** "No such account", "wrong
 *    password" and "disabled account" all return the same message. Distinct
 *    messages would let anyone enumerate which email addresses have accounts.
 *
 * 2. **Constant work regardless of outcome.** When the email does not exist we
 *    still burn an argon2 verification. Skipping it would make "unknown email"
 *    return in ~1ms and "wrong password" in ~50ms — a timing side channel that
 *    reveals exactly what the error message refuses to.
 */
export async function login(email: string, password: string): Promise<UserDocument> {
  const user = await User.findOne({ email }).select(
    '+passwordHash +tokenVersion +failedLoginAttempts +lockedUntil',
  );

  if (!user) {
    await burnPasswordVerification();
    throw AppError.unauthenticated('Invalid email or password', ERROR_CODES.INVALID_CREDENTIALS);
  }

  if (user.isLocked()) {
    const minutes = Math.ceil(((user.lockedUntil?.getTime() ?? 0) - Date.now()) / 60_000);
    throw AppError.forbidden(
      `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
      ERROR_CODES.ACCOUNT_LOCKED,
    );
  }

  const passwordValid = await verifyPassword(user.passwordHash, password);

  if (!passwordValid) {
    await recordFailedLogin(user);
    throw AppError.unauthenticated('Invalid email or password', ERROR_CODES.INVALID_CREDENTIALS);
  }

  // Checked only after the password is verified, so a valid-looking error
  // cannot reveal that an address belongs to a suspended account.
  if (user.status !== 'active') {
    throw AppError.forbidden(
      'This account has been disabled. Please contact support.',
      ERROR_CODES.ACCOUNT_DISABLED,
    );
  }

  if (user.failedLoginAttempts > 0 || user.lockedUntil) {
    user.failedLoginAttempts = 0;
    user.lockedUntil = undefined;
  }
  user.lastLoginAt = new Date();
  await user.save();

  return user;
}

/**
 * Per-account lockout, complementing the per-IP rate limiter.
 *
 * The rate limiter stops one IP hammering many accounts; this stops a
 * distributed attack grinding one account from many IPs. Both are needed.
 */
async function recordFailedLogin(user: UserDocument): Promise<void> {
  user.failedLoginAttempts += 1;

  if (user.failedLoginAttempts >= AUTH_LIMITS.MAX_LOGIN_ATTEMPTS) {
    user.lockedUntil = new Date(Date.now() + AUTH_LIMITS.LOCK_DURATION_MINUTES * 60_000);
    user.failedLoginAttempts = 0;
    log.warn({ userId: String(user._id) }, 'Account locked after repeated failed logins');
  }

  await user.save();
}

// ── Email verification ──────────────────────────────────────────────────────

export async function sendVerificationEmail(user: UserDocument): Promise<void> {
  if (user.emailVerifiedAt) return;

  // Invalidate any outstanding link, so only the newest email works.
  await VerificationToken.updateMany(
    { user: user._id, purpose: 'email_verification', usedAt: { $exists: false } },
    { $set: { usedAt: new Date() } },
  );

  const token = generateToken();
  await VerificationToken.create({
    user: user._id,
    tokenHash: hashToken(token),
    purpose: 'email_verification',
    expiresAt: new Date(Date.now() + AUTH_LIMITS.VERIFY_TOKEN_TTL_HOURS * 60 * 60 * 1000),
  });

  await emailProvider.send(verifyEmailTemplate({ to: user.email, name: user.name, token }));
}

export async function verifyEmail(token: string): Promise<UserDocument> {
  const record = await VerificationToken.findOne({
    tokenHash: hashToken(token),
    purpose: 'email_verification',
  });

  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    throw AppError.badRequest(
      'This verification link is invalid or has expired. Request a new one.',
      ERROR_CODES.TOKEN_INVALID,
    );
  }

  const user = await User.findById(record.user);
  if (!user) throw AppError.notFound('Account');

  // Single-use: marked before anything else so a replay cannot succeed.
  record.usedAt = new Date();
  await record.save();

  if (!user.emailVerifiedAt) {
    user.emailVerifiedAt = new Date();
    await user.save();
    await emailProvider.send(welcomeTemplate({ to: user.email, name: user.name }));
    eventBus.emit('user.verified', {
      userId: String(user._id),
      email: user.email,
      name: user.name,
    });
  }

  return user;
}

// ── Password reset ──────────────────────────────────────────────────────────

/**
 * Begin a password reset.
 *
 * Returns silently for unknown addresses. Reporting "no account with that email"
 * would turn this endpoint into an account enumeration oracle, so the caller
 * always shows the same "check your inbox" message either way.
 */
export async function requestPasswordReset(email: string): Promise<void> {
  const user = await User.findOne({ email });
  if (!user || user.status !== 'active') {
    log.debug({ email }, 'Password reset requested for unknown or inactive account');
    return;
  }

  await VerificationToken.updateMany(
    { user: user._id, purpose: 'password_reset', usedAt: { $exists: false } },
    { $set: { usedAt: new Date() } },
  );

  const token = generateToken();
  await VerificationToken.create({
    user: user._id,
    tokenHash: hashToken(token),
    purpose: 'password_reset',
    expiresAt: new Date(Date.now() + AUTH_LIMITS.RESET_TOKEN_TTL_MINUTES * 60_000),
  });

  await emailProvider.send(passwordResetTemplate({ to: user.email, name: user.name, token }));
}

export async function resetPassword(token: string, newPassword: string): Promise<UserDocument> {
  const record = await VerificationToken.findOne({
    tokenHash: hashToken(token),
    purpose: 'password_reset',
  });

  if (!record || record.usedAt || record.expiresAt.getTime() < Date.now()) {
    throw AppError.badRequest(
      'This reset link is invalid or has expired. Request a new one.',
      ERROR_CODES.TOKEN_INVALID,
    );
  }

  const user = await User.findById(record.user).select('+passwordHash +tokenVersion');
  if (!user) throw AppError.notFound('Account');

  record.usedAt = new Date();
  await record.save();

  await applyNewPassword(user, newPassword);
  return user;
}

export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<void> {
  const user = await User.findById(userId).select('+passwordHash +tokenVersion');
  if (!user) throw AppError.notFound('Account');

  if (!(await verifyPassword(user.passwordHash, currentPassword))) {
    throw AppError.unauthenticated(
      'Your current password is incorrect',
      ERROR_CODES.INVALID_CREDENTIALS,
    );
  }

  await applyNewPassword(user, newPassword);
}

/**
 * Set a new password and terminate every existing session.
 *
 * Both halves of the revocation matter and neither is sufficient alone:
 * - Revoking refresh tokens stops sessions being *extended*.
 * - Bumping `tokenVersion` invalidates access tokens already issued, which are
 *   stateless and would otherwise stay usable for up to their full 15 minutes.
 *
 * Someone changing their password because they suspect a compromise expects the
 * attacker to be logged out *now*, not a quarter of an hour from now.
 */
async function applyNewPassword(user: UserDocument, newPassword: string): Promise<void> {
  user.passwordHash = await hashPassword(newPassword);
  user.tokenVersion += 1;
  user.failedLoginAttempts = 0;
  user.lockedUntil = undefined;
  await user.save();

  await revokeAllUserTokens(user._id, 'password_changed');

  await emailProvider.send(passwordChangedTemplate({ to: user.email, name: user.name }));
  eventBus.emit('user.password_changed', {
    userId: String(user._id),
    email: user.email,
    name: user.name,
  });
}
