import { ERROR_CODES, type OrderStatus } from '@ecom/shared';
import { AppError } from '../utils/AppError.js';

/**
 * Order lifecycle, as an explicit graph.
 *
 * Without this, order status is just a string anyone can set, and nothing stops
 * a delivered order going back to "processing", a cancelled order shipping, or
 * an unpaid order being marked delivered. Those are not hypothetical — they are
 * what happens when an admin UI offers a dropdown of every status.
 *
 * The rule this encodes: **a transition is illegal unless it appears here.**
 * `OrderService.transition()` is the only thing allowed to change status, and it
 * consults this table first.
 */
const TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  // Awaiting payment. Stock is reserved but not yet sold.
  pending_payment: ['confirmed', 'payment_failed', 'expired', 'cancelled'],

  // Paid. Stock is committed.
  confirmed: ['processing', 'cancelled'],
  processing: ['packed', 'cancelled'],
  packed: ['shipped', 'cancelled'],

  // Once it is with a courier, it can no longer be cancelled — only returned.
  shipped: ['out_for_delivery', 'delivered', 'returned'],
  out_for_delivery: ['delivered', 'returned'],

  // Returns are accepted for a window after delivery.
  delivered: ['returned'],
  returned: ['refunded'],

  // A cancelled order still needs refunding if it was paid for.
  cancelled: ['refunded'],

  // Terminal.
  refunded: [],
  payment_failed: [],
  expired: [],
};

/** Statuses after which stock has been committed and money has moved. */
const PAID_STATUSES: readonly OrderStatus[] = [
  'confirmed',
  'processing',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
];

export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(from: OrderStatus): readonly OrderStatus[] {
  return TRANSITIONS[from];
}

export function isTerminal(status: OrderStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

export function isPaid(status: OrderStatus): boolean {
  return PAID_STATUSES.includes(status);
}

/**
 * Whether a customer may cancel.
 *
 * Deliberately narrower than what staff may do: once an order is packed it is
 * physically in a queue, so a customer cancellation would race the warehouse.
 * Staff keep the ability to cancel up to dispatch.
 */
export function isCustomerCancellable(status: OrderStatus): boolean {
  return status === 'pending_payment' || status === 'confirmed' || status === 'processing';
}

/** Whether stock should return to the shelf when moving into this status. */
export function shouldRestock(from: OrderStatus, to: OrderStatus): boolean {
  if (to !== 'cancelled' && to !== 'returned') return false;
  // Only if the stock was actually committed; a pending_payment cancellation
  // releases the *reservation* instead, which is a different operation.
  return isPaid(from);
}

export function assertTransition(from: OrderStatus, to: OrderStatus): void {
  if (from === to) {
    throw AppError.conflict(
      `This order is already ${humanise(to)}`,
      ERROR_CODES.INVALID_STATE_TRANSITION,
    );
  }

  if (!canTransition(from, to)) {
    const allowed = TRANSITIONS[from];
    throw AppError.conflict(
      allowed.length === 0
        ? `A ${humanise(from)} order cannot be changed`
        : `Cannot move an order from ${humanise(from)} to ${humanise(to)}. Allowed: ${allowed
            .map(humanise)
            .join(', ')}`,
      ERROR_CODES.INVALID_STATE_TRANSITION,
      { from, to, allowed },
    );
  }
}

export function humanise(status: OrderStatus): string {
  return status.replace(/_/g, ' ');
}
