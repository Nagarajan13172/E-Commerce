import type { CheckoutQuoteInput, DeliveryMethod } from '@ecom/shared';
import { ERROR_CODES } from '@ecom/shared';
import { User, type IAddress } from '../models/user.model.js';
import { Product } from '../models/product.model.js';
import { AppError } from '../utils/AppError.js';
import { getCart, type CartOwner, type CartLine } from './cart.service.js';
import { priceCart, type PriceBreakdown, type PricingLineInput } from './pricing.service.js';
import { buildCouponLines, evaluateCoupon, type CouponEvaluation } from './coupon.service.js';

/**
 * Checkout pricing.
 *
 * `quote` is the endpoint the checkout UI calls on every step change, and it is
 * also the exact code path order creation will use in Phase 6. That is
 * deliberate: the number the customer reviews and the number they are charged
 * come from one function, so they cannot drift.
 *
 * Nothing here trusts the request. The client supplies choices — an address id,
 * a delivery speed — and every amount is recomputed from the database.
 */

export interface CheckoutIssue {
  itemId: string;
  productName: string;
  type: 'out_of_stock' | 'insufficient_stock' | 'unavailable' | 'price_changed';
  message: string;
}

export interface CheckoutQuote {
  pricing: PriceBreakdown;
  itemCount: number;
  deliveryMethod: DeliveryMethod;
  estimatedDelivery: { from: string; to: string };
  shippingAddress?: IAddress;
  coupon?: CouponEvaluation;
  issues: CheckoutIssue[];
  /** False when anything would stop the order being placed as it stands. */
  canPlaceOrder: boolean;
}

/**
 * Price the cart for checkout, and report anything blocking it.
 *
 * Issues are returned rather than thrown: the customer needs to see the totals
 * *and* what is wrong at the same time, so they can fix it without the page
 * collapsing into an error state.
 */
export async function quote(owner: CartOwner, input: CheckoutQuoteInput): Promise<CheckoutQuote> {
  const cart = await getCart(owner);

  if (cart.items.length === 0) {
    throw AppError.unprocessable('Your bag is empty', ERROR_CODES.CART_EMPTY);
  }

  const issues = collectIssues(cart.items);
  // Only sellable lines are priced. Including a broken line would quote a total
  // that could never be charged.
  const sellable = cart.items.filter((line) => !line.issue);

  const taxRates = await loadTaxRates(sellable.map((line) => line.product.id));

  const pricingLines: PricingLineInput[] = sellable.map((line) => {
    const tax = taxRates.get(line.product.id);
    return {
      key: line.itemId,
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      taxRate: tax?.taxRate ?? 0,
      taxInclusive: tax?.taxInclusive ?? true,
    };
  });

  // The coupon is re-evaluated here, against the sellable lines only — removing
  // an out-of-stock item can legitimately invalidate a coupon.
  let coupon: CouponEvaluation | undefined;
  if (cart.coupon?.code) {
    const couponLines = await buildCouponLines(
      sellable.map((line) => ({ productId: line.product.id, lineSubtotal: line.lineTotal })),
    );
    coupon = await evaluateCoupon({
      code: cart.coupon.code,
      lines: couponLines,
      userId: owner.userId,
    });
  }

  const pricing = priceCart(pricingLines, {
    ...(coupon?.valid
      ? {
          discount: {
            code: coupon.code,
            amount: coupon.discount,
            freeShipping: coupon.freeShipping,
          },
        }
      : {}),
    deliveryMethod: input.deliveryMethod,
  });

  const shippingAddress = owner.userId
    ? await resolveAddress(owner.userId, input.addressId)
    : undefined;

  return {
    pricing,
    itemCount: sellable.reduce((sum, line) => sum + line.quantity, 0),
    deliveryMethod: input.deliveryMethod,
    estimatedDelivery: estimateDelivery(input.deliveryMethod),
    shippingAddress,
    coupon,
    issues,
    // An address is required, and nothing may be blocking. Note a *price change*
    // is surfaced but does not block — the quote already reflects the new price,
    // so the customer simply needs to see it before agreeing.
    canPlaceOrder:
      sellable.length > 0 &&
      issues.every((issue) => issue.type === 'price_changed') &&
      Boolean(shippingAddress ?? input.address),
  };
}

function collectIssues(lines: CartLine[]): CheckoutIssue[] {
  const issues: CheckoutIssue[] = [];

  for (const line of lines) {
    if (line.issue === 'out_of_stock') {
      issues.push({
        itemId: line.itemId,
        productName: line.product.name,
        type: 'out_of_stock',
        message: `${line.product.name} is out of stock`,
      });
    } else if (line.issue === 'insufficient_stock') {
      issues.push({
        itemId: line.itemId,
        productName: line.product.name,
        type: 'insufficient_stock',
        message: `Only ${line.availableStock} of ${line.product.name} left — reduce the quantity to continue`,
      });
    } else if (line.issue === 'unavailable') {
      issues.push({
        itemId: line.itemId,
        productName: line.product.name,
        type: 'unavailable',
        message: `${line.product.name} is no longer available — remove it to continue`,
      });
    }

    if (line.priceChanged) {
      issues.push({
        itemId: line.itemId,
        productName: line.product.name,
        type: 'price_changed',
        message: `The price of ${line.product.name} changed to ₹${line.priceChanged.to}`,
      });
    }
  }

  return issues;
}

/** Tax settings come from the product, never from the request. */
async function loadTaxRates(productIds: string[]) {
  const products = await Product.find({ _id: { $in: productIds } })
    .select('taxRate taxInclusive')
    .lean();

  return new Map(
    products.map((product) => [
      String(product._id),
      { taxRate: product.taxRate ?? 0, taxInclusive: product.taxInclusive ?? true },
    ]),
  );
}

/**
 * Resolve the delivery address from the customer's own saved addresses.
 *
 * Looked up by user AND id, so an address id belonging to someone else resolves
 * to nothing rather than being silently accepted.
 */
async function resolveAddress(userId: string, addressId?: string): Promise<IAddress | undefined> {
  const user = await User.findById(userId).select('addresses').lean();
  if (!user) return undefined;

  // An explicitly requested id is always validated first, and only ever against
  // this user's own addresses. Whether the id belongs to somebody else or does
  // not exist at all, the answer is the same 404 — which is what stops the
  // endpoint confirming that another customer's address exists.
  if (addressId) {
    const match = user.addresses.find((address) => String(address._id) === addressId);
    if (!match) throw AppError.notFound('Address');
    return match;
  }

  if (user.addresses.length === 0) return undefined;
  return user.addresses.find((address) => address.isDefaultShipping) ?? user.addresses[0];
}

function estimateDelivery(method: DeliveryMethod): { from: string; to: string } {
  const days = method === 'express' ? [1, 2] : [3, 5];
  const addDays = (n: number) => {
    const date = new Date();
    date.setDate(date.getDate() + n);
    return date.toISOString();
  };
  return { from: addDays(days[0]!), to: addDays(days[1]!) };
}
