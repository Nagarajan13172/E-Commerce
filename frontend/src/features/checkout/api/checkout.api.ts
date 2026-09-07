import { apiDelete, apiPost } from '@/lib/apiClient';
import type { CheckoutQuoteInput, DeliveryMethod } from '@ecom/shared';
import type { Address, Cart, CouponEvaluation } from '@/types/cart';

export interface PricedLine {
  key: string;
  quantity: number;
  unitPrice: number;
  lineSubtotal: number;
  lineDiscount: number;
  lineTax: number;
  lineTotal: number;
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
  amountToFreeShipping: number;
  freeShippingThreshold: number;
}

export type { CouponEvaluation };

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
  shippingAddress?: Address;
  coupon?: CouponEvaluation;
  issues: CheckoutIssue[];
  canPlaceOrder: boolean;
}

/**
 * Ask the server what the current cart costs.
 *
 * POST, not GET: the choices that affect the price are a body, and a quote must
 * never be cached — it reflects live stock and live prices.
 */
export async function fetchQuote(input: CheckoutQuoteInput): Promise<CheckoutQuote> {
  const { quote } = await apiPost<{ quote: CheckoutQuote }>('/checkout/quote', input);
  return quote;
}

export async function applyCoupon(code: string): Promise<Cart> {
  const { cart } = await apiPost<{ cart: Cart }>('/checkout/coupon', { code });
  return cart;
}

export async function removeCoupon(): Promise<Cart> {
  const { cart } = await apiDelete<{ cart: Cart }>('/checkout/coupon');
  return cart;
}
