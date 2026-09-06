import { Router } from 'express';
import { z } from 'zod';
import { addCartItemSchema, objectIdSchema, updateCartItemSchema } from '@ecom/shared';
import * as cartController from '../../controllers/cart.controller.js';
import { validate } from '../../middleware/validate.js';
import { optionalAuth } from '../../middleware/auth.js';
import { attachGuestCart } from '../../middleware/guestCart.js';
import { writeLimiter } from '../../middleware/rateLimit.js';

const router: Router = Router();

const itemParamSchema = z.object({ itemId: objectIdSchema });

/**
 * Cart routes work for guests and signed-in customers alike.
 *
 * `optionalAuth` resolves a session if one exists; `attachGuestCart` supplies a
 * cookie identity otherwise. Writes create that cookie on demand, reads do not —
 * so browsing does not mint a cart row per crawler request.
 */
router.use(optionalAuth);

router.get('/', attachGuestCart(), cartController.getCart);
router.post(
  '/items',
  attachGuestCart({ create: true }),
  writeLimiter,
  validate({ body: addCartItemSchema }),
  cartController.addItem,
);
router.patch(
  '/items/:itemId',
  attachGuestCart(),
  validate({ params: itemParamSchema, body: updateCartItemSchema }),
  cartController.updateItem,
);
router.delete(
  '/items/:itemId',
  attachGuestCart(),
  validate({ params: itemParamSchema }),
  cartController.removeItem,
);
router.delete('/', attachGuestCart(), cartController.clearCart);

export default router;
