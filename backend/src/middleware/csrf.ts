import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from 'express';
import { ERROR_CODES } from '@ecom/shared';
import { env, isProduction } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

/**
 * Double-submit CSRF protection.
 *
 * Auth lives in httpOnly cookies (so XSS cannot steal a token), which means the
 * browser attaches credentials to cross-site requests automatically — the exact
 * condition CSRF exploits. The defence: a token that is readable by our own
 * JavaScript and must be echoed in a header. A cross-origin attacker can cause
 * the cookie to be *sent* but cannot *read* it to populate the header.
 *
 * The token is HMAC-signed, so a forged value cannot be minted client-side.
 */
export const CSRF_COOKIE = 'csrf_token';
export const CSRF_HEADER = 'x-csrf-token';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Paths that legitimately cannot carry a CSRF token. Payment webhooks are
 * server-to-server calls: they send no cookies (so there is no ambient
 * authority to abuse) and are authenticated by HMAC signature instead.
 */
const CSRF_EXEMPT_PREFIXES = ['/webhooks'];

function sign(value: string): string {
  return createHmac('sha256', env.CSRF_SECRET).update(value).digest('base64url');
}

export function issueCsrfToken(): string {
  const nonce = randomBytes(24).toString('base64url');
  return `${nonce}.${sign(nonce)}`;
}

function isValidToken(token: string | undefined): boolean {
  if (!token) return false;
  const [nonce, signature] = token.split('.');
  if (!nonce || !signature) return false;

  const expected = Buffer.from(sign(nonce));
  const actual = Buffer.from(signature);
  // Constant-time compare so the signature cannot be recovered byte by byte.
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

/** Sets the CSRF cookie. Readable by JS on purpose — that is the whole mechanism. */
export const attachCsrfToken: RequestHandler = (req, res, next) => {
  if (!req.cookies?.[CSRF_COOKIE]) {
    res.cookie(CSRF_COOKIE, issueCsrfToken(), {
      httpOnly: false,
      secure: env.COOKIE_SECURE,
      sameSite: isProduction ? 'strict' : 'lax',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    });
  }
  next();
};

/**
 * Enforce the double submit on every state-changing request.
 *
 * Webhooks are exempt and mounted before this middleware: they are
 * server-to-server, carry no cookies, and are authenticated by HMAC signature
 * instead.
 */
export const verifyCsrf: RequestHandler = (req, _res, next) => {
  if (SAFE_METHODS.has(req.method)) return next();
  if (CSRF_EXEMPT_PREFIXES.some((prefix) => req.path.startsWith(prefix))) return next();

  const cookieToken = req.cookies?.[CSRF_COOKIE] as string | undefined;
  const headerToken = req.get(CSRF_HEADER);

  if (!cookieToken || !headerToken || cookieToken !== headerToken || !isValidToken(cookieToken)) {
    return next(
      AppError.forbidden(
        'CSRF validation failed. Refresh the page and try again.',
        ERROR_CODES.CSRF_TOKEN_INVALID,
      ),
    );
  }

  next();
};
