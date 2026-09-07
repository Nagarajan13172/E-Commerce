import { Types } from 'mongoose';
import { ERROR_CODES, type CouponRejection } from '@ecom/shared';
import { Coupon, type CouponDocument } from '../models/coupon.model.js';
import { CouponRedemption } from '../models/couponRedemption.model.js';
import { Order } from '../models/order.model.js';
import { Product } from '../models/product.model.js';
import { AppError } from '../utils/AppError.js';
import { toMajor, toMinor } from './pricing.service.js';

/**
 * Coupon validation.
 *
 * Every rule is enforced here, server-side, on every price calculation — not
 * once when the code is typed. A coupon that was valid when it was applied can
 * become invalid before checkout: it can expire, hit its usage limit, or stop
 * qualifying because the customer removed the one item it applied to. Re-checking
 * on each quote is what stops a stale discount reaching the charge.
 */

export interface CouponLine {
  productId: string;
  /** Line subtotal in rupees. */
  lineSubtotal: number;
  categoryPath: string[];
  brandId?: string;
}

export interface CouponEvaluation {
  valid: boolean;
  code: string;
  /** Discount in rupees. Zero for a free-shipping coupon. */
  discount: number;
  freeShipping: boolean;
  description?: string;
  rejection?: CouponRejection;
  message?: string;
}

const REJECTION_MESSAGES: Record<CouponRejection, string> = {
  not_found: 'That coupon code is not recognised',
  inactive: 'That coupon is no longer available',
  not_started: 'That coupon is not active yet',
  expired: 'That coupon has expired',
  min_order_not_met: 'Your order does not meet the minimum for this coupon',
  usage_limit_reached: 'That coupon has been fully redeemed',
  per_user_limit_reached: 'You have already used this coupon',
  not_applicable: 'That coupon does not apply to anything in your bag',
  first_order_only: 'That coupon is for first orders only',
};

function reject(code: string, rejection: CouponRejection, override?: string): CouponEvaluation {
  return {
    valid: false,
    code,
    discount: 0,
    freeShipping: false,
    rejection,
    message: override ?? REJECTION_MESSAGES[rejection],
  };
}

/**
 * Evaluate a coupon against a specific cart and customer.
 *
 * Returns an evaluation rather than throwing, because an invalid coupon is a
 * normal outcome the checkout has to render alongside a still-valid total — not
 * an error that should abort pricing the cart.
 */
export async function evaluateCoupon(params: {
  code: string;
  lines: CouponLine[];
  userId?: string;
}): Promise<CouponEvaluation> {
  const code = params.code.trim().toUpperCase();
  const coupon = await Coupon.findOne({ code });

  if (!coupon) return reject(code, 'not_found');
  if (!coupon.isActive) return reject(code, 'inactive');

  const now = Date.now();
  if (coupon.startsAt.getTime() > now) return reject(code, 'not_started');
  if (coupon.expiresAt.getTime() < now) return reject(code, 'expired');

  // ── Which lines this coupon actually covers ───────────────────────────────
  const eligibleLines = params.lines.filter((line) => isLineEligible(coupon, line));
  if (eligibleLines.length === 0) return reject(code, 'not_applicable');

  const eligibleSubtotalMinor = eligibleLines.reduce(
    (sum, line) => sum + toMinor(line.lineSubtotal),
    0,
  );

  // The minimum is measured against the WHOLE bag, which is what a customer
  // reads "on orders over ₹999" to mean — not against the eligible subset.
  const cartSubtotalMinor = params.lines.reduce((sum, line) => sum + toMinor(line.lineSubtotal), 0);
  if (cartSubtotalMinor < toMinor(coupon.minOrderValue)) {
    return reject(
      code,
      'min_order_not_met',
      `Spend ₹${(coupon.minOrderValue - toMajor(cartSubtotalMinor)).toFixed(0)} more to use this coupon`,
    );
  }

  // ── Usage limits ──────────────────────────────────────────────────────────
  // `usedCount` is a fast pre-check for the UI. The authoritative guard is the
  // conditional $inc inside the order transaction, which is what actually makes
  // the limit race-proof.
  if (coupon.usageLimit !== undefined && coupon.usedCount >= coupon.usageLimit) {
    return reject(code, 'usage_limit_reached');
  }

  if (params.userId) {
    const userRedemptions = await CouponRedemption.countDocuments({
      coupon: coupon._id,
      user: params.userId,
    });
    if (userRedemptions >= coupon.perUserLimit) return reject(code, 'per_user_limit_reached');

    if (coupon.firstOrderOnly) {
      const hasOrdered = await Order.exists({
        user: params.userId,
        status: { $nin: ['pending_payment', 'payment_failed', 'expired', 'cancelled'] },
      });
      if (hasOrdered) return reject(code, 'first_order_only');
    }

    // A coupon restricted to named customers.
    if (coupon.appliesTo.users.length > 0) {
      const allowed = coupon.appliesTo.users.some((id) => String(id) === params.userId);
      if (!allowed) return reject(code, 'not_applicable');
    }
  } else if (coupon.firstOrderOnly || coupon.appliesTo.users.length > 0) {
    // These rules need an identity to evaluate, so a guest cannot satisfy them.
    return reject(code, 'not_applicable', 'Sign in to use this coupon');
  }

  // ── Discount ──────────────────────────────────────────────────────────────
  const discountMinor = computeDiscountMinor(coupon, eligibleSubtotalMinor);

  return {
    valid: true,
    code,
    discount: toMajor(discountMinor),
    freeShipping: coupon.type === 'free_shipping',
    description: coupon.description,
  };
}

