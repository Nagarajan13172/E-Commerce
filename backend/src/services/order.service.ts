import mongoose, { Types, type ClientSession } from 'mongoose';
import { ERROR_CODES, type OrderStatus } from '@ecom/shared';
import { Order, type IOrderAddress, type OrderDocument } from '../models/order.model.js';
import { Payment } from '../models/payment.model.js';
import { Cart } from '../models/cart.model.js';
import { Coupon } from '../models/coupon.model.js';
import { CouponRedemption } from '../models/couponRedemption.model.js';
import { Product } from '../models/product.model.js';
import { nextSequence } from '../models/counter.model.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../config/logger.js';
import { eventBus } from '../events/bus.js';
import * as inventory from './inventory.service.js';
import * as stateMachine from './orderStateMachine.js';
import type { CheckoutQuote } from './checkout.service.js';

const log = createLogger('order');

/**
 * Order lifecycle.
 *
 * Two properties this file exists to guarantee:
 *
 *   1. Creating an order either reserves ALL its stock or none of it, and
 *      never oversells.
 *   2. Confirming payment is idempotent, because confirmation arrives twice by
 *      design — once from the browser callback and once from the webhook, in
 *      either order, sometimes simultaneously.
 */

/** `ORD-20260907-000123` — sequential, readable, and safe to say out loud. */
async function generateOrderNumber(session: ClientSession): Promise<string> {
  const today = new Date();
  const datePart = [
    today.getFullYear(),
    String(today.getMonth() + 1).padStart(2, '0'),
    String(today.getDate()).padStart(2, '0'),
  ].join('');

  const seq = await nextSequence(`order:${datePart}`, { session });
  return `ORD-${datePart}-${String(seq).padStart(6, '0')}`;
}

export interface CreateOrderInput {
  userId: string;
  email: string;
  quote: CheckoutQuote;
  shippingAddress: IOrderAddress;
  billingAddress?: IOrderAddress;
  customerNote?: string;
  idempotencyKey?: string;
}

/**
 * Create an order and hold its stock.
 *
 * Everything that must succeed together runs in ONE transaction: the stock
 * reservation, the order row, the coupon redemption. Reserving three of four
 * lines and then failing would strand real inventory; incrementing a coupon's
 * usage without writing the order would burn a customer's single-use code.
 *
 * The payment provider is called *outside* the transaction, deliberately: a
 * network round trip inside one holds locks for its whole duration, and an
 * external side effect cannot be rolled back anyway. If it fails afterwards,
 * the reservation simply expires and the sweeper releases the stock.
 */
