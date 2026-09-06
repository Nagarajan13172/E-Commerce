import { Router } from 'express';
import { z } from 'zod';
import {
  addressSchema,
  idParamSchema,
  objectIdSchema,
  updateAddressSchema,
  wishlistItemSchema,
} from '@ecom/shared';
import * as account from '../../controllers/account.controller.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { writeLimiter } from '../../middleware/rateLimit.js';

const router: Router = Router();

/** Everything here is scoped to the signed-in user; nothing takes a user id. */
router.use(requireAuth);

// ── Addresses ───────────────────────────────────────────────────────────────
router.get('/addresses', account.listAddresses);
router.post('/addresses', writeLimiter, validate({ body: addressSchema }), account.addAddress);
router.patch(
  '/addresses/:id',
  validate({ params: idParamSchema, body: updateAddressSchema }),
  account.updateAddress,
);
router.delete('/addresses/:id', validate({ params: idParamSchema }), account.deleteAddress);
router.post(
  '/addresses/:id/default',
  validate({ params: idParamSchema }),
  account.setDefaultAddress,
);

// ── Wishlist ────────────────────────────────────────────────────────────────
router.get('/wishlist', account.getWishlist);
// Ids only, so a listing page can render heart states without loading products.
router.get('/wishlist/ids', account.getWishlistIds);
router.post(
  '/wishlist',
  writeLimiter,
  validate({ body: wishlistItemSchema }),
  account.addToWishlist,
);
router.delete(
  '/wishlist/:productId',
  validate({ params: z.object({ productId: objectIdSchema }) }),
  account.removeFromWishlist,
);

export default router;
