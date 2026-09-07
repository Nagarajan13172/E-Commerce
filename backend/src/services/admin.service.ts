import { Types } from 'mongoose';
import { escapeRegex } from '../utils/regex.js';
import {
  ERROR_CODES,
  type AdminCouponQuery,
  type AdminCustomerQuery,
  type AdminOrderQuery,
  type AdminReviewQuery,
  type CreateCouponInput,
  type InventoryQuery,
  type UpdateCouponInput,
} from '@ecom/shared';
import { Order } from '../models/order.model.js';
import { User } from '../models/user.model.js';
import { Product } from '../models/product.model.js';
import { Review } from '../models/review.model.js';
import { Coupon } from '../models/coupon.model.js';
import { Payment } from '../models/payment.model.js';
import { InventoryTransaction } from '../models/inventoryTransaction.model.js';
import { AppError } from '../utils/AppError.js';
import { revokeAllUserTokens } from './token.service.js';
import { createLogger } from '../config/logger.js';

const log = createLogger('admin');

// ── Orders ──────────────────────────────────────────────────────────────────

export async function listOrders(query: AdminOrderQuery) {
  const filter: Record<string, unknown> = {};

  if (query.status) filter.status = query.status;
  if (query.paymentStatus) filter.paymentStatus = query.paymentStatus;
  if (query.from || query.to) {
    filter.createdAt = {
      ...(query.from ? { $gte: query.from } : {}),
      ...(query.to ? { $lte: query.to } : {}),
    };
  }

  if (query.q) {
    const term = escapeRegex(query.q);
    // Support agents search by whatever the customer quotes them: an order
    // number, an email address, or a name on the delivery address.
    filter.$or = [
      { orderNumber: { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } },
      { 'shippingAddress.fullName': { $regex: term, $options: 'i' } },
    ];
  }

  const sortMap: Record<AdminOrderQuery['sort'], Record<string, 1 | -1>> = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    total_desc: { 'pricing.grandTotal': -1 },
    total_asc: { 'pricing.grandTotal': 1 },
  };

  const [items, total] = await Promise.all([
    Order.find(filter)
      .select(
        'orderNumber email status paymentStatus fulfillmentStatus pricing items shipping createdAt placedAt refundedTotal',
      )
      .sort({ ...sortMap[query.sort], _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    Order.countDocuments(filter),
  ]);

  return { items, total, page: query.page, limit: query.limit };
}

export async function getOrder(orderId: string) {
  const order = await Order.findById(orderId)
    .populate('user', 'name email phone')
    .populate('internalNotes.by', 'name')
    .lean();
  if (!order) throw AppError.notFound('Order', ERROR_CODES.ORDER_NOT_FOUND);

  const payments = await Payment.find({ order: order._id })
    .select(
      'provider providerOrderId providerPaymentId amount amountRefunded status method paidAt createdAt',
    )
    .sort({ createdAt: -1 })
    .lean();

  return { order, payments };
}

export async function updateShipping(
  orderId: string,
  input: {
    provider?: string;
    trackingNumber?: string;
    trackingUrl?: string;
    estimatedDeliveryAt?: Date;
  },
) {
  const order = await Order.findById(orderId);
  if (!order) throw AppError.notFound('Order', ERROR_CODES.ORDER_NOT_FOUND);

  // Empty strings clear a field; undefined leaves it alone.
  if (input.provider !== undefined) order.shipping.provider = input.provider || undefined;
  if (input.trackingNumber !== undefined) {
    order.shipping.trackingNumber = input.trackingNumber || undefined;
  }
  if (input.trackingUrl !== undefined) order.shipping.trackingUrl = input.trackingUrl || undefined;
  if (input.estimatedDeliveryAt) order.shipping.estimatedDeliveryAt = input.estimatedDeliveryAt;

  await order.save();
  return order;
}

/** Internal notes are staff-only and never exposed on a customer endpoint. */
export async function addOrderNote(orderId: string, note: string, actorId: string) {
  const order = await Order.findByIdAndUpdate(
    orderId,
    { $push: { internalNotes: { by: new Types.ObjectId(actorId), note, at: new Date() } } },
    { returnDocument: 'after' },
  ).populate('internalNotes.by', 'name');

  if (!order) throw AppError.notFound('Order', ERROR_CODES.ORDER_NOT_FOUND);
  return order;
}

// ── Customers ───────────────────────────────────────────────────────────────

export async function listCustomers(query: AdminCustomerQuery) {
  const filter: Record<string, unknown> = {};
  if (query.role) filter.role = query.role;
  if (query.status) filter.status = query.status;

  if (query.q) {
    const term = escapeRegex(query.q);
    filter.$or = [
      { name: { $regex: term, $options: 'i' } },
      { email: { $regex: term, $options: 'i' } },
      { phone: { $regex: term, $options: 'i' } },
    ];
  }

  const sortMap: Record<AdminCustomerQuery['sort'], Record<string, 1 | -1>> = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    name: { name: 1 },
  };

  const [items, total] = await Promise.all([
    User.find(filter)
      .select('name email phone role status emailVerifiedAt lastLoginAt createdAt')
      .sort({ ...sortMap[query.sort], _id: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    User.countDocuments(filter),
  ]);

  return { items, total, page: query.page, limit: query.limit };
}

/** A customer plus the order history a support agent actually needs. */
export async function getCustomer(userId: string) {
  const user = await User.findById(userId).lean();
  if (!user) throw AppError.notFound('Customer');

  const [orders, stats] = await Promise.all([
    Order.find({ user: userId })
      .select('orderNumber status paymentStatus pricing.grandTotal pricing.currency createdAt')
      .sort({ createdAt: -1 })
      .limit(20)
      .lean(),
    Order.aggregate<{ orders: number; spent: number }>([
      {
        $match: {
          user: new Types.ObjectId(userId),
          paymentStatus: { $in: ['paid', 'partially_refunded', 'refunded'] },
        },
      },
      {
        $group: {
          _id: null,
          orders: { $sum: 1 },
          spent: {
            $sum: { $subtract: ['$pricing.grandTotal', { $ifNull: ['$refundedTotal', 0] }] },
          },
        },
      },
    ]),
  ]);

  return {
    user,
    orders,
    stats: {
      totalOrders: stats[0]?.orders ?? 0,
      totalSpent: Math.round((stats[0]?.spent ?? 0) * 100) / 100,
      averageOrderValue: stats[0]?.orders
        ? Math.round((stats[0].spent / stats[0].orders) * 100) / 100
        : 0,
    },
  };
}

/**
 * Suspend or restore an account.
 *
 * Disabling revokes every refresh token AND bumps `tokenVersion`, so the
 * customer is signed out immediately rather than when their access token
 * happens to expire. A suspension that takes fifteen minutes to bite is not a
 * suspension.
 */
export async function updateCustomerStatus(
  userId: string,
  status: 'active' | 'disabled' | 'banned',
  actorId: string,
) {
  if (userId === actorId) {
    throw AppError.badRequest('You cannot change the status of your own account');
  }

  const user = await User.findById(userId).select('+tokenVersion');
  if (!user) throw AppError.notFound('Customer');

  user.status = status;
  if (status !== 'active') {
    user.tokenVersion += 1;
    await user.save();
    await revokeAllUserTokens(user._id, 'admin_revoked');
  } else {
    await user.save();
  }

  log.info({ userId, status, actorId }, 'Customer status changed');
  return user;
}

/**
 * Change a role.
 *
 * The self-demotion guard is not paranoia: an admin who accidentally demotes
 * themselves locks everyone out of role management, and there is no way back
 * through the UI.
 */
export async function updateCustomerRole(
  userId: string,
  role: 'customer' | 'support' | 'manager' | 'admin',
  actorId: string,
) {
  if (userId === actorId) {
    throw AppError.badRequest('You cannot change your own role');
  }

  const user = await User.findById(userId).select('+tokenVersion');
  if (!user) throw AppError.notFound('Customer');

  // Removing the last admin would leave the store unmanageable.
  if (user.role === 'admin' && role !== 'admin') {
    const admins = await User.countDocuments({ role: 'admin', status: 'active' });
    if (admins <= 1) {
      throw AppError.conflict(
        'This is the only administrator. Promote someone else first.',
        ERROR_CODES.FORBIDDEN,
      );
    }
  }

  user.role = role;
  // A privilege change must take effect at once, so existing tokens carrying
  // the old role are invalidated.
  user.tokenVersion += 1;
  await user.save();

  log.warn({ userId, role, actorId }, 'Customer role changed');
  return user;
}

// ── Inventory ───────────────────────────────────────────────────────────────

/**
 * Inventory rows, one per sellable unit (variant, or a simple product).
 *
 * Flattened in the aggregation rather than in Node, so filtering and paging
 * happen at the database.
 */
export async function listInventory(query: InventoryQuery) {
  const match: Record<string, unknown> = { deletedAt: { $exists: false } };
  if (query.q) {
    const term = escapeRegex(query.q);
    match.$or = [
      { name: { $regex: term, $options: 'i' } },
      { sku: { $regex: term, $options: 'i' } },
      { 'variants.sku': { $regex: term, $options: 'i' } },
    ];
  }

  const rowFilter: Record<string, unknown> = {};
  if (query.outOfStockOnly) rowFilter.available = 0;
  else if (query.lowStockOnly) rowFilter.$expr = { $lte: ['$available', '$lowStockThreshold'] };

  const pipeline = [
    { $match: match },
    {
      // One row per variant, or a single row for a product without variants.
      $project: {
        name: 1,
        slug: 1,
        productSku: '$sku',
        thumbnail: 1,
        status: 1,
        rows: {
          $cond: [
            { $gt: [{ $size: '$variants' }, 0] },
            {
              $map: {
                input: '$variants',
                as: 'v',
                in: {
                  variantId: '$$v._id',
                  sku: '$$v.sku',
                  label: {
                    $reduce: {
                      input: '$$v.optionValues',
                      initialValue: '',
                      in: {
                        $cond: [
                          { $eq: ['$$value', ''] },
                          '$$this.value',
                          { $concat: ['$$value', ' · ', '$$this.value'] },
                        ],
                      },
                    },
                  },
                  available: '$$v.stock.available',
                  reserved: '$$v.stock.reserved',
                  sold: '$$v.stock.sold',
                  lowStockThreshold: '$$v.stock.lowStockThreshold',
                },
              },
            },
            [
              {
                variantId: null,
                sku: '$sku',
                label: '',
                available: '$stock.available',
                reserved: '$stock.reserved',
                sold: '$stock.sold',
                lowStockThreshold: '$stock.lowStockThreshold',
              },
            ],
          ],
        },
      },
    },
    { $unwind: '$rows' },
    {
      $project: {
        _id: 0,
        productId: '$_id',
        name: 1,
        slug: 1,
        thumbnail: 1,
        status: 1,
        variantId: '$rows.variantId',
        sku: '$rows.sku',
        label: '$rows.label',
        available: '$rows.available',
        reserved: '$rows.reserved',
        sold: '$rows.sold',
        lowStockThreshold: '$rows.lowStockThreshold',
      },
    },
    ...(Object.keys(rowFilter).length ? [{ $match: rowFilter }] : []),
    {
      $facet: {
        items: [
          { $sort: { available: 1, name: 1 } },
          { $skip: (query.page - 1) * query.limit },
          { $limit: query.limit },
        ],
        total: [{ $count: 'count' }],
      },
    },
  ];

  const [result] = await Product.aggregate(pipeline as never);
  const bucket = result as { items: unknown[]; total: { count: number }[] } | undefined;

  return {
    items: bucket?.items ?? [],
    total: bucket?.total[0]?.count ?? 0,
    page: query.page,
    limit: query.limit,
  };
}

/** The audit trail for one sellable unit. */
export async function getInventoryHistory(productId: string, variantId?: string, limit = 50) {
  const filter: Record<string, unknown> = { product: new Types.ObjectId(productId) };
  if (variantId) filter.variantId = new Types.ObjectId(variantId);

  return InventoryTransaction.find(filter)
    .populate('actor', 'name')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

// ── Reviews ─────────────────────────────────────────────────────────────────

export async function listReviews(query: AdminReviewQuery) {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.status = query.status;
  if (query.reported) filter.reportedCount = { $gt: 0 };

  const [items, total] = await Promise.all([
    Review.find(filter)
      .populate('user', 'name email')
      .populate('product', 'name slug thumbnail')
      .sort(query.reported ? { reportedCount: -1, createdAt: -1 } : { createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    Review.countDocuments(filter),
  ]);

  return { items, total, page: query.page, limit: query.limit };
}

/**
 * Approve or reject a review, then refresh the product's rating.
 *
 * The rating must be recomputed from approved reviews only — a rejected review
 * that still counted towards the average would let abuse through the front door.
 */
export async function moderateReview(
  reviewId: string,
  status: 'approved' | 'rejected',
  actorId: string,
  rejectionReason?: string,
) {
  const review = await Review.findById(reviewId);
  if (!review) throw AppError.notFound('Review');

  review.status = status;
  review.moderatedBy = new Types.ObjectId(actorId);
  review.moderatedAt = new Date();
  review.rejectionReason = status === 'rejected' ? rejectionReason : undefined;
  await review.save();

  await refreshProductRating(String(review.product));
  return review;
}

export async function respondToReview(reviewId: string, text: string, actorId: string) {
  const review = await Review.findByIdAndUpdate(
    reviewId,
    { $set: { adminResponse: { text, by: new Types.ObjectId(actorId), at: new Date() } } },
    { returnDocument: 'after' },
  );
  if (!review) throw AppError.notFound('Review');
  return review;
}

export async function deleteReview(reviewId: string) {
  const review = await Review.findByIdAndDelete(reviewId);
  if (!review) throw AppError.notFound('Review');
  await refreshProductRating(String(review.product));
}

/** Recompute a product's rating from its APPROVED reviews. */
export async function refreshProductRating(productId: string): Promise<void> {
  const [stats] = await Review.aggregate<{
    average: number;
    count: number;
    buckets: { rating: number; count: number }[];
  }>([
    { $match: { product: new Types.ObjectId(productId), status: 'approved' } },
    {
      $group: {
        _id: '$rating',
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: null,
        count: { $sum: '$count' },
        average: { $avg: { $multiply: ['$_id', 1] } },
        buckets: { $push: { rating: '$_id', count: '$count' } },
      },
    },
  ]);

  // Weighted mean — the aggregation above averages distinct ratings, not
  // reviews, so it is recomputed here from the buckets.
  const buckets = [0, 0, 0, 0, 0];
  let total = 0;
  let sum = 0;
  for (const bucket of stats?.buckets ?? []) {
    buckets[bucket.rating - 1] = bucket.count;
    total += bucket.count;
    sum += bucket.rating * bucket.count;
  }

  await Product.updateOne(
    { _id: productId },
    {
      $set: {
        'rating.average': total > 0 ? Math.round((sum / total) * 10) / 10 : 0,
        'rating.count': total,
        'rating.buckets': buckets,
        reviewCount: total,
      },
    },
  );
}

// ── Coupons ─────────────────────────────────────────────────────────────────

export async function listCoupons(query: AdminCouponQuery) {
  const filter: Record<string, unknown> = {};
  if (query.q) filter.code = { $regex: escapeRegex(query.q), $options: 'i' };
  if (query.active !== undefined) filter.isActive = query.active;

  const [items, total] = await Promise.all([
    Coupon.find(filter)
      .sort({ createdAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit)
      .lean(),
    Coupon.countDocuments(filter),
  ]);

  return { items, total, page: query.page, limit: query.limit };
}

export async function createCoupon(input: CreateCouponInput, actorId: string) {
  return Coupon.create({ ...input, createdBy: new Types.ObjectId(actorId) });
}

export async function updateCoupon(couponId: string, input: UpdateCouponInput) {
  const coupon = await Coupon.findByIdAndUpdate(
    couponId,
    { $set: input },
    { returnDocument: 'after' },
  );
  if (!coupon) throw AppError.notFound('Coupon');
  return coupon;
}

/**
 * Deactivate rather than delete.
 *
 * A coupon is referenced by every order that used it, and by the redemption
 * ledger that enforces per-user limits. Deleting the row would orphan both.
 */
export async function deactivateCoupon(couponId: string) {
  const coupon = await Coupon.findByIdAndUpdate(
    couponId,
    { $set: { isActive: false } },
    { returnDocument: 'after' },
  );
  if (!coupon) throw AppError.notFound('Coupon');
  return coupon;
}

// ── Payments ────────────────────────────────────────────────────────────────

export async function listPayments(page = 1, limit = 20) {
  const [items, total] = await Promise.all([
    Payment.find()
      .populate('order', 'orderNumber status')
      .populate('user', 'name email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Payment.countDocuments(),
  ]);

  return { items, total, page, limit };
}
