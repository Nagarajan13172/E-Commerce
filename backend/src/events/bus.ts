import { EventEmitter } from 'node:events';
import type { Types } from 'mongoose';
import { createLogger } from '../config/logger.js';

const log = createLogger('events');

/**
 * In-process domain event bus.
 *
 * Its job is decoupling: `OrderService` should record that an order was paid
 * without also knowing how to render an email, write a notification row, or
 * update an analytics counter. It emits a fact; subscribers react.
 *
 * **Every handler is failure-isolated.** A subscriber that throws must never
 * fail the request that emitted the event — the payment already succeeded, and
 * a broken email template is not a reason to reject it. Errors are caught,
 * logged, and dropped.
 *
 * The trade-off, stated plainly: in-process events are lost if the process dies
 * between emit and handling. That is acceptable for notifications, which are
 * best-effort by nature. It would NOT be acceptable for anything that must
 * happen exactly once (stock movements, refunds) — those run inline, inside the
 * same transaction as the state change they belong to.
 *
 * Redis is already in the stack, so the migration path when volume demands it is
 * to swap this emitter for a BullMQ queue behind the same `emit` signature.
 */
export interface DomainEvents {
  'user.registered': { userId: string; email: string; name: string };
  'user.verified': { userId: string; email: string; name: string };
  'user.password_changed': { userId: string; email: string; name: string };

  'order.created': { orderId: string; orderNumber: string; userId?: string; email: string };
  'order.confirmed': { orderId: string; orderNumber: string; email: string };
  'order.shipped': { orderId: string; orderNumber: string; email: string; trackingNumber?: string };
  'order.delivered': { orderId: string; orderNumber: string; email: string };
  'order.cancelled': { orderId: string; orderNumber: string; email: string; reason: string };

  'payment.succeeded': { orderId: string; paymentId: string; amount: number; email: string };
  'payment.failed': { orderId: string; paymentId: string; reason: string; email: string };
  'payment.refunded': { orderId: string; paymentId: string; amount: number; email: string };

  'inventory.low_stock': { productId: string; variantId?: string; sku: string; available: number };
  'review.approved': { reviewId: string; productId: string; userId: string };
}

export type DomainEventName = keyof DomainEvents;

class DomainEventBus {
  private readonly emitter = new EventEmitter();

  constructor() {
    // Domain events fan out to several handlers each; the default cap of 10 is
    // a leak warning, not a limit that suits this use.
    this.emitter.setMaxListeners(50);
  }

  emit<E extends DomainEventName>(event: E, payload: DomainEvents[E]): void {
    log.debug({ event, payload }, 'Domain event emitted');
    this.emitter.emit(event, payload);
  }

  on<E extends DomainEventName>(
    event: E,
    handler: (payload: DomainEvents[E]) => void | Promise<void>,
  ): void {
    this.emitter.on(event, (payload: DomainEvents[E]) => {
      // Isolation boundary: a rejected handler promise would otherwise become an
      // unhandled rejection and take the process down.
      void Promise.resolve()
        .then(() => handler(payload))
        .catch((err) => log.error({ err, event }, 'Domain event handler failed'));
    });
  }

  removeAll(): void {
    this.emitter.removeAllListeners();
  }
}

export const eventBus = new DomainEventBus();

/** Mongoose ids reach handlers as strings, so payloads stay serialisable. */
export const toId = (value: Types.ObjectId | string): string => String(value);
