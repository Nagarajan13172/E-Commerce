import type { RequestHandler } from 'express';
import { Types } from 'mongoose';
import {
  ERROR_CODES,
  type CancelOrderInput,
  type CreateOrderInput,
  type OrderListQuery,
  type SimulatePaymentInput,
  type VerifyPaymentInput,
} from '@ecom/shared';
import { Order } from '../models/order.model.js';
import { Payment } from '../models/payment.model.js';
import * as orderService from './../services/order.service.js';
import * as paymentService from '../services/payment.service.js';
import * as checkoutService from '../services/checkout.service.js';
import { getMockProvider } from '../integrations/payments/index.js';
import { isCustomerCancellable } from '../services/orderStateMachine.js';
import { validatedBody, validatedParams, validatedQuery } from '../middleware/validate.js';
import { buildPaginationMeta, sendCreated, sendSuccess } from '../utils/apiResponse.js';
import { AppError } from '../utils/AppError.js';
import { env } from '../config/env.js';

/**
 * Checkout session: create the order, hold the stock, open a payment.
 *
 * Guarded by the idempotency middleware, so a double-clicked pay button or a
 * retried request cannot produce two orders holding stock twice.
 */
export const createCheckoutSession: RequestHandler = async (req, res) => {
  const input = validatedBody<CreateOrderInput>(req);
  const userId = req.user!.id;

  // Priced fresh, from the database. The client sends choices, never amounts.
  const quote = await checkoutService.quote(
    { userId },
    {
      deliveryMethod: input.deliveryMethod,
      ...(input.addressId ? { addressId: input.addressId } : {}),
    },
  );

  if (!quote.shippingAddress) {
    throw AppError.unprocessable('Choose a delivery address first', ERROR_CODES.INVALID_INPUT);
  }

  const order = await orderService.createOrder({
    userId,
    email: req.user!.email,
    quote,
    shippingAddress: quote.shippingAddress,
    customerNote: input.customerNote || undefined,
    idempotencyKey: req.get('idempotency-key'),
  });

  // Outside the order transaction on purpose — an external call cannot be
  // rolled back, and holding a transaction open across a network round trip
  // would keep document locks for its duration.
  const payment = await paymentService.createPaymentForOrder(order);

  sendCreated(
    res,
    {
      order: {
        id: String(order._id),
        orderNumber: order.orderNumber,
        total: order.pricing.grandTotal,
      },
      payment: {
        providerOrderId: payment.providerOrderId,
        // The publishable key only. The secret never leaves the server.
        keyId: payment.keyId,
        amount: payment.amountMinor,
        currency: payment.currency,
        provider: env.PAYMENT_PROVIDER,
      },
    },
    'Order created. Complete payment to confirm it.',
  );
};

/** Verify the signature the checkout returned, then confirm the order. */
export const verifyPayment: RequestHandler = async (req, res) => {
  const input = validatedBody<VerifyPaymentInput>(req);
  const order = await paymentService.verifyPayment(input);

  sendSuccess(
    res,
    { order: { id: String(order._id), orderNumber: order.orderNumber, status: order.status } },
    { message: 'Payment confirmed' },
  );
};

/**
 * Provider webhook.
 *
 * Always answers 200 for a duplicate. A provider that receives an error retries
 * with backoff, so returning a failure for an event we have already handled
 * would produce an escalating retry storm for no reason.
 */
export const paymentWebhook: RequestHandler = async (req, res) => {
  const signature = req.get('x-webhook-signature') ?? req.get('x-razorpay-signature') ?? '';

  const result = await paymentService.handleWebhook(req.rawBody ?? Buffer.alloc(0), signature);

  res.status(200).json({
    success: true,
    data: { received: true, duplicate: result.duplicate, eventType: result.eventType },
  });
};

/**
 * Dev-only: drive the mock provider through a payment.
 *
 * Stands in for the hosted checkout page a real provider would show. Refused
 * outright unless the mock provider is active, so it can never be reached in a
 * deployment taking real money.
 */
export const simulatePayment: RequestHandler = async (req, res) => {
  const mock = getMockProvider();
  if (!mock || env.PAYMENT_PROVIDER !== 'mock') {
    throw AppError.forbidden('Payment simulation is only available with the mock provider');
  }

  const input = validatedBody<SimulatePaymentInput>(req);
  const payment = await Payment.findOne({ providerOrderId: input.providerOrderId });
  if (!payment) throw AppError.notFound('Payment');

  const providerPaymentId = `mock_pay_${new Types.ObjectId().toString()}`;

  if (input.outcome === 'failure') {
    await orderService.failPayment({
      providerOrderId: input.providerOrderId,
      reason: 'Simulated payment failure',
    });
    return sendSuccess(res, { outcome: 'failure' }, { message: 'Payment failed' });
  }

  // A real signature over the real secret, so the verification path is
  // genuinely exercised rather than bypassed.
  const signature = mock.signPayment(input.providerOrderId, providerPaymentId);

  sendSuccess(res, {
    outcome: 'success',
    providerOrderId: input.providerOrderId,
    providerPaymentId,
    signature,
    webhook: input.sendWebhook
      ? mock.buildWebhook({
          event: 'payment.captured',
          providerOrderId: input.providerOrderId,
          providerPaymentId,
          amount: payment.amount,
        })
      : undefined,
  });
};

// ── Customer order views ────────────────────────────────────────────────────

export const listMyOrders: RequestHandler = async (req, res) => {
  const query = validatedQuery<OrderListQuery>(req);
  const filter: Record<string, unknown> = { user: req.user!.id };
  if (query.status) filter.status = query.status;

  const [items, total] = await Promise.all([
    Order.find(filter)
      .select('orderNumber status paymentStatus pricing items shipping createdAt placedAt')
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    Order.countDocuments(filter),
  ]);

  sendSuccess(res, { items }, { meta: buildPaginationMeta(query.page, query.limit, total) });
};

/**
 * A single order.
 *
 * Looked up by order number AND user, so an order belonging to someone else
 * resolves to nothing — a lookup by number alone would be an IDOR, and order
 * numbers are sequential and therefore trivially guessable.
 */
export const getMyOrder: RequestHandler = async (req, res) => {
  const { orderNumber } = validatedParams<{ orderNumber: string }>(req);

  const order = await Order.findOne({ orderNumber, user: req.user!.id }).lean();
  if (!order) throw AppError.notFound('Order', ERROR_CODES.ORDER_NOT_FOUND);

  sendSuccess(res, { order });
};

export const cancelMyOrder: RequestHandler = async (req, res) => {
  const { orderNumber } = validatedParams<{ orderNumber: string }>(req);
  const { reason } = validatedBody<CancelOrderInput>(req);

  const order = await Order.findOne({ orderNumber, user: req.user!.id });
  if (!order) throw AppError.notFound('Order', ERROR_CODES.ORDER_NOT_FOUND);

  // Customers may cancel only before the warehouse acts; staff can go further.
  if (!isCustomerCancellable(order.status)) {
    throw AppError.conflict(
      'This order has already been prepared for dispatch and can no longer be cancelled. Contact support to arrange a return.',
      ERROR_CODES.ORDER_NOT_CANCELLABLE,
    );
  }

  const cancelled = await orderService.transition(String(order._id), 'cancelled', {
    actorId: req.user!.id,
    actorType: 'customer',
    note: reason,
  });

  sendSuccess(res, { order: cancelled }, { message: 'Order cancelled' });
};
