import { z } from 'zod';
import { objectIdSchema } from './common.js';
import { addressSchema } from './address.js';
import { DELIVERY_METHODS } from './checkout.js';

/** Place an order. Note the total is absent — the server computes it. */
export const createOrderSchema = z.object({
  addressId: objectIdSchema.optional(),
  address: addressSchema.optional(),
  deliveryMethod: z.enum(DELIVERY_METHODS).default('standard'),
  customerNote: z.string().trim().max(500).optional().or(z.literal('')),
});
export type CreateOrderInput = z.infer<typeof createOrderSchema>;

/** Payload the checkout hands back after a successful payment. */
export const verifyPaymentSchema = z.object({
  providerOrderId: z.string().min(4).max(120),
  providerPaymentId: z.string().min(4).max(120),
  signature: z.string().min(16).max(256),
});
export type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;

export const cancelOrderSchema = z.object({
  reason: z.string().trim().min(3, 'Tell us why you are cancelling').max(500),
});
export type CancelOrderInput = z.infer<typeof cancelOrderSchema>;

export const orderListQuerySchema = z.object({
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;

/** Dev-only: drive the mock provider through a payment outcome. */
export const simulatePaymentSchema = z.object({
  providerOrderId: z.string().min(4).max(120),
  outcome: z.enum(['success', 'failure']).default('success'),
  /** Also deliver a webhook, to exercise the idempotent path. */
  sendWebhook: z.boolean().default(true),
  /** Deliver it twice, to prove deduplication works. */
  duplicateWebhook: z.boolean().default(false),
});
export type SimulatePaymentInput = z.infer<typeof simulatePaymentSchema>;