/**
 * A line qualifies when it matches the inclusion rules and hits no exclusion.
 *
 * Empty inclusion arrays mean "everything", which is the common case; a coupon
 * with no restrictions applies to the whole bag.
 */
function isLineEligible(coupon: CouponDocument, line: CouponLine): boolean {
  const { appliesTo, excludes } = coupon;

  if (excludes.products.some((id) => String(id) === line.productId)) return false;
  if (excludes.categories.some((id) => line.categoryPath.includes(String(id)))) return false;

  const hasProductRule = appliesTo.products.length > 0;
  const hasCategoryRule = appliesTo.categories.length > 0;
  const hasBrandRule = appliesTo.brands.length > 0;

  if (!hasProductRule && !hasCategoryRule && !hasBrandRule) return true;

  // Inclusion rules are OR'd: matching any one of them qualifies the line.
  if (hasProductRule && appliesTo.products.some((id) => String(id) === line.productId)) return true;
  if (
    hasCategoryRule &&
    appliesTo.categories.some((id) => line.categoryPath.includes(String(id)))
  ) {
    return true;
  }
  if (hasBrandRule && line.brandId && appliesTo.brands.some((id) => String(id) === line.brandId)) {
    return true;
  }

  return false;
}

function computeDiscountMinor(coupon: CouponDocument, eligibleSubtotalMinor: number): number {
  switch (coupon.type) {
    case 'percentage': {
      const raw = Math.round((eligibleSubtotalMinor * coupon.value) / 100);
      // The cap is what stops "50% off" costing unbounded amounts on a large
      // basket — without it a percentage coupon has no ceiling.
      const capped = coupon.maxDiscount ? Math.min(raw, toMinor(coupon.maxDiscount)) : raw;
      return Math.min(capped, eligibleSubtotalMinor);
    }
    case 'fixed':
      // Never discount more than the eligible goods are worth.
      return Math.min(toMinor(coupon.value), eligibleSubtotalMinor);
    case 'free_shipping':
      // The benefit is applied to shipping by PricingService, not to goods.
      return 0;
    default:
      return 0;
  }
}

/** Coupons a customer can browse on the offers page. */
export async function listPublicCoupons() {
  const now = new Date();
  return Coupon.find({
    isActive: true,
    startsAt: { $lte: now },
    expiresAt: { $gte: now },
    // Coupons targeted at specific customers are not advertised publicly.
    'appliesTo.users': { $size: 0 },
  })
    .select('code description type value minOrderValue maxDiscount expiresAt firstOrderOnly')
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();
}

/**
 * Build the per-line data a coupon needs, from cart lines.
 *
 * Category and brand come from the product, never from the request — otherwise
 * a client could claim its cart contained an item the coupon covers.
 */
export async function buildCouponLines(
  items: { productId: string; lineSubtotal: number }[],
): Promise<CouponLine[]> {
  if (items.length === 0) return [];

  const products = await Product.find({
    _id: { $in: items.map((item) => new Types.ObjectId(item.productId)) },
  })
    .select('categoryPath brand')
    .lean();

  const byId = new Map(products.map((product) => [String(product._id), product]));

  return items.map((item) => {
    const product = byId.get(item.productId);
    return {
      productId: item.productId,
      lineSubtotal: item.lineSubtotal,
      categoryPath: (product?.categoryPath ?? []).map(String),
      brandId: product?.brand ? String(product.brand) : undefined,
    };
  });
}

/** Raised when a coupon must genuinely block progress (e.g. at order creation). */
export function couponError(evaluation: CouponEvaluation): AppError {
  const codeMap: Partial<Record<CouponRejection, keyof typeof ERROR_CODES>> = {
    expired: 'COUPON_EXPIRED',
    usage_limit_reached: 'COUPON_USAGE_EXCEEDED',
    per_user_limit_reached: 'COUPON_USAGE_EXCEEDED',
    min_order_not_met: 'COUPON_MIN_ORDER_NOT_MET',
    not_applicable: 'COUPON_NOT_APPLICABLE',
  };
  const errorCode = evaluation.rejection ? codeMap[evaluation.rejection] : undefined;

  return AppError.unprocessable(
    evaluation.message ?? 'That coupon cannot be used',
    ERROR_CODES[errorCode ?? 'COUPON_INVALID'],
  );
}
