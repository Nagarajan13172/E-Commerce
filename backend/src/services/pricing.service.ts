import type { DeliveryMethod } from '@ecom/shared';
import { env } from '../config/env.js';

/**
 * The single authority on money.
 *
 * Cart totals, the checkout quote and the order that eventually gets written
 * all come from here. One implementation means the number a customer is shown
 * and the number they are charged cannot disagree — the most damaging class of
 * bug an e-commerce system can have.
 *
 * ── Why everything is computed in integer paise ─────────────────────────────
 *
 * Rupee amounts are IEEE-754 doubles, and doubles cannot represent 0.1 exactly.
 * `0.1 + 0.2 === 0.30000000000000004`. Over a multi-line cart with a percentage
 * discount and tax extraction, that error compounds into totals that are a paisa
 * out — and a paisa out is a reconciliation failure, a failed payment-gateway
 * signature check, and a support ticket.
 *
 * So every intermediate value here is an integer number of paise. Rupees exist
 * only at the boundaries: input from the database, output to the client.
 */

// ── Money primitives ────────────────────────────────────────────────────────

/** Rupees → paise. Rounds once, at the boundary. */
export function toMinor(rupees: number): number {
  return Math.round(rupees * 100);
}

/** Paise → rupees, for output only. */
export function toMajor(paise: number): number {
  return Math.round(paise) / 100;
}

/**
 * Distribute an amount across weights so the parts sum EXACTLY to the whole.
 *
 * Naive proportional splitting loses money: ₹100 across three equal lines gives
 * 33.33 × 3 = ₹99.99. The missing paisa has to land somewhere, or the order's
 * line items will not reconcile against its total — which breaks partial
 * refunds and accounting.
 *
 * This uses the largest-remainder method: floor every share, then hand the
 * leftover paise one at a time to the lines with the largest fractional part.
 */