export async function createOrder(input: CreateOrderInput): Promise<OrderDocument> {
  const { quote } = input;

  if (!quote.canPlaceOrder) {
    throw AppError.unprocessable(
      'Your bag has changed. Please review it before ordering.',
      ERROR_CODES.INSUFFICIENT_STOCK,
    );
  }

  const cart = await Cart.findOne({ user: input.userId });
  if (!cart || cart.items.length === 0) {
    throw AppError.unprocessable('Your bag is empty', ERROR_CODES.CART_EMPTY);
  }

  // Snapshot data is read from the products themselves, never from the request.
  const products = await Product.find({ _id: { $in: cart.items.map((i) => i.product) } })
    .select('name slug sku thumbnail variants brand price')
    .populate('brand', 'name')
    .lean();
  const productById = new Map(products.map((p) => [String(p._id), p]));

  const session = await mongoose.startSession();
  let created: OrderDocument | undefined;

  try {
    await session.withTransaction(async () => {
      const orderNumber = await generateOrderNumber(session);
      const orderId = new Types.ObjectId();

      // Line data is built from the priced quote, so the order records exactly
      // what the customer was shown.
      const items = quote.pricing.lines.map((pricedLine) => {
        const cartItem = cart.items.id(pricedLine.key);
        if (!cartItem) {
          throw AppError.unprocessable('Your bag changed while ordering', ERROR_CODES.CART_EMPTY);
        }

        const product = productById.get(String(cartItem.product));
        if (!product) throw AppError.notFound('Product', ERROR_CODES.PRODUCT_NOT_FOUND);

        const variant = cartItem.variantId
          ? product.variants.find((v) => String(v._id) === String(cartItem.variantId))
          : undefined;

        return {
          product: product._id,
          variantId: variant?._id,
          // Snapshots, so the order never changes because a product was edited.
          productSnapshot: {
            name: product.name,
            slug: product.slug,
            sku: product.sku,
            thumbnail: product.thumbnail,
            brandName: (product.brand as unknown as { name?: string })?.name,
          },
          variantSnapshot: variant
            ? { sku: variant.sku, optionValues: variant.optionValues }
            : undefined,
          quantity: pricedLine.quantity,
          unitPrice: pricedLine.unitPrice,
          lineDiscount: pricedLine.lineDiscount,
          lineTax: pricedLine.lineTax,
          lineTotal: pricedLine.lineTotal,
        };
      });

      const [order] = await Order.create(
        [
          {
            _id: orderId,
            orderNumber,
            user: input.userId,
            email: input.email,
            items,
            pricing: {
              subtotal: quote.pricing.subtotal,
              discountTotal: quote.pricing.discountTotal,
              couponCode: quote.pricing.coupon?.code,
              couponDiscount: quote.pricing.coupon?.discount ?? 0,
              taxTotal: quote.pricing.taxTotal,
              shippingTotal: quote.pricing.shippingTotal,
              grandTotal: quote.pricing.grandTotal,
              currency: quote.pricing.currency,
            },
            shippingAddress: input.shippingAddress,
            billingAddress: input.billingAddress ?? input.shippingAddress,
            status: 'pending_payment',
            paymentStatus: 'created',
            shipping: { method: quote.deliveryMethod },
            timeline: [{ status: 'pending_payment', at: new Date(), actorType: 'customer' }],
            customerNote: input.customerNote,
            idempotencyKey: input.idempotencyKey,
            placedAt: new Date(),
          },
        ],
        { session },
      );

      // Hold the stock. Throws — and so aborts everything above — if any line
      // cannot be satisfied.
      await inventory.reserveStock(
        cart.items.map((item) => ({
          productId: String(item.product),
          variantId: item.variantId ? String(item.variantId) : undefined,
          quantity: item.quantity,
        })),
        { orderId, userId: input.userId, session },
      );

      if (quote.pricing.coupon) {
        await redeemCoupon(quote.pricing.coupon.code, {
          userId: input.userId,
          orderId,
          discount: quote.pricing.coupon.discount,
          session,
        });
      }

      created = order;
    });
  } finally {
    await session.endSession();
  }

  if (!created) throw AppError.internal('Order creation failed');

  log.info(
    { orderNumber: created.orderNumber, total: created.pricing.grandTotal },
    'Order created, stock reserved',
  );

  eventBus.emit('order.created', {
    orderId: String(created._id),
    orderNumber: created.orderNumber,
    userId: input.userId,
    email: input.email,
  });

  return created;
}

/**
 * Consume one use of a coupon.
 *
 * The `$lt` guard is the authoritative usage-limit check — the validation done
 * when the code was typed is only advisory, because between then and now other
 * customers may have redeemed the last uses. Doing it as a conditional update
 * inside the transaction is what makes the limit race-proof.
 */
