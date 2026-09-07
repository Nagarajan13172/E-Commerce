import { Types } from 'mongoose';
import type { AnalyticsQuery, AnalyticsRange } from '@ecom/shared';
import { Order } from '../models/order.model.js';
import { User } from '../models/user.model.js';
import { Product } from '../models/product.model.js';

/**
 * Dashboard analytics.
 *
 * Two decisions shape every figure here:
 *
 * 1. **Only realised revenue counts.** An order sitting in `pending_payment`
 *    has taken no money and may never do so; counting it would make the
 *    dashboard flatter every abandoned checkout. Refunds are subtracted, so
 *    revenue is what the business actually kept.
 *
 * 2. **Everything is computed in MongoDB.** Loading orders into Node to sum
 *    them works on a seeded database and falls over on a real one.
 */

/** Statuses where money has genuinely been taken. */
const REVENUE_STATUSES = [
  'confirmed',
  'processing',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'returned',
  'refunded',
];

export interface DateWindow {
  from: Date;
  to: Date;
}

/**
 * The calendar every daily figure is bucketed by.
 *
 * This has to be stated once and used on BOTH sides of the daily series, or the
 * chart silently lies. The window boundaries are local midnights, so grouping
 * with an unqualified `$dateToString` (which is UTC) put a +05:30 server's
 * orders in the wrong bucket and dropped today's entirely — the chart read as a
 * flat zero line while the summary above it showed real revenue.
 *
 * An IANA name rather than a fixed offset, so the buckets stay correct across a
 * daylight-saving boundary.
 */
const TIMEZONE = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

/** `YYYY-MM-DD` for a date's LOCAL calendar day — never `toISOString`, which is UTC. */
function localDayKey(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/**
 * Resolve a range preset into concrete dates, plus the equally-long window
 * immediately before it.
 *
 * The previous window is what makes a number meaningful: "₹2.4L revenue" says
 * little on its own, while "₹2.4L, up 12%" says whether the week went well.
 */
export function resolveWindow(query: AnalyticsQuery): {
  current: DateWindow;
  previous: DateWindow;
} {
  const now = new Date();
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const endOfDay = (d: Date) =>
    new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
  const daysAgo = (n: number) => {
    const d = new Date(now);
    d.setDate(d.getDate() - n);
    return d;
  };

  let current: DateWindow;

  switch (query.range as AnalyticsRange) {
    case 'today':
      current = { from: startOfDay(now), to: endOfDay(now) };
      break;
    case 'yesterday':
      current = { from: startOfDay(daysAgo(1)), to: endOfDay(daysAgo(1)) };
      break;
    case 'last_7_days':
      current = { from: startOfDay(daysAgo(6)), to: endOfDay(now) };
      break;
    case 'this_month':
      current = { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(now) };
      break;
    case 'last_month':
      current = {
        from: new Date(now.getFullYear(), now.getMonth() - 1, 1),
        to: new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999),
      };
      break;
    case 'custom':
      current = { from: startOfDay(query.from!), to: endOfDay(query.to!) };
      break;
    case 'last_30_days':
    default:
      current = { from: startOfDay(daysAgo(29)), to: endOfDay(now) };
      break;
  }

  // The comparison window is the same length, ending where this one begins.
  const span = current.to.getTime() - current.from.getTime();
  const previous: DateWindow = {
    from: new Date(current.from.getTime() - span - 1),
    to: new Date(current.from.getTime() - 1),
  };

  return { current, previous };
}

function revenueMatch(window: DateWindow) {
  return {
    status: { $in: REVENUE_STATUSES },
    paymentStatus: { $in: ['paid', 'partially_refunded', 'refunded'] },
    createdAt: { $gte: window.from, $lte: window.to },
  };
}

export interface MetricWithChange {
  value: number;
  previous: number;
  /** Percentage change, or null when the previous period was zero. */
  changePercent: number | null;
}

function withChange(value: number, previous: number): MetricWithChange {
  return {
    value: Math.round(value * 100) / 100,
    previous: Math.round(previous * 100) / 100,
    // Percentage change from zero is undefined, not infinite — showing "+∞%"
    // or "+100%" for a first sale would both be misleading.
    changePercent: previous === 0 ? null : Math.round(((value - previous) / previous) * 100),
  };
}

