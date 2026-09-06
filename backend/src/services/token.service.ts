import { randomUUID } from 'node:crypto';
import jwt from 'jsonwebtoken';
import type { ClientSession, Types } from 'mongoose';
import { ERROR_CODES, type UserRole } from '@ecom/shared';
import { env } from '../config/env.js';
import { createLogger } from '../config/logger.js';
import { RefreshToken } from '../models/refreshToken.model.js';
import { AppError } from '../utils/AppError.js';
import { generateToken, hashToken } from '../utils/hash.js';

const log = createLogger('token');

export interface AccessTokenClaims {
  sub: string;
  email: string;
  role: UserRole;
  /** Mirrors `User.tokenVersion`; a mismatch means this token was revoked. */
  tv: number;
  ev: boolean;
}

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  family: string;
}

interface TokenContext {
  userAgent?: string;
  ip?: string;
}

/**
 * Access tokens (stateless JWT) and refresh tokens (stateful, opaque, rotating).
 *
 * The two halves are deliberately different mechanisms:
 *
 * - The **access token** is a short-lived JWT so the common case — authorising a
 *   request — costs a signature check and no database round trip.
 * - The **refresh token** is a random opaque value stored hashed, because the
 *   long-lived credential is the one that actually needs to be revocable.
 */
export function signAccessToken(claims: AccessTokenClaims): string {
  return jwt.sign(claims, env.JWT_SECRET, {
    expiresIn: env.ACCESS_TOKEN_TTL as jwt.SignOptions['expiresIn'],
    issuer: 'aurora-api',
    audience: 'aurora-web',
  });
}

export function verifyAccessToken(token: string): AccessTokenClaims {
  // Throws TokenExpiredError / JsonWebTokenError, which the central error
  // handler already maps to 401 with a specific code.
  return jwt.verify(token, env.JWT_SECRET, {
    issuer: 'aurora-api',
    audience: 'aurora-web',
  }) as AccessTokenClaims;
}

function refreshExpiryDate(): Date {
  return new Date(Date.now() + env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Start a new token family. Called on login and registration — one family per
 * sign-in, so revoking a family logs out exactly one device.
 */
export async function issueRefreshToken(
  userId: Types.ObjectId,
  context: TokenContext = {},
  session?: ClientSession,
): Promise<{ token: string; family: string }> {
  const token = generateToken();
  const family = randomUUID();

  await RefreshToken.create(
    [
      {
        user: userId,
        tokenHash: hashToken(token),
        family,
        expiresAt: refreshExpiryDate(),
        userAgent: context.userAgent,
        ip: context.ip,
      },
    ],
    session ? { session } : {},
  );

  return { token, family };
}

/**
 * Rotate a refresh token, with reuse detection.
 *
 * The security property this provides: a stolen refresh token can be used at
 * most once before the theft becomes detectable. When a token that was already
 * rotated is presented, either the real client replayed it or an attacker is
 * using a copy — and since the two are indistinguishable, the only safe response
 * is to revoke the whole family and force a fresh login.
 *
 * That is the entire reason refresh tokens are stored rather than being JWTs: a
 * stateless refresh token cannot detect its own reuse.
 */
export async function rotateRefreshToken(
  presentedToken: string,
  context: TokenContext = {},
): Promise<{ userId: Types.ObjectId; token: string; family: string }> {
  const tokenHash = hashToken(presentedToken);
  const existing = await RefreshToken.findOne({ tokenHash });

  if (!existing) {
    throw AppError.unauthenticated('Invalid session', ERROR_CODES.TOKEN_INVALID);
  }

  // ── Reuse detection ──────────────────────────────────────────────────────
  if (existing.revokedAt) {
    log.warn(
      { userId: String(existing.user), family: existing.family },
      'Refresh token reuse detected — revoking entire family',
    );
    await revokeFamily(existing.user, existing.family, 'reuse_detected');
    throw AppError.unauthenticated(
      'Your session was ended for security reasons. Please sign in again.',
      ERROR_CODES.REFRESH_TOKEN_REUSED,
    );
  }

  if (existing.expiresAt.getTime() < Date.now()) {
    throw AppError.unauthenticated('Your session has expired', ERROR_CODES.TOKEN_EXPIRED);
  }

  // ── Rotate: issue the successor, then retire the presented token ──────────
  const nextToken = generateToken();
  const nextHash = hashToken(nextToken);

  await RefreshToken.create({
    user: existing.user,
    tokenHash: nextHash,
    // Same family: this is the same sign-in, one step along its chain.
    family: existing.family,
    expiresAt: refreshExpiryDate(),
    userAgent: context.userAgent ?? existing.userAgent,
    ip: context.ip ?? existing.ip,
  });

  existing.revokedAt = new Date();
  existing.reasonRevoked = 'rotated';
  existing.replacedByHash = nextHash;
  await existing.save();

  return { userId: existing.user, token: nextToken, family: existing.family };
}

/** Revoke a single token — used on an explicit logout of one device. */
export async function revokeRefreshToken(
  token: string,
  reason: 'logout' | 'admin_revoked' = 'logout',
): Promise<void> {
  await RefreshToken.updateOne(
    { tokenHash: hashToken(token), revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), reasonRevoked: reason } },
  );
}

/** Revoke one sign-in chain. */
export async function revokeFamily(
  userId: Types.ObjectId,
  family: string,
  reason: 'reuse_detected' | 'logout' | 'password_changed' | 'admin_revoked',
): Promise<void> {
  await RefreshToken.updateMany(
    { user: userId, family, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), reasonRevoked: reason } },
  );
}

/**
 * Revoke every session for a user — "sign out everywhere".
 *
 * Note this only stops *refresh*. Access tokens are stateless and stay valid
 * until they expire, so callers must also bump `User.tokenVersion`, which is
 * what makes revocation immediate rather than delayed by up to 15 minutes.
 */
export async function revokeAllUserTokens(
  userId: Types.ObjectId,
  reason: 'password_changed' | 'admin_revoked' | 'logout',
  session?: ClientSession,
): Promise<void> {
  await RefreshToken.updateMany(
    { user: userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), reasonRevoked: reason } },
    session ? { session } : {},
  );
}
