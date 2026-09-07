import { createHash } from 'node:crypto';
import { ERROR_CODES } from '@ecom/shared';
import { Payment, type PaymentDocument } from '../models/payment.model.js';
import { Order } from '../models/order.model.js';
import { WebhookEvent } from '../models/webhookEvent.model.js';
import { paymentProvider } from '../integrations/payments/index.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../config/logger.js';
import { env } from '../config/env.js';
import * as orderService from './order.service.js';
import type { OrderDocument } from '../models/order.model.js';

const log = createLogger('payment');

/**
 * Payment orchestration.
 *
 * The provider is reached only through the `PaymentProvider` interface, so this
 * file contains no Razorpay-specific (or mock-specific) knowledge.
 */

/** Create the provider order the browser checkout will pay against. */
export async function createPaymentForOrder(order: OrderDocument): Promise<{
  payment: PaymentDocument;
  providerOrderId: string;
  keyId: string;
  amountMinor: number;
  currency: string;
}> {
  const providerOrder = await paymentProvider.createOrder({
    amount: order.pricing.grandTotal,
    currency: order.pricing.currency,
    receipt: order.orderNumber,
    notes: { orderId: String(order._id), orderNumber: order.orderNumber },
  });

  const payment = await Payment.create({
    order: order._id,
    user: order.user,
    provider: paymentProvider.name,
    providerOrderId: providerOrder.providerOrderId,
    // The amount is taken from the ORDER, never from a request — this is the
    // figure that will be charged.
    amount: order.pricing.grandTotal,
    currency: order.pricing.currency,
    status: 'created',
  });

  await Order.updateOne({ _id: order._id }, { $set: { paymentStatus: 'pending' } });

  return {
    payment,
    providerOrderId: providerOrder.providerOrderId,
    keyId: providerOrder.keyId,
    amountMinor: providerOrder.amount,
    currency: providerOrder.currency,
  };
}

/**
 * Verify the signature the browser hands back, then confirm.
 *
 * The signature is the whole security control here: without checking it, any
 * client could POST a made-up payment id and mark its own order paid.
 */
export async function verifyPayment(input: {
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
}): Promise<OrderDocument> {
  const valid = paymentProvider.verifyPaymentSignature(input);

  if (!valid) {
    log.warn({ providerOrderId: input.providerOrderId }, 'Rejected an invalid payment signature');
    await Payment.updateOne(
      { providerOrderId: input.providerOrderId },
      { $set: { failureReason: 'Signature verification failed' } },
    );
    throw AppError.unprocessable(
      'We could not verify that payment. You have not been charged.',
      ERROR_CODES.PAYMENT_SIGNATURE_INVALID,
    );
  }

  const result = await orderService.confirmPayment({
    providerOrderId: input.providerOrderId,
    providerPaymentId: input.providerPaymentId,
  });

  if (!result) throw AppError.notFound('Payment', ERROR_CODES.ORDER_NOT_FOUND);
  return result.order;
}

/**
 * Handle a provider webhook.
 *
 * Providers guarantee *at-least-once* delivery, so duplicates are normal
 * operation rather than an edge case. Deduplication is done by inserting the
 * event id first: the unique index means a repeat insert throws, and we return
 * without touching anything. Check-then-act would leave a race window between
 * the check and the work; insert-then-act does not.
 */
export async function handleWebhook(
  rawBody: Buffer,
  signature: string,
): Promise<{
  handled: boolean;
  duplicate: boolean;
  eventType?: string;
}> {
  if (!paymentProvider.verifyWebhookSignature(rawBody, signature)) {
    log.warn('Rejected a webhook with an invalid signature');
    throw AppError.forbidden('Invalid webhook signature', ERROR_CODES.PAYMENT_SIGNATURE_INVALID);
  }

  const event = paymentProvider.parseWebhook(rawBody);

  try {
    await WebhookEvent.create({
      provider: paymentProvider.name,
      eventId: event.eventId,
      eventType: event.type,
      payloadHash: createHash('sha256').update(rawBody).digest('hex'),
      status: 'received',
    });
  } catch (err) {
    // Duplicate key: this delivery has already been seen and processed.
    if ((err as { code?: number }).code === 11000) {
      log.debug({ eventId: event.eventId }, 'Duplicate webhook ignored');
      return { handled: false, duplicate: true, eventType: event.type };
    }
    throw err;
  }

  try {
    if (event.status === 'paid' && event.providerOrderId) {
      const result = await orderService.confirmPayment({
        providerOrderId: event.providerOrderId,
        providerPaymentId: event.providerPaymentId,
        method: event.method,
        amount: event.amount,
      });

      await WebhookEvent.updateOne(
        { provider: paymentProvider.name, eventId: event.eventId },
        {
          $set: {
            status: 'processed',
            processedAt: new Date(),
            relatedOrder: result?.order._id,
          },
        },
      );
    } else if (event.status === 'failed' && event.providerOrderId) {
      await orderService.failPayment({
        providerOrderId: event.providerOrderId,
        reason: `Provider reported ${event.type}`,
      });
      await WebhookEvent.updateOne(
        { provider: paymentProvider.name, eventId: event.eventId },
        { $set: { status: 'processed', processedAt: new Date() } },
      );
    } else {
      await WebhookEvent.updateOne(
        { provider: paymentProvider.name, eventId: event.eventId },
        { $set: { status: 'ignored', processedAt: new Date() } },
      );
    }

    return { handled: true, duplicate: false, eventType: event.type };
  } catch (err) {
    // Recorded as failed so the delivery can be investigated and replayed
    // rather than disappearing.
    await WebhookEvent.updateOne(
      { provider: paymentProvider.name, eventId: event.eventId },
      { $set: { status: 'failed', error: err instanceof Error ? err.message : 'Unknown error' } },
    );
    throw err;
  }
}

/** Refund a paid order, in full or in part. */
export async function refundPayment(params: {
  orderId: string;
  amount: number;
  reason: string;
  actorId: string;
}): Promise<OrderDocument> {
  const order = await Order.findById(params.orderId);
  if (!order) throw AppError.notFound('Order', ERROR_CODES.ORDER_NOT_FOUND);

  const payment = await Payment.findOne({
    order: order._id,
    status: { $in: ['paid', 'partially_refunded'] },
  });
  if (!payment?.providerPaymentId) {
    throw AppError.unprocessable(
      'This order has no captured payment to refund',
      ERROR_CODES.REFUND_FAILED,
    );
  }

  const refundable = payment.amount - payment.amountRefunded;
  if (params.amount > refundable) {
    throw AppError.unprocessable(
      `Only ${refundable} remains refundable on this payment`,
      ERROR_CODES.REFUND_FAILED,
    );
  }

  const refund = await paymentProvider.refund({
    providerPaymentId: payment.providerPaymentId,
    amount: params.amount,
    notes: { orderNumber: order.orderNumber, reason: params.reason },
  });

  payment.amountRefunded += params.amount;
  payment.providerRefundIds.push(refund.refundId);
  payment.status = payment.amountRefunded >= payment.amount ? 'refunded' : 'partially_refunded';
  await payment.save();

  order.refunds.push({
    amount: params.amount,
    reason: params.reason,
    payment: payment._id,
    at: new Date(),
  });
  order.refundedTotal += params.amount;
  order.paymentStatus = payment.status;
  await order.save();

  log.info({ orderNumber: order.orderNumber, amount: params.amount }, 'Refund issued');
  return order;
}

export const isMockProvider = () => env.PAYMENT_PROVIDER === 'mock';
