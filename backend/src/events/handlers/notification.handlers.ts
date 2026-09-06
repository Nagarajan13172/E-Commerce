import { eventBus } from '../bus.js';
import { notify } from '../../services/notification.service.js';
import { createLogger } from '../../config/logger.js';

const log = createLogger('events:notifications');

/**
 * Subscribe in-app notifications to domain events.
 *
 * Registered once at boot. Keeping these here rather than inside the services
 * means `OrderService` never needs to know that notifications exist — it states
 * what happened, and this decides what the user should see about it.
 */
export function registerNotificationHandlers(): void {
  eventBus.on('order.confirmed', async ({ orderId, orderNumber }) => {
    log.debug({ orderId }, 'order.confirmed → notification');
    // Guest orders have no account to notify; email covers those.
    // Wired fully in Phase 6 when orders carry a user reference.
    void orderNumber;
  });

  eventBus.on('user.verified', async ({ userId }) => {
    await notify({
      user: userId,
      type: 'order_placed',
      title: 'Welcome to Aurora',
      body: 'Your email is confirmed. Your account is ready to use.',
      link: '/account',
    });
  });

  log.info('Domain event handlers registered');
}