export interface DashboardSummary {
  revenue: MetricWithChange;
  orders: MetricWithChange;
  averageOrderValue: MetricWithChange;
  unitsSold: MetricWithChange;
  newCustomers: MetricWithChange;
  /** Not time-bounded — these describe the catalog as it stands now. */
  totals: { products: number; customers: number; pendingOrders: number; lowStock: number };
}

export async function getSummary(query: AnalyticsQuery): Promise<DashboardSummary> {
  const { current, previous } = resolveWindow(query);

  const [currentTotals, previousTotals, currentCustomers, previousCustomers, totals] =
    await Promise.all([
      aggregateTotals(current),
      aggregateTotals(previous),
      User.countDocuments({
        role: 'customer',
        createdAt: { $gte: current.from, $lte: current.to },
      }),
      User.countDocuments({
        role: 'customer',
        createdAt: { $gte: previous.from, $lte: previous.to },
      }),
      catalogTotals(),
    ]);

  return {
    revenue: withChange(currentTotals.revenue, previousTotals.revenue),
    orders: withChange(currentTotals.orders, previousTotals.orders),
    averageOrderValue: withChange(
      currentTotals.orders > 0 ? currentTotals.revenue / currentTotals.orders : 0,
      previousTotals.orders > 0 ? previousTotals.revenue / previousTotals.orders : 0,
    ),
    unitsSold: withChange(currentTotals.units, previousTotals.units),
    newCustomers: withChange(currentCustomers, previousCustomers),
    totals,
  };
}

async function aggregateTotals(window: DateWindow) {
  const [result] = await Order.aggregate<{
    revenue: number;
    orders: number;
    units: number;
  }>([
    { $match: revenueMatch(window) },
    {
      $group: {
        _id: null,
        // Refunds are subtracted, so this is money kept rather than money taken.
        revenue: {
          $sum: { $subtract: ['$pricing.grandTotal', { $ifNull: ['$refundedTotal', 0] }] },
        },
        orders: { $sum: 1 },
        units: { $sum: { $sum: '$items.quantity' } },
      },
    },
  ]);

  return { revenue: result?.revenue ?? 0, orders: result?.orders ?? 0, units: result?.units ?? 0 };
}

async function catalogTotals() {
  const [products, customers, pendingOrders, lowStock] = await Promise.all([
    Product.countDocuments({ status: 'active', deletedAt: { $exists: false } }),
    User.countDocuments({ role: 'customer' }),
    // What needs a human today.
    Order.countDocuments({ status: { $in: ['confirmed', 'processing', 'packed'] } }),
    countLowStock(),
  ]);

  return { products, customers, pendingOrders, lowStock };
}

/** Products where any sellable unit is at or below its threshold. */
export async function countLowStock(): Promise<number> {
  return Product.countDocuments({
    status: 'active',
    deletedAt: { $exists: false },
    $or: [
      {
        $expr: {
          $anyElementTrue: {
            $map: {
              input: '$variants',
              as: 'v',
              in: {
                $and: [
                  { $eq: ['$$v.isActive', true] },
                  { $lte: ['$$v.stock.available', '$$v.stock.lowStockThreshold'] },
                ],
              },
            },
          },
        },
      },
      {
        variants: { $size: 0 },
        $expr: { $lte: ['$stock.available', '$stock.lowStockThreshold'] },
      },
    ],
  });
}

/**
 * Revenue per day, with empty days filled in.
 *
 * A chart that silently omits days with no sales draws a misleading line —
 * points get connected across gaps and a flat week looks like steady trade.
 */
