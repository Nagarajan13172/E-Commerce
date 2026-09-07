import { describe, expect, it } from 'vitest';
import { ORDER_STATUSES, type OrderStatus } from '@ecom/shared';
import {
  allowedTransitions,
  assertTransition,
  canTransition,
  isCustomerCancellable,
  isPaid,
  isTerminal,
  shouldRestock,
} from '../../src/services/orderStateMachine.js';

/**
 * The state machine is what stops an order status being "just a string".
 * These tests encode the transitions that must never be possible.
 */

describe('legal progression', () => {
  it('walks the happy path end to end', () => {
    const path: OrderStatus[] = [
      'pending_payment',
      'confirmed',
      'processing',
      'packed',
      'shipped',
      'out_for_delivery',
      'delivered',
    ];

    for (let i = 0; i < path.length - 1; i += 1) {
      expect(canTransition(path[i]!, path[i + 1]!)).toBe(true);
    }
  });

  it('allows a delivered order to be returned and then refunded', () => {
    expect(canTransition('delivered', 'returned')).toBe(true);
    expect(canTransition('returned', 'refunded')).toBe(true);
  });
});

describe('illegal transitions', () => {
  it('cannot move backwards', () => {
    expect(canTransition('delivered', 'processing')).toBe(false);
    expect(canTransition('shipped', 'confirmed')).toBe(false);
    expect(canTransition('confirmed', 'pending_payment')).toBe(false);
  });

  it('cannot ship a cancelled order', () => {
    expect(canTransition('cancelled', 'shipped')).toBe(false);
    expect(canTransition('cancelled', 'processing')).toBe(false);
  });

  it('cannot deliver an order that was never paid for', () => {
    // The transition every naive status dropdown allows.
    expect(canTransition('pending_payment', 'delivered')).toBe(false);
    expect(canTransition('pending_payment', 'shipped')).toBe(false);
  });

  it('cannot cancel an order already with the courier', () => {
    expect(canTransition('shipped', 'cancelled')).toBe(false);
    expect(canTransition('out_for_delivery', 'cancelled')).toBe(false);
    expect(canTransition('delivered', 'cancelled')).toBe(false);
  });

  it('treats refunded, expired and payment_failed as terminal', () => {
    for (const status of ['refunded', 'expired', 'payment_failed'] as OrderStatus[]) {
      expect(isTerminal(status)).toBe(true);
      expect(allowedTransitions(status)).toHaveLength(0);
    }
  });

  it('rejects a no-op transition with a clear message', () => {
    expect(() => assertTransition('confirmed', 'confirmed')).toThrowError(/already confirmed/i);
  });

  it('names the legal options when refusing', () => {
    expect(() => assertTransition('confirmed', 'delivered')).toThrowError(/Allowed: processing/);
  });

  it('has an entry for every declared status, so none is unreachable', () => {
    // Guards against adding a status to the enum and forgetting the graph.
    for (const status of ORDER_STATUSES) {
      expect(() => allowedTransitions(status)).not.toThrow();
    }
  });
});

describe('stock and cancellation rules', () => {
  it('knows which statuses mean money moved and stock was committed', () => {
    expect(isPaid('confirmed')).toBe(true);
    expect(isPaid('delivered')).toBe(true);
    expect(isPaid('pending_payment')).toBe(false);
    expect(isPaid('payment_failed')).toBe(false);
  });

  it('restocks only when committed stock is being given back', () => {
    // Cancelling a paid order returns sold units to the shelf.
    expect(shouldRestock('confirmed', 'cancelled')).toBe(true);
    expect(shouldRestock('delivered', 'returned')).toBe(true);
    // Cancelling an unpaid order releases the RESERVATION instead — a
    // different operation. Restocking here would invent stock.
    expect(shouldRestock('pending_payment', 'cancelled')).toBe(false);
    expect(shouldRestock('confirmed', 'processing')).toBe(false);
  });

  it('lets customers cancel only before the warehouse acts', () => {
    expect(isCustomerCancellable('pending_payment')).toBe(true);
    expect(isCustomerCancellable('confirmed')).toBe(true);
    expect(isCustomerCancellable('processing')).toBe(true);
    // Packed onwards is physically in a queue; cancelling would race it.
    expect(isCustomerCancellable('packed')).toBe(false);
    expect(isCustomerCancellable('shipped')).toBe(false);
  });
});