async function redeemCoupon(
  code: string,
  context: { userId: string; orderId: Types.ObjectId; discount: number; session: ClientSession },
): Promise<void> {
  const coupon = await Coupon.findOne({ code }).session(context.session);
  if (!coupon) return;

  if (coupon.usageLimit !== undefined) {
    const claimed = await Coupon.updateOne(
      { _id: coupon._id, usedCount: { $lt: coupon.usageLimit } },
      { $inc: { usedCount: 1 } },
      { session: context.session },
    );

    if (claimed.matchedCount === 0) {
      throw AppError.unprocessable(
        'That coupon has just been fully redeemed',
        ERROR_CODES.COUPON_USAGE_EXCEEDED,
      );
    }
  } else {
    await Coupon.updateOne(
      { _id: coupon._id },
      { $inc: { usedCount: 1 } },
      { session: context.session },
    );
  }

  // The unique index on { coupon, order } makes double-counting structurally
  // impossible even if this somehow ran twice.
  await CouponRedemption.create(
    [
      {
        coupon: coupon._id,
        code: coupon.code,
        user: context.userId,
        order: context.orderId,
        discountAmount: context.discount,
      },
    ],
    { session: context.session },
  );
}

/**
 * Mark an order paid — idempotently.
 *
 * Confirmation arrives from two independent sources: the browser callback and
 * the provider's webhook. They can arrive in either order, seconds apart, or
 * simultaneously. Processing twice would commit the reservation twice and
 * corrupt the inventory ledger.
 *
 * The guard is a conditional update inside the transaction: only the caller
 * whose `findOneAndUpdate` matches a not-yet-paid payment proceeds. The loser
 * gets `null` and returns quietly.
 */
export async function confirmPayment(params: {
  providerOrderId: string;
  providerPaymentId?: string;
  method?: string;
  amount?: number;
}): Promise<{ order: OrderDocument; alreadyProcessed: boolean } | null> {
  const session = await mongoose.startSession();

  try {
    let result: { order: OrderDocument; alreadyProcessed: boolean } | null = null;

    await session.withTransaction(async () => {
      const claimed = await Payment.findOneAndUpdate(
        // The atomic claim. A second caller matches nothing.
        { providerOrderId: params.providerOrderId, status: { $ne: 'paid' } },
        {
          $set: {
            status: 'paid',
            providerPaymentId: params.providerPaymentId,
            method: params.method,
            paidAt: new Date(),
            verifiedAt: new Date(),
          },
        },
        { session, new: true },
      );

      if (!claimed) {
        // Either already confirmed, or no such payment.
        const existing = await Payment.findOne({ providerOrderId: params.providerOrderId }).session(
          session,
        );
        if (!existing) return;

        const order = await Order.findById(existing.order).session(session);
        if (order) result = { order, alreadyProcessed: true };
        return;
      }

      const order = await Order.findById(claimed.order).session(session);
      if (!order) throw AppError.notFound('Order', ERROR_CODES.ORDER_NOT_FOUND);

      // Reserved → sold. Also idempotent in its own right.
      await inventory.commitReservation(order._id, session);

      order.status = 'confirmed';
      order.paymentStatus = 'paid';
      order.timeline.push({ status: 'confirmed', at: new Date(), actorType: 'system' });
      await order.save({ session });

      // The bag has become an order; clearing it inside the transaction means a
      // customer can never be left with both.
      await Cart.updateOne(
        { user: order.user },
        { $set: { items: [] }, $unset: { couponCode: '' } },
        { session },
      );

      result = { order, alreadyProcessed: false };
    });

    if (result && !(result as { alreadyProcessed: boolean }).alreadyProcessed) {
      const { order } = result as { order: OrderDocument };
      log.info({ orderNumber: order.orderNumber }, 'Payment confirmed, stock committed');

      eventBus.emit('payment.succeeded', {
        orderId: String(order._id),
        paymentId: params.providerPaymentId ?? '',
        amount: order.pricing.grandTotal,
        email: order.email,
      });
      eventBus.emit('order.confirmed', {
        orderId: String(order._id),
        orderNumber: order.orderNumber,
        email: order.email,
      });
    }

    return result;
  } finally {
    await session.endSession();
  }
}

