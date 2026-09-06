import { z } from 'zod';
import { objectIdSchema } from './common.js';
import { CART_LIMITS } from '../constants/limits.js';

/**
 * Cart and wishlist inputs.
 *
 * Note what is absent: **price**. The client never sends an amount, and the
 * server never reads one from a request. Every total is recomputed from the
 * product document, because a cart that trusts a client-supplied price is a cart
 * that can be bought for ₹1.
 */

export const addCartItemSchema = z.object({
  productId: objectIdSchema,
  /** Omitted for a simple product with no variants. */
  variantId: objectIdSchema.optional(),
  quantity: z
    .number()
    .int()
    .min(1)
    .max(CART_LIMITS.MAX_QUANTITY_PER_ITEM, `Limit ${CART_LIMITS.MAX_QUANTITY_PER_ITEM} per item`)
    .default(1),
});
export type AddCartItemInput = z.infer<typeof addCartItemSchema>;

export const updateCartItemSchema = z.object({
  // Zero is a valid quantity here: it means "remove", which lets a quantity
  // stepper reach empty without needing a second endpoint.
  quantity: z.number().int().min(0).max(CART_LIMITS.MAX_QUANTITY_PER_ITEM),
});
export type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;

export const wishlistItemSchema = z.object({
  productId: objectIdSchema,
  variantId: objectIdSchema.optional(),
});
export type WishlistItemInput = z.infer<typeof wishlistItemSchema>;
