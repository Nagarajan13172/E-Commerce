import { Router } from 'express';
import { applyCouponSchema, checkoutQuoteSchema, createOrderSchema } from '@ecom/shared';
import * as checkout from '../../controllers/checkout.controller.js';
import * as order from '../../controllers/order.controller.js';
import { validate } from '../../middleware/validate.js';
import { optionalAuth, requireAuth, requireVerifiedEmail } from '../../middleware/auth.js';
import { attachGuestCart } from '../../middleware/guestCart.js';
import { idempotent } from '../../middleware/idempotency.js';
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

/**
 * Place the order and open a payment.
 *
 * `requireAuth` is applied to this route alone — quoting and coupons stay open
 * to guests, but an order needs an owner.
 *
 * `idempotent` runs before the handler so a double-clicked pay button, or a
 * retry of a request whose response was lost, replays the stored result instead
 * of creating a second order that reserves the same stock again.
 */
router.post(
  '/session',
  requireAuth,
  checkoutLimiter,
  requireVerifiedEmail,
  idempotent,
  validate({ body: createOrderSchema }),
  order.createCheckoutSession,
);

export default router;
