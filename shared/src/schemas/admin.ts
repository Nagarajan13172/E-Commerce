import { z } from 'zod';
import { objectIdSchema } from './common.js';
import { ORDER_STATUSES, REVIEW_STATUSES, USER_ROLES, USER_STATUSES } from '../constants/enums.js';

/**
 * Admin API contracts.
 *
 * Note what admins can and cannot set. Order *status* is a choice; order
 * *totals* are not — an admin adjusts money through a refund, which is recorded,
 * rather than by editing a number on an order.
 */

// ── Analytics ───────────────────────────────────────────────────────────────

export const ANALYTICS_RANGES = [
  'today',
  'yesterday',
  'last_7_days',
  'last_30_days',
  'this_month',
  'last_month',
  'custom',
] as const;
export type AnalyticsRange = (typeof ANALYTICS_RANGES)[number];

export const analyticsQuerySchema = z
  .object({
    range: z.enum(ANALYTICS_RANGES).default('last_30_days'),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((v) => v.range !== 'custom' || (v.from && v.to), {
    message: 'A custom range needs both a start and an end date',
    path: ['from'],
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: 'The start date must be before the end date',
    path: ['from'],
  });
export type AnalyticsQuery = z.infer<typeof analyticsQuerySchema>;

// ── Orders ──────────────────────────────────────────────────────────────────

export const adminOrderQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  paymentStatus: z.string().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  sort: z.enum(['newest', 'oldest', 'total_desc', 'total_asc']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminOrderQuery = z.infer<typeof adminOrderQuerySchema>;

export const updateOrderStatusSchema = z.object({
  status: z.enum(ORDER_STATUSES),
  note: z.string().trim().max(500).optional().or(z.literal('')),
});
export type UpdateOrderStatusInput = z.infer<typeof updateOrderStatusSchema>;

export const updateShippingSchema = z.object({
  provider: z.string().trim().max(80).optional().or(z.literal('')),
  trackingNumber: z.string().trim().max(120).optional().or(z.literal('')),
  trackingUrl: z.url().optional().or(z.literal('')),
  estimatedDeliveryAt: z.coerce.date().optional(),
});
export type UpdateShippingInput = z.infer<typeof updateShippingSchema>;

export const refundOrderSchema = z.object({
  amount: z.number().positive('A refund must be more than zero'),
  reason: z.string().trim().min(3, 'Record why this is being refunded').max(500),
});
export type RefundOrderInput = z.infer<typeof refundOrderSchema>;

export const orderNoteSchema = z.object({
  note: z.string().trim().min(1).max(1000),
});
export type OrderNoteInput = z.infer<typeof orderNoteSchema>;

// ── Customers ───────────────────────────────────────────────────────────────

export const adminCustomerQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  role: z.enum(USER_ROLES).optional(),
  status: z.enum(USER_STATUSES).optional(),
  sort: z.enum(['newest', 'oldest', 'name']).default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminCustomerQuery = z.infer<typeof adminCustomerQuerySchema>;

export const updateCustomerStatusSchema = z.object({
  status: z.enum(USER_STATUSES),
  reason: z.string().trim().max(500).optional().or(z.literal('')),
});
export type UpdateCustomerStatusInput = z.infer<typeof updateCustomerStatusSchema>;

export const updateCustomerRoleSchema = z.object({
  role: z.enum(USER_ROLES),
});
export type UpdateCustomerRoleInput = z.infer<typeof updateCustomerRoleSchema>;

// ── Inventory ───────────────────────────────────────────────────────────────

export const adjustStockSchema = z.object({
  productId: objectIdSchema,
  variantId: objectIdSchema.optional(),
  /** Signed: negative reduces. Absolute values would hide the intent. */
  delta: z
    .number()
    .int()
    .refine((v) => v !== 0, 'An adjustment must change something'),
  note: z.string().trim().max(500).optional().or(z.literal('')),
});
export type AdjustStockInput = z.infer<typeof adjustStockSchema>;

export const inventoryQuerySchema = z.object({
  lowStockOnly: z.stringbool().optional(),
  outOfStockOnly: z.stringbool().optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
export type InventoryQuery = z.infer<typeof inventoryQuerySchema>;

// ── Reviews ─────────────────────────────────────────────────────────────────

export const adminReviewQuerySchema = z.object({
  status: z.enum(REVIEW_STATUSES).optional(),
  reported: z.stringbool().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminReviewQuery = z.infer<typeof adminReviewQuerySchema>;

export const moderateReviewSchema = z.object({
  status: z.enum(['approved', 'rejected']),
  rejectionReason: z.string().trim().max(500).optional().or(z.literal('')),
});
export type ModerateReviewInput = z.infer<typeof moderateReviewSchema>;

export const respondToReviewSchema = z.object({
  text: z.string().trim().min(1, 'Write a response').max(1000),
});
export type RespondToReviewInput = z.infer<typeof respondToReviewSchema>;

// ── Coupons ─────────────────────────────────────────────────────────────────

export const adminCouponQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  active: z.stringbool().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminCouponQuery = z.infer<typeof adminCouponQuerySchema>;

export const createCouponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .min(3)
      .max(32)
      .regex(/^[A-Z0-9_-]+$/, 'Letters, numbers, hyphens and underscores only'),
    description: z.string().trim().max(300).optional().or(z.literal('')),
    type: z.enum(['percentage', 'fixed', 'free_shipping']),
    value: z.number().min(0),
    minOrderValue: z.number().min(0).default(0),
    maxDiscount: z.number().positive().optional(),
    usageLimit: z.number().int().positive().optional(),
    perUserLimit: z.number().int().positive().default(1),
    startsAt: z.coerce.date(),
    expiresAt: z.coerce.date(),
    firstOrderOnly: z.boolean().default(false),
    isActive: z.boolean().default(true),
  })
  .refine((c) => c.expiresAt > c.startsAt, {
    message: 'The end date must be after the start date',
    path: ['expiresAt'],
  })
  .refine((c) => c.type !== 'percentage' || c.value <= 100, {
    message: 'A percentage discount cannot exceed 100%',
    path: ['value'],
  })
  // Without a cap, "50% off" has no ceiling on a large basket.
  .refine((c) => c.type !== 'percentage' || c.maxDiscount !== undefined, {
    message: 'Set a maximum discount so a percentage coupon has a ceiling',
    path: ['maxDiscount'],
  });
export type CreateCouponInput = z.infer<typeof createCouponSchema>;
export type CreateCouponFormValues = z.input<typeof createCouponSchema>;

export const updateCouponSchema = z.object({
  description: z.string().trim().max(300).optional(),
  isActive: z.boolean().optional(),
  expiresAt: z.coerce.date().optional(),
  usageLimit: z.number().int().positive().optional(),
});
export type UpdateCouponInput = z.infer<typeof updateCouponSchema>;
