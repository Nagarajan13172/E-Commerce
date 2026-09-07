import { describe, expect, it } from 'vitest';
import { allocate, priceCart, toMajor, toMinor } from '../../src/services/pricing.service.js';

/**
 * Pricing is the money path. These tests exist to catch the failures that are
 * invisible in a UI but wrong in an invoice: a paisa that vanishes, tax added
 * where it should have been extracted, a discount that exceeds the basket.
 */

describe('money primitives', () => {
  it('round-trips rupees through paise without drift', () => {
    for (const amount of [0, 0.01, 1, 99.99, 1234.56, 164999]) {
      expect(toMajor(toMinor(amount))).toBe(amount);
    }
  });

  it('avoids the float error that naive rupee arithmetic produces', () => {
    // The canonical failure: 0.1 + 0.2 !== 0.3 in IEEE-754.
    expect(0.1 + 0.2).not.toBe(0.3);
    expect(toMajor(toMinor(0.1) + toMinor(0.2))).toBe(0.3);
  });
});

describe('allocate', () => {
  it('distributes exactly, losing no paise to rounding', () => {
    // ₹100 across three equal lines is 33.333… each. Naive splitting yields
    // 99.99 and the order stops reconciling against its own line items.
    const parts = allocate(10_000, [1, 1, 1]);

    expect(parts.reduce((sum, p) => sum + p, 0)).toBe(10_000);
    expect(parts.sort()).toEqual([3333, 3333, 3334]);
  });

  it('weights the split by line value', () => {
    const parts = allocate(1000, [3000, 1000]);

    expect(parts).toEqual([750, 250]);
    expect(parts[0]! + parts[1]!).toBe(1000);
  });

  it('handles awkward remainders across many lines', () => {
    const weights = [777, 333, 1111, 89, 4201];
    const parts = allocate(9_999, weights);

    expect(parts.reduce((sum, p) => sum + p, 0)).toBe(9_999);
    expect(parts.every((p) => p >= 0)).toBe(true);
  });

  it('returns zeros rather than dividing by zero', () => {
    expect(allocate(500, [0, 0])).toEqual([0, 0]);
    expect(allocate(0, [1, 2])).toEqual([0, 0]);
  });
});

const line = (unitPrice: number, quantity = 1, taxInclusive = true) => ({
  key: `line-${unitPrice}-${quantity}`,
  quantity,
  unitPrice,
  taxRate: 0.18,
  taxInclusive,
});

describe('priceCart', () => {
  it('sums line subtotals into the cart subtotal', () => {
    const result = priceCart([line(1000, 2), line(250, 3)]);

    expect(result.subtotal).toBe(2750);
    expect(result.lines[0]!.lineSubtotal).toBe(2000);
    expect(result.lines[1]!.lineSubtotal).toBe(750);
  });

  it('EXTRACTS inclusive tax rather than adding it', () => {
    // ₹1,180 at 18% inclusive contains ₹180 of tax; the customer pays ₹1,180.
    // Adding instead would charge ₹1,392.40 — the single most damaging way to
    // get Indian retail pricing wrong.
    const result = priceCart([line(1180, 1, true)]);

    expect(result.taxTotal).toBe(180);
    expect(result.lines[0]!.lineTotal).toBe(1180);
  });

  it('ADDS exclusive tax on top', () => {
    const result = priceCart([line(1000, 1, false)]);

    expect(result.taxTotal).toBe(180);
    expect(result.lines[0]!.lineTotal).toBe(1180);
  });

  it('taxes the discounted amount, not the list price', () => {
    const withoutDiscount = priceCart([line(1000, 1, true)]);
    const withDiscount = priceCart([line(1000, 1, true)], {
      discount: { code: 'HALF', amount: 500, freeShipping: false },
    });

    // A customer is taxed on what they actually pay.
    expect(withDiscount.taxTotal).toBeLessThan(withoutDiscount.taxTotal);
    expect(withDiscount.taxTotal).toBe(76.27);
  });

  it('allocates the discount across lines so they sum to the total', () => {
    const result = priceCart([line(1000, 1), line(1000, 1), line(1000, 1)], {
      discount: { code: 'SAVE100', amount: 100, freeShipping: false },
    });

    const allocated = result.lines.reduce((sum, l) => sum + l.lineDiscount, 0);
    expect(allocated).toBe(100);
    expect(result.discountTotal).toBe(100);
  });

  it('never discounts more than the basket is worth', () => {
    // A ₹5,000 fixed coupon on a ₹500 basket must not produce a negative total.
    const result = priceCart([line(500, 1)], {
      discount: { code: 'HUGE', amount: 5000, freeShipping: false },
    });

    expect(result.discountTotal).toBe(500);
    expect(result.grandTotal).toBeGreaterThanOrEqual(0);
  });

  it('charges shipping below the free threshold and not above it', () => {
    const small = priceCart([line(500, 1)]);
    const large = priceCart([line(5000, 1)]);

    expect(small.shippingTotal).toBe(49);
    expect(large.shippingTotal).toBe(0);
    expect(small.amountToFreeShipping).toBe(499);
    expect(large.amountToFreeShipping).toBe(0);
  });

  it('bases shipping on the pre-discount subtotal', () => {
    // A coupon must not push an order back under the free-delivery threshold
    // and quietly add a fee the customer never agreed to.
    const result = priceCart([line(1200, 1)], {
      discount: { code: 'SAVE500', amount: 500, freeShipping: false },
    });

    expect(result.subtotal).toBe(1200);
    expect(result.shippingTotal).toBe(0);
  });

  it('surcharges express delivery even on a large order', () => {
    const standard = priceCart([line(5000, 1)], { deliveryMethod: 'standard' });
    const express = priceCart([line(5000, 1)], { deliveryMethod: 'express' });

    expect(standard.shippingTotal).toBe(0);
    expect(express.shippingTotal).toBe(100);
  });

  it('zeroes shipping for a free-shipping coupon', () => {
    const result = priceCart([line(500, 1)], {
      discount: { code: 'FREESHIP', amount: 0, freeShipping: true },
    });

    expect(result.shippingTotal).toBe(0);
    expect(result.discountTotal).toBe(0);
    expect(result.grandTotal).toBe(500);
  });

  it('produces a grand total that equals its own parts', () => {
    const result = priceCart([line(1499, 2), line(899, 1), line(249, 3)], {
      discount: { code: 'SAVE250', amount: 250, freeShipping: false },
      deliveryMethod: 'express',
    });

    const goods = result.lines.reduce((sum, l) => sum + l.lineTotal, 0);
    // The invariant that makes an invoice add up.
    expect(result.grandTotal).toBe(Math.round((goods + result.shippingTotal) * 100) / 100);
    expect(result.grandTotal).toBe(
      Math.round((result.subtotal - result.discountTotal + result.shippingTotal) * 100) / 100,
    );
  });

  it('handles an empty basket without dividing by zero', () => {
    const result = priceCart([]);

    expect(result.subtotal).toBe(0);
    expect(result.grandTotal).toBe(49);
    expect(result.lines).toHaveLength(0);
  });
});
