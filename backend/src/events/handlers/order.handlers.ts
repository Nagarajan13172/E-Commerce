import { eventBus } from '../bus.js';
import { emailProvider } from '../../integrations/email/index.js';
import {
  orderCancelledTemplate,
  orderConfirmationTemplate,
  orderShippedTemplate,
} from '../../integrations/email/templates/order.templates.js';
import { notify } from '../../services/notification.service.js';
import { Order } from '../../models/order.model.js';
import { User } from '../../models/user.model.js';
import { createLogger } from '../../config/logger.js';

const log = createLogger('events:orders');

/**
 * Transactional email and in-app notifications for order events.
 *
 * Every handler is failure-isolated by the bus: a broken template or a dead
 * mail server must never fail the request that emitted the event. The payment
 * has already been taken and the stock already committed — refusing the
 * response because an email did not send would be strictly worse for everyone.
 */
export function registerOrderHandlers(): void {
  eventBus.on('order.confirmed', async ({ orderId }) => {
    const order = await Order.findById(orderId).lean();
    if (!order) return;

    const user = order.user ? await User.findById(order.user).select('name').lean() : null;
    const name = user?.name ?? 'there';

    await emailProvider.send(
      orderConfirmationTemplate({
        to: order.email,
        name,
        orderNumber: order.orderNumber,
        items: order.items.map((item) => ({
          name: item.productSnapshot.name,
          quantity: item.quantity,
          lineTotal: item.lineTotal,
          options: item.variantSnapshot?.optionValues.map((o) => o.value).join(' · '),
        })),
        total: order.pricing.grandTotal,
        currency: order.pricing.currency,
      }),
    );

    if (order.user) {
      await notify({
        user: order.user,
        type: 'order_placed',
        title: `Order ${order.orderNumber} confirmed`,
        body: 'We are getting your order ready.',
        link: `/account/orders/${order.orderNumber}`,
      });
    }

    log.debug({ orderNumber: order.orderNumber }, 'Confirmation email sent');
  });

  eventBus.on('order.shipped', async ({ orderId, orderNumber, trackingNumber }) => {
    const order = await Order.findById(orderId).lean();
    if (!order) return;
    const user = order.user ? await User.findById(order.user).select('name').lean() : null;

    await emailProvider.send(
      orderShippedTemplate({
        to: order.email,
        name: user?.name ?? 'there',
        orderNumber,
        trackingNumber,
        provider: order.shipping.provider,
      }),
    );

    if (order.user) {
      await notify({
        user: order.user,
        type: 'order_shipped',
        title: `Order ${orderNumber} shipped`,
        body: trackingNumber ? `Tracking number ${trackingNumber}` : 'Your order is on its way.',
        link: `/account/orders/${orderNumber}`,
      });
    }
  });

  eventBus.on('order.cancelled', async ({ orderId, orderNumber, reason }) => {
    const order = await Order.findById(orderId).lean();
    if (!order) return;
    const user = order.user ? await User.findById(order.user).select('name').lean() : null;

    await emailProvider.send(
      orderCancelledTemplate({
        to: order.email,
        name: user?.name ?? 'there',
        orderNumber,
        reason,
        refundAmount: order.refundedTotal > 0 ? order.refundedTotal : undefined,
        currency: order.pricing.currency,
      }),
    );

    if (order.user) {
      await notify({
        user: order.user,
        type: 'order_cancelled',
        title: `Order ${orderNumber} cancelled`,
        body: reason,
        link: `/account/orders/${orderNumber}`,
      });
    }
  });

  eventBus.on('order.delivered', async ({ orderId, orderNumber }) => {
    const order = await Order.findById(orderId).lean();
    if (!order?.user) return;

    await notify({
      user: order.user,
      type: 'order_delivered',
      title: `Order ${orderNumber} delivered`,
      body: 'Enjoy it — and let others know what you think by leaving a review.',
      link: `/account/orders/${orderNumber}`,
    });
  });

  log.info('Order event handlers registered');
}
