import { z } from 'zod';
import { objectIdSchema } from './common.js';
import { addressSchema } from './address.js';

/**
 * Checkout contracts.
 *
 * Note what the client never sends: a price, a discount, a tax figure or a
 * total. It sends *choices* — which address, which delivery speed, which coupon
 * code — and the server returns what those choices cost. Any amount arriving
 * from a browser is ignored.
 */

export const DELIVERY_METHODS = ['standard', 'express'] as const;
export type DeliveryMethod = (typeof DELIVERY_METHODS)[number];

export const DELIVERY_OPTIONS: Record<
  DeliveryMethod,
  { label: string; description: string; minDays: number; maxDays: number }
> = {
  standard: {
    label: 'Standard delivery',
    description: 'Free on orders over the threshold',
    minDays: 3,
    maxDays: 5,
  },
  express: {
    label: 'Express delivery',
    description: 'Dispatched today, priority handling',
    minDays: 1,
    maxDays: 2,
  },
};

export const applyCouponSchema = z.object({
  code: z
    .string()
    .trim()
    .toUpperCase()
    .min(3, 'Enter a coupon code')
    .max(32)
    .regex(/^[A-Z0-9_-]+$/, 'Coupon codes contain letters, numbers, hyphens and underscores'),
});
export type ApplyCouponInput = z.infer<typeof applyCouponSchema>;

/**
 * A price quote for the current cart.
 *
 * Every field is optional because the quote is requested repeatedly as the
 * customer moves through checkout — before an address is chosen, the totals
 * still need computing so the summary is never blank.
 */
export const checkoutQuoteSchema = z.object({
  addressId: objectIdSchema.optional(),
  /** For guests, or a signed-in customer entering a one-off address. */
  address: addressSchema.optional(),
  deliveryMethod: z.enum(DELIVERY_METHODS).default('standard'),
});
export type CheckoutQuoteInput = z.infer<typeof checkoutQuoteSchema>;
export type CheckoutQuoteFormValues = z.input<typeof checkoutQuoteSchema>;

/** Why a coupon was refused — the UI maps these to specific guidance. */
export const COUPON_REJECTIONS = [
  'not_found',
  'inactive',
  'not_started',
  'expired',
  'min_order_not_met',
  'usage_limit_reached',
  'per_user_limit_reached',
  'not_applicable',
  'first_order_only',
] as const;
export type CouponRejection = (typeof COUPON_REJECTIONS)[number];