export async function getSalesByDay(query: AnalyticsQuery) {
  const { current } = resolveWindow(query);

  const rows = await Order.aggregate<{ _id: string; revenue: number; orders: number }>([
    { $match: revenueMatch(current) },
    {
      $group: {
        _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: TIMEZONE } },
        revenue: {
          $sum: { $subtract: ['$pricing.grandTotal', { $ifNull: ['$refundedTotal', 0] }] },
        },
        orders: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);

  const byDay = new Map(rows.map((row) => [row._id, row]));
  const series: { date: string; revenue: number; orders: number }[] = [];

  // Walk local calendar days rather than adding 24h to a timestamp: the last
  // day of the window is the one containing `current.to`, and it must be
  // emitted even though `to` is its final millisecond.
  const cursor = new Date(
    current.from.getFullYear(),
    current.from.getMonth(),
    current.from.getDate(),
  );
  const last = localDayKey(current.to);

  for (;;) {
    const key = localDayKey(cursor);
    const row = byDay.get(key);
    series.push({ date: key, revenue: row?.revenue ?? 0, orders: row?.orders ?? 0 });
    if (key === last) break;
    cursor.setDate(cursor.getDate() + 1);
  }

  return series;
}

/**
 * Best sellers for the period.
 *
 * Grouped by the order's product *snapshot* rather than by a join, so a product
 * renamed or deleted since the sale still appears under the name it was sold as.
 */
export async function getTopProducts(query: AnalyticsQuery, limit = 8) {
  const { current } = resolveWindow(query);

  return Order.aggregate<{
    _id: Types.ObjectId;
    name: string;
    slug: string;
    thumbnail?: string;
    units: number;
    revenue: number;
  }>([
    { $match: revenueMatch(current) },
    { $unwind: '$items' },
    {
      $group: {
        _id: '$items.product',
        name: { $first: '$items.productSnapshot.name' },
        slug: { $first: '$items.productSnapshot.slug' },
        thumbnail: { $first: '$items.productSnapshot.thumbnail' },
        units: { $sum: '$items.quantity' },
        revenue: { $sum: '$items.lineTotal' },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: limit },
  ]);
}

/**
 * Revenue split by top-level category, for the mix chart.
 *
 * Two things this deliberately does NOT do:
 *
 * - It does not unwind every category a product belongs to. A product filed
 *   under both "Home" and "Kitchen" would then contribute its full line total
 *   to each, and the slices would sum to more than the revenue figure printed
 *   directly above the chart. Revenue is attributed wholly to the product's
 *   FIRST category — its primary one — so the mix always totals correctly.
 *
 * - It does not group by the leaf category. "Air Fryers" and "Kettles" as
 *   separate slices is noise; the useful question at dashboard level is how
 *   much of the month came from Home versus Beauty. `ancestors[0]` is the root
 *   of the category's tree, falling back to the category itself when it is
 *   already top-level.
 */
export async function getSalesByCategory(query: AnalyticsQuery) {
  const { current } = resolveWindow(query);

  return Order.aggregate<{ _id: string; revenue: number; units: number }>([
    { $match: revenueMatch(current) },
    { $unwind: '$items' },
    {
      $lookup: {
        from: 'products',
        localField: 'items.product',
        foreignField: '_id',
        as: 'product',
        pipeline: [{ $project: { categories: 1 } }],
      },
    },
    { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'categories',
        localField: 'product.categories.0',
        foreignField: '_id',
        as: 'category',
        pipeline: [{ $project: { name: 1, ancestors: 1 } }],
      },
    },
    { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: 'categories',
        // `ancestors` is ordered root-first, so element 0 is the top-level
        // category. Empty for a category that is already top-level, in which
        // case the fallback below keeps its own name.
        localField: 'category.ancestors.0',
        foreignField: '_id',
        as: 'root',
        pipeline: [{ $project: { name: 1 } }],
      },
    },
    { $unwind: { path: '$root', preserveNullAndEmptyArrays: true } },
    {
      $group: {
        _id: { $ifNull: ['$root.name', { $ifNull: ['$category.name', 'Uncategorised'] }] },
        revenue: { $sum: '$items.lineTotal' },
        units: { $sum: '$items.quantity' },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: 8 },
  ]);
}

export async function getRecentOrders(limit = 8) {
  return Order.find()
    .select('orderNumber status paymentStatus pricing.grandTotal pricing.currency email createdAt')
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

/** Customers ranked by lifetime realised revenue. */
export async function getTopCustomers(query: AnalyticsQuery, limit = 5) {
  const { current } = resolveWindow(query);

  return Order.aggregate<{
    _id: Types.ObjectId;
    name: string;
    email: string;
    orders: number;
    spent: number;
  }>([
    { $match: { ...revenueMatch(current), user: { $ne: null } } },
    {
      $group: {
        _id: '$user',
        email: { $first: '$email' },
        orders: { $sum: 1 },
        spent: { $sum: { $subtract: ['$pricing.grandTotal', { $ifNull: ['$refundedTotal', 0] }] } },
      },
    },
    { $sort: { spent: -1 } },
    { $limit: limit },
    {
      $lookup: {
        from: 'users',
        localField: '_id',
        foreignField: '_id',
        as: 'user',
        pipeline: [{ $project: { name: 1 } }],
      },
    },
    { $set: { name: { $ifNull: [{ $first: '$user.name' }, 'Guest'] } } },
    { $project: { user: 0 } },
  ]);
}