export function allocate(totalMinor: number, weights: number[]): number[] {
  const weightSum = weights.reduce((sum, w) => sum + w, 0);
  if (weightSum <= 0 || totalMinor === 0) return weights.map(() => 0);

  const exact = weights.map((w) => (totalMinor * w) / weightSum);
  const floored = exact.map((value) => Math.floor(value));
  let remainder = totalMinor - floored.reduce((sum, v) => sum + v, 0);

  // Largest fractional part gets the next spare paisa.
  const order = exact
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((a, b) => b.fraction - a.fraction);

  const result = [...floored];
  for (let i = 0; remainder > 0; i += 1, remainder -= 1) {
    result[order[i % order.length]!.index]! += 1;
  }
  return result;
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface PricingLineInput {
  key: string;
  quantity: number;
  /** Unit price in rupees, as stored on the product or variant. */
  unitPrice: number;
  taxRate: number;
  /** True when `unitPrice` already contains the tax (normal for Indian retail). */
  taxInclusive: boolean;
}

export interface PricedLine {
  key: string;
  quantity: number;
  unitPrice: number;
  lineSubtotal: number;
  /** This line's share of the order-level discount. */
  lineDiscount: number;
  lineTax: number;
  /** What this line contributes to the amount charged. */
  lineTotal: number;
}

export interface DiscountInput {
  code: string;
  /** Discount in rupees, already validated and capped by CouponService. */
  amount: number;
  freeShipping: boolean;
}

export interface PriceBreakdown {
  lines: PricedLine[];
  subtotal: number;
  discountTotal: number;
  coupon?: { code: string; discount: number; freeShipping: boolean };
  taxTotal: number;
  shippingTotal: number;
  grandTotal: number;
  currency: string;
  /** How much more to spend to earn free delivery; 0 once earned. */
  amountToFreeShipping: number;
  freeShippingThreshold: number;
}

const EXPRESS_SURCHARGE = 100;

/** Shipping before any coupon: free above the threshold, flat fee below it. */
export function shippingFor(subtotalMinor: number, method: DeliveryMethod): number {
  const threshold = toMinor(env.FREE_SHIPPING_THRESHOLD);
  const base = subtotalMinor >= threshold ? 0 : toMinor(env.DEFAULT_SHIPPING_FEE);
  // Express is a surcharge on top, and is never free — speed costs money even
  // on a large order.
  return method === 'express' ? base + toMinor(EXPRESS_SURCHARGE) : base;
}

/**
 * Price a set of lines.
 *
 * Order of operations, which matters and is deliberate:
 *   1. Line subtotals from live unit prices.
 *   2. Order-level discount, allocated back across lines.
 *   3. Tax, computed on the DISCOUNTED amount — a customer is taxed on what
 *      they actually pay, not on the pre-discount price.
 *   4. Shipping, based on the pre-discount subtotal so a coupon cannot
 *      accidentally push an order under the free-delivery threshold and add a
 *      fee the customer never agreed to.
 */
export function priceCart(
  lines: PricingLineInput[],
  options: { discount?: DiscountInput; deliveryMethod?: DeliveryMethod; currency?: string } = {},
): PriceBreakdown {
  const currency = options.currency ?? env.PAYMENT_CURRENCY;
  const method = options.deliveryMethod ?? 'standard';

  const lineSubtotals = lines.map((line) => toMinor(line.unitPrice) * line.quantity);
  const subtotalMinor = lineSubtotals.reduce((sum, value) => sum + value, 0);

  // A discount can never exceed the subtotal, whatever the coupon says.
  const requestedDiscount = options.discount ? toMinor(options.discount.amount) : 0;
  const discountMinor = Math.min(Math.max(requestedDiscount, 0), subtotalMinor);
  const lineDiscounts = allocate(discountMinor, lineSubtotals);

  const pricedLines: PricedLine[] = lines.map((line, index) => {
    const lineSubtotal = lineSubtotals[index]!;
    const lineDiscount = lineDiscounts[index]!;
    const taxable = lineSubtotal - lineDiscount;

    // Inclusive tax is EXTRACTED from the price, not added to it:
    //   tax = gross − gross / (1 + rate)
    // Adding it instead would silently inflate every Indian retail price by
    // 18%, and the customer would be charged more than the label says.
    const lineTax = line.taxInclusive
      ? Math.round(taxable - taxable / (1 + line.taxRate))
      : Math.round(taxable * line.taxRate);

    return {
      key: line.key,
      quantity: line.quantity,
      unitPrice: toMajor(toMinor(line.unitPrice)),
      lineSubtotal: toMajor(lineSubtotal),
      lineDiscount: toMajor(lineDiscount),
      lineTax: toMajor(lineTax),
      // Inclusive tax is already inside `taxable`; exclusive tax is added on.
      lineTotal: toMajor(line.taxInclusive ? taxable : taxable + lineTax),
    };
  });

  const taxTotalMinor = pricedLines.reduce((sum, line) => sum + toMinor(line.lineTax), 0);

  const shippingMinor = options.discount?.freeShipping ? 0 : shippingFor(subtotalMinor, method);

  const goodsTotalMinor = pricedLines.reduce((sum, line) => sum + toMinor(line.lineTotal), 0);
  const grandTotalMinor = goodsTotalMinor + shippingMinor;

  const thresholdMinor = toMinor(env.FREE_SHIPPING_THRESHOLD);

  return {
    lines: pricedLines,
    subtotal: toMajor(subtotalMinor),
    discountTotal: toMajor(discountMinor),
    ...(options.discount
      ? {
          coupon: {
            code: options.discount.code,
            discount: toMajor(discountMinor),
            freeShipping: options.discount.freeShipping,
          },
        }
      : {}),
    taxTotal: toMajor(taxTotalMinor),
    shippingTotal: toMajor(shippingMinor),
    grandTotal: toMajor(grandTotalMinor),
    currency,
    amountToFreeShipping: toMajor(Math.max(0, thresholdMinor - subtotalMinor)),
    freeShippingThreshold: env.FREE_SHIPPING_THRESHOLD,
  };
}
