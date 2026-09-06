import { Router } from 'express';
import {
  changePasswordSchema,
  forgotPasswordSchema,
  loginSchema,
  registerSchema,
  resendVerificationSchema,
  resetPasswordSchema,
  updateProfileSchema,
  verifyEmailSchema,
} from '@ecom/shared';
import * as authController from '../../controllers/auth.controller.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { authLimiter, emailLimiter, writeLimiter } from '../../middleware/rateLimit.js';

const router: Router = Router();

/**
 * Authentication routes.
 *
 * Rate limits are matched to what each endpoint costs an attacker:
 * - `authLimiter` on credential endpoints (brute force).
 * - `emailLimiter` on anything that sends mail (spam amplification — an
 *   unlimited "resend verification" is a free way to mail-bomb someone).
 * - `writeLimiter` on ordinary authenticated writes.
 */

// ── Public ──────────────────────────────────────────────────────────────────
router.post('/register', authLimiter, validate({ body: registerSchema }), authController.register);
router.post('/login', authLimiter, validate({ body: loginSchema }), authController.login);

// No rate limit: the SPA refreshes automatically, and throttling it would log
// out legitimate users. Reuse detection is the real protection here.
router.post('/refresh', authController.refresh);
router.post('/logout', authController.logout);

router.post(
  '/forgot-password',
  emailLimiter,
  validate({ body: forgotPasswordSchema }),
  authController.forgotPassword,
);
router.post(
  '/reset-password',
  authLimiter,
  validate({ body: resetPasswordSchema }),
  authController.resetPassword,
);
router.post('/verify-email', validate({ body: verifyEmailSchema }), authController.verifyEmail);
router.post(
  '/resend-verification',
  emailLimiter,
  validate({ body: resendVerificationSchema }),
  authController.resendVerification,
);

router.get('/csrf', authController.csrfToken);

// ── Authenticated ───────────────────────────────────────────────────────────
router.get('/me', requireAuth, authController.me);
router.post('/logout-all', requireAuth, authController.logoutAll);
router.patch(
  '/profile',
  requireAuth,
  writeLimiter,
  validate({ body: updateProfileSchema }),
  authController.updateProfile,
);
router.post(
  '/change-password',
  requireAuth,
  authLimiter,
  validate({ body: changePasswordSchema }),
  authController.changePassword,
);

export default router;
