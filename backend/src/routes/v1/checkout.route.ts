import { Router } from 'express';
import { applyCouponSchema, checkoutQuoteSchema } from '@ecom/shared';
import * as checkout from '../../controllers/checkout.controller.js';
import { validate } from '../../middleware/validate.js';
import { optionalAuth, requireVerifiedEmail } from '../../middleware/auth.js';
import { attachGuestCart } from '../../middleware/guestCart.js';
import { checkoutLimiter, writeLimiter } from '../../middleware/rateLimit.js';

const router: Router = Router();

/**
 * Checkout works for guests and signed-in customers alike.
 *
 * `checkoutLimiter` is deliberately strict — from Phase 6 each attempt will
 * reserve inventory, which makes abuse here a denial-of-inventory attack rather
 * than merely wasted CPU.
 */
router.use(optionalAuth);
router.use(attachGuestCart());

router.post(
  '/quote',
  checkoutLimiter,
  requireVerifiedEmail,
  validate({ body: checkoutQuoteSchema }),
  checkout.quote,
);

router.post('/coupon', writeLimiter, validate({ body: applyCouponSchema }), checkout.applyCoupon);
router.delete('/coupon', checkout.removeCoupon);

export default router;
