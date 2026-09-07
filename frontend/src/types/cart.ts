import type { CouponRejection } from '@ecom/shared';

export interface CartLine {
  itemId: string;
  product: {
    id: string;
    name: string;
    slug: string;
    sku: string;
    thumbnail?: string;
    brandName?: string;
  };
  variant?: { id: string; sku: string; optionValues: { name: string; value: string }[] };
  quantity: number;
  unitPrice: number;
  compareAtPrice?: number;
  lineTotal: number;
  availableStock: number;
  /** Present when the live price differs from when the item was added. */
  priceChanged?: { from: number; to: number };
  /** Present when the line cannot be fulfilled as it stands. */
  issue?: 'out_of_stock' | 'insufficient_stock' | 'unavailable';
}

/**
 * The applied coupon, as the server re-evaluated it on this read.
 *
 * `valid` can be false for a coupon that was accepted earlier — it may have
 * expired, hit its limit, or stopped qualifying because the covered item was
 * removed. The UI surfaces that rather than silently dropping the discount.
 */
export interface CouponEvaluation {
  valid: boolean;
  code: string;
  discount: number;
  freeShipping: boolean;
  description?: string;
  rejection?: CouponRejection;
  message?: string;
}

export interface Cart {
  id: string | null;
  items: CartLine[];
  itemCount: number;
  subtotal: number;
  currency: string;
  hasIssues: boolean;
  coupon?: CouponEvaluation;
}

export interface Address {
  _id: string;
  label: string;
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  isDefaultShipping: boolean;
  isDefaultBilling: boolean;
}