/** Record a failed payment and give the held stock back. */
export async function failPayment(params: {
  providerOrderId: string;
  reason?: string;
}): Promise<OrderDocument | null> {
  const session = await mongoose.startSession();

  try {
    let order: OrderDocument | null = null;

    await session.withTransaction(async () => {
      const payment = await Payment.findOneAndUpdate(
        { providerOrderId: params.providerOrderId, status: { $nin: ['paid', 'failed'] } },
        { $set: { status: 'failed', failureReason: params.reason } },
        { session, new: true },
      );
      if (!payment) return;

      const found = await Order.findById(payment.order).session(session);
      if (!found || found.status !== 'pending_payment') return;

      await inventory.releaseReservation(found._id, 'released', session);

      found.status = 'payment_failed';
      found.paymentStatus = 'failed';
      found.timeline.push({
        status: 'payment_failed',
        at: new Date(),
        actorType: 'system',
        note: params.reason,
      });
      await found.save({ session });

      order = found;
    });

    if (order) {
      const failed = order as OrderDocument;
      eventBus.emit('payment.failed', {
        orderId: String(failed._id),
        paymentId: '',
        reason: params.reason ?? 'Payment failed',
        email: failed.email,
      });
    }

    return order;
  } finally {
    await session.endSession();
  }
}

/**
 * Move an order to a new status.
 *
 * The single mutator for `status`, so the state machine cannot be bypassed.
 * Restocking is decided by the machine rather than the caller: cancelling a
 * *paid* order returns sold units, while cancelling an unpaid one releases the
 * reservation — different operations that are easy to confuse.
 */
export async function transition(
  orderId: string,
  to: OrderStatus,
  context: { actorId?: string; actorType: 'customer' | 'staff' | 'system'; note?: string },
): Promise<OrderDocument> {
  const session = await mongoose.startSession();

  try {
    let updated: OrderDocument | undefined;

    await session.withTransaction(async () => {
      const order = await Order.findById(orderId).session(session);
      if (!order) throw AppError.notFound('Order', ERROR_CODES.ORDER_NOT_FOUND);

      stateMachine.assertTransition(order.status, to);

      if (to === 'cancelled' && order.status === 'pending_payment') {
        await inventory.releaseReservation(order._id, 'released', session);
      } else if (stateMachine.shouldRestock(order.status, to)) {
        await inventory.restockOrderLines(
          order.items.map((item) => ({
            productId: String(item.product),
            variantId: item.variantId ? String(item.variantId) : undefined,
            quantity: item.quantity,
          })),
          { orderId: order._id, type: to === 'returned' ? 'return' : 'restock', session },
        );
      }

      order.status = to;
      if (to === 'shipped') order.shipping.shippedAt = new Date();
      if (to === 'delivered') {
        order.shipping.deliveredAt = new Date();
        order.fulfillmentStatus = 'fulfilled';
      }
      if (to === 'cancelled') {
        order.cancellation = {
          reason: context.note ?? 'Cancelled',
          by: context.actorId ? new Types.ObjectId(context.actorId) : undefined,
          at: new Date(),
        };
      }

      order.timeline.push({
        status: to,
        at: new Date(),
        actor: context.actorId ? new Types.ObjectId(context.actorId) : undefined,
        actorType: context.actorType,
        note: context.note,
      });

      await order.save({ session });
      updated = order;
    });

    if (!updated) throw AppError.internal('Transition failed');

    emitForStatus(updated, to);
    return updated;
  } finally {
    await session.endSession();
  }
}

function emitForStatus(order: OrderDocument, status: OrderStatus): void {
  const base = { orderId: String(order._id), orderNumber: order.orderNumber, email: order.email };

  if (status === 'shipped') {
    eventBus.emit('order.shipped', { ...base, trackingNumber: order.shipping.trackingNumber });
  } else if (status === 'delivered') {
    eventBus.emit('order.delivered', base);
  } else if (status === 'cancelled') {
    eventBus.emit('order.cancelled', {
      ...base,
      reason: order.cancellation?.reason ?? 'Cancelled',
    });
  }
}
