import type { RequestHandler } from 'express';
import { ERROR_CODES, type UserRole } from '@ecom/shared';
import { roleHasPermission, isStaff, type Permission } from '../config/permissions.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../config/logger.js';

const log = createLogger('rbac');

/**
 * Server-side authorization.
 *
 * The frontend also hides admin routes, but that is presentation, not security:
 * anyone can call the API directly with curl. These checks are the only thing
 * that actually enforces authorization, which is why every admin route carries
 * one and why the test suite asserts a 403 for a customer token on *every* admin
 * endpoint rather than a sampled few.
 */

/** Require a specific capability. Prefer this over `requireRole`. */
export function requirePermission(...permissions: Permission[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(AppError.unauthenticated('Please sign in to continue'));

    const granted = permissions.every((permission) =>
      roleHasPermission(req.user!.role, permission),
    );

    if (!granted) {
      log.warn(
        { userId: req.user.id, role: req.user.role, required: permissions, path: req.originalUrl },
        'Permission denied',
      );
      return next(
        AppError.forbidden(
          'You do not have permission to perform this action',
          ERROR_CODES.INSUFFICIENT_PERMISSIONS,
        ),
      );
    }

    next();
  };
}

/** Require any one of several capabilities. */
export function requireAnyPermission(...permissions: Permission[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(AppError.unauthenticated('Please sign in to continue'));

    if (!permissions.some((permission) => roleHasPermission(req.user!.role, permission))) {
      return next(
        AppError.forbidden(
          'You do not have permission to perform this action',
          ERROR_CODES.INSUFFICIENT_PERMISSIONS,
        ),
      );
    }
    next();
  };
}

/**
 * Require a specific role.
 *
 * Reserve this for things that are genuinely about *who someone is* rather than
 * what they can do — the admin panel's entry gate, for instance. Everything
 * else should use `requirePermission`, so adding a role does not mean auditing
 * every route.
 */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.user) return next(AppError.unauthenticated('Please sign in to continue'));
    if (!roles.includes(req.user.role)) {
      return next(
        AppError.forbidden(
          'You do not have access to this area',
          ERROR_CODES.INSUFFICIENT_PERMISSIONS,
        ),
      );
    }
    next();
  };
}

/** Gate for the admin area as a whole. */
export const requireStaff: RequestHandler = (req, _res, next) => {
  if (!req.user) return next(AppError.unauthenticated('Please sign in to continue'));
  if (!isStaff(req.user.role)) {
    return next(
      AppError.forbidden(
        'You do not have access to this area',
        ERROR_CODES.INSUFFICIENT_PERMISSIONS,
      ),
    );
  }
  next();
};

/**
 * Ownership check for customer-scoped resources.
 *
 * A customer's own order is authorised by *ownership*, not by a role — and
 * without this check, `GET /account/orders/:id` would happily serve any order to
 * any signed-in user (an IDOR). Staff bypass it because reading customer orders
 * is their job.
 */
export function isOwnerOrStaff(
  req: { user?: { id: string; role: UserRole } },
  ownerId: string,
): boolean {
  if (!req.user) return false;
  return req.user.id === ownerId || isStaff(req.user.role);
}
