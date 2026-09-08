import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../helpers/db.js';
import { createApiAgent, type ApiAgent } from '../helpers/api.js';
import { makeProduct, makeUser, TEST_PASSWORD } from '../helpers/factories.js';
import { createApp } from '../../src/app.js';
import { Category } from '../../src/models/category.model.js';
import { Order } from '../../src/models/order.model.js';
import { Product } from '../../src/models/product.model.js';
import { Review } from '../../src/models/review.model.js';
import { User } from '../../src/models/user.model.js';
import { Types } from 'mongoose';

useTestDatabase();

const app = createApp();

async function signInAs(role: 'admin' | 'manager' | 'support') {
  const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`;
  const user = await makeUser({ email, role });
  const agent = await createApiAgent(app);
  await agent.post('/auth/login', { email, password: TEST_PASSWORD });
  return { agent, user };
}

/** An order in a paid state, so it counts towards revenue. */
async function makePaidOrder(
  overrides: { total?: number; daysAgo?: number; refunded?: number; product?: Types.ObjectId } = {},
) {
  const at = new Date();
  at.setDate(at.getDate() - (overrides.daysAgo ?? 0));
  const total = overrides.total ?? 1000;

  const address = {
    fullName: 'T',
    phone: '1',
    line1: 'a',
    city: 'b',
    state: 'c',
    postalCode: '1',
    country: 'India',
  };

  return Order.create({
    orderNumber: `ORD-${Date.now()}-${Math.random().toString().slice(2, 8)}`,
    email: 'buyer@example.com',
    items: [
      {
        product: overrides.product ?? new Types.ObjectId(),
        productSnapshot: { name: 'Sold Thing', slug: 'sold-thing', sku: 'ST1' },
        quantity: 2,
        unitPrice: total / 2,
        lineTotal: total,
      },
    ],
    pricing: { subtotal: total, grandTotal: total, currency: 'INR' },
    shippingAddress: address,
    billingAddress: address,
    status: 'delivered',
    paymentStatus: overrides.refunded ? 'partially_refunded' : 'paid',
    refundedTotal: overrides.refunded ?? 0,
    createdAt: at,
  });
}

let admin: ApiAgent;
beforeEach(async () => {
  admin = (await signInAs('admin')).agent;
});

describe('dashboard analytics', () => {
  it('counts only realised revenue', async () => {
    await makePaidOrder({ total: 1000 });
    await makePaidOrder({ total: 2000 });

    // Neither of these has taken any money, so neither may appear in revenue.
    const address = {
      fullName: 'T',
      phone: '1',
      line1: 'a',
      city: 'b',
      state: 'c',
      postalCode: '1',
      country: 'India',
    };
    await Order.create({
      orderNumber: 'ORD-PENDING-000001',
      email: 'x@example.com',
      items: [
        {
          product: new Types.ObjectId(),
          productSnapshot: { name: 'x', slug: 'x', sku: 'x' },
          quantity: 1,
          unitPrice: 9999,
          lineTotal: 9999,
        },
      ],
      pricing: { subtotal: 9999, grandTotal: 9999, currency: 'INR' },
      shippingAddress: address,
      billingAddress: address,
      status: 'pending_payment',
      paymentStatus: 'created',
    });

    const res = await admin.get('/admin/dashboard?range=last_30_days');

    expect(res.status).toBe(200);
    // Counting the abandoned checkout would have made this 12,999.
    expect(res.body.data.summary.revenue.value).toBe(3000);
    expect(res.body.data.summary.orders.value).toBe(2);
  });

  it('subtracts refunds, so revenue is money kept', async () => {
    await makePaidOrder({ total: 5000, refunded: 2000 });

    const res = await admin.get('/admin/dashboard?range=last_30_days');
    expect(res.body.data.summary.revenue.value).toBe(3000);
  });

  it('computes average order value from realised orders', async () => {
    await makePaidOrder({ total: 1000 });
    await makePaidOrder({ total: 3000 });

    const res = await admin.get('/admin/dashboard?range=last_30_days');
    expect(res.body.data.summary.averageOrderValue.value).toBe(2000);
  });

  it('reports no change rather than an infinite one from a zero baseline', async () => {
    await makePaidOrder({ total: 1000 });

    const res = await admin.get('/admin/dashboard?range=today');
    // A first sale is not a "+100%" or "+∞%" increase; it has no baseline.
    expect(res.body.data.summary.revenue.previous).toBe(0);
    expect(res.body.data.summary.revenue.changePercent).toBeNull();
  });

  it('compares against the preceding window of equal length', async () => {
    await makePaidOrder({ total: 1000, daysAgo: 1 }); // in last_7_days
    await makePaidOrder({ total: 500, daysAgo: 10 }); // in the window before

    const res = await admin.get('/admin/dashboard?range=last_7_days');
    expect(res.body.data.summary.revenue.value).toBe(1000);
    expect(res.body.data.summary.revenue.previous).toBe(500);
    expect(res.body.data.summary.revenue.changePercent).toBe(100);
  });

  it('fills empty days so the chart does not connect across gaps', async () => {
    await makePaidOrder({ total: 1000, daysAgo: 3 });

    const res = await admin.get('/admin/dashboard?range=last_7_days');
    const series = res.body.data.salesByDay;

    expect(series).toHaveLength(7);
    // Days with no sales are present with zero, not omitted.
    expect(series.filter((d: { revenue: number }) => d.revenue === 0).length).toBe(6);
  });

  it('buckets a sale on the day it happened, and ends the series on today', async () => {
    await makePaidOrder({ total: 1000 });

    const res = await admin.get('/admin/dashboard?range=last_7_days');
    const series: { date: string; revenue: number }[] = res.body.data.salesByDay;

    // The LOCAL calendar day, not toISOString(): east of UTC those differ for
    // most of the day, and the grouping must agree with the fill.
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;

    // Regression: the series used to be keyed in UTC while its bounds were
    // local midnights, so today's bucket was never emitted at all and every
    // figure sat one day early. The chart read as a flat zero line while the
    // summary above it showed real revenue.
    expect(series.at(-1)?.date).toBe(today);
    expect(series.find((d) => d.date === today)?.revenue).toBe(1000);
    expect(series.reduce((sum, d) => sum + d.revenue, 0)).toBe(1000);
  });

  it('attributes a sale to one category only, so the mix sums to revenue', async () => {
    // A product filed under two categories must not contribute its line total
    // to both — the pie would then exceed the revenue printed above it.
    const root = await Category.create({
      name: 'Home',
      slug: 'home-mix',
      path: 'home-mix',
      level: 0,
      ancestors: [],
    });
    const leaf = await Category.create({
      name: 'Kitchen',
      slug: 'kitchen-mix',
      path: 'home-mix/kitchen-mix',
      level: 1,
      parent: root._id,
      ancestors: [root._id],
    });
    const other = await Category.create({
      name: 'Gifting',
      slug: 'gifting-mix',
      path: 'gifting-mix',
      level: 0,
      ancestors: [],
    });

    const product = await makeProduct({ category: { _id: leaf._id, ancestors: [root._id] } });
    product.categories.push(other._id);
    await product.save();

    await makePaidOrder({ total: 4000, product: product._id });

    const res = await admin.get('/admin/dashboard?range=last_30_days');
    const mix: { _id: string; revenue: number }[] = res.body.data.salesByCategory;

    expect(mix.reduce((sum, row) => sum + row.revenue, 0)).toBe(4000);
    // Rolled up to the top of the tree, not reported as the leaf.
    expect(mix.map((row) => row._id)).toEqual(['Home']);
  });

  it('rejects a custom range without dates', async () => {
    const res = await admin.get('/admin/dashboard?range=custom');
    expect(res.status).toBe(422);
  });
});

describe('order management', () => {
  it('offers only legal next statuses', async () => {
    const order = await makePaidOrder();
    await Order.updateOne({ _id: order._id }, { $set: { status: 'confirmed' } });

    const res = await admin.get(`/admin/orders/${order._id}`);

    // The UI renders these directly, so an illegal transition is never offered.
    expect(res.body.data.allowedTransitions).toEqual(['processing', 'cancelled']);
  });

  it('refuses an illegal transition even if asked directly', async () => {
    const order = await makePaidOrder();
    await Order.updateOne({ _id: order._id }, { $set: { status: 'confirmed' } });

    const res = await admin.patch(`/admin/orders/${order._id}/status`, { status: 'delivered' });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('INVALID_STATE_TRANSITION');
  });

  it('records tracking details', async () => {
    const order = await makePaidOrder();

    const res = await admin.patch(`/admin/orders/${order._id}/shipping`, {
      provider: 'Bluedart',
      trackingNumber: 'BD123456789',
    });

    expect(res.body.data.order.shipping.trackingNumber).toBe('BD123456789');
  });

  it('keeps internal notes off the customer endpoint', async () => {
    const customer = await signInAs('support');
    const order = await makePaidOrder();
    await Order.updateOne(
      { _id: order._id },
      { $set: { user: customer.user._id, status: 'confirmed' } },
    );

    await admin.post(`/admin/orders/${order._id}/notes`, { note: 'Customer called twice' });

    // The customer-facing order response must not carry staff notes.
    const asCustomer = await customer.agent.get(`/orders/${order.orderNumber}`);
    expect(JSON.stringify(asCustomer.body)).not.toContain('Customer called twice');
  });
});

describe('customer management', () => {
  it('signs a customer out immediately when their account is disabled', async () => {
    const email = `victim-${Date.now()}@example.com`;
    const victim = await makeUser({ email });
    const victimAgent = await createApiAgent(app);
    await victimAgent.post('/auth/login', { email, password: TEST_PASSWORD });
    expect((await victimAgent.get('/auth/me')).status).toBe(200);

    await admin.patch(`/admin/customers/${victim._id}/status`, { status: 'disabled' });

    // Not "when their token expires" — on the very next request.
    const after = await victimAgent.get('/auth/me');
    expect(after.status).toBe(403);
    expect(after.body.code).toBe('ACCOUNT_DISABLED');
  });

  it('refuses to let an admin change their own role or status', async () => {
    const me = await User.findOne({ role: 'admin' }).lean();

    // Guards against locking everyone out of role management by accident.
    const role = await admin.patch(`/admin/customers/${me!._id}/role`, { role: 'customer' });
    expect(role.status).toBe(400);

    const status = await admin.patch(`/admin/customers/${me!._id}/status`, { status: 'disabled' });
    expect(status.status).toBe(400);
  });

  it('refuses to demote the last remaining admin', async () => {
    const other = await signInAs('admin');
    const me = await User.findOne({ role: 'admin' }).sort({ createdAt: 1 }).lean();

    // Two admins exist, so demoting one is fine.
    expect(
      (await other.agent.patch(`/admin/customers/${me!._id}/role`, { role: 'manager' })).status,
    ).toBe(200);

    // Now only one remains, and it must not be demotable.
    const admins = await User.find({ role: 'admin', status: 'active' }).lean();
    expect(admins).toHaveLength(1);
  });

  it('summarises a customer lifetime value', async () => {
    const customer = await makeUser({ email: `ltv-${Date.now()}@example.com` });
    const a = await makePaidOrder({ total: 1000 });
    const b = await makePaidOrder({ total: 3000 });
    await Order.updateMany({ _id: { $in: [a._id, b._id] } }, { $set: { user: customer._id } });

    const res = await admin.get(`/admin/customers/${customer._id}`);

    expect(res.body.data.stats.totalOrders).toBe(2);
    expect(res.body.data.stats.totalSpent).toBe(4000);
    expect(res.body.data.stats.averageOrderValue).toBe(2000);
  });
});

describe('inventory management', () => {
  it('lists one row per sellable unit', async () => {
    await makeProduct({
      name: 'Multi Variant',
      price: 100,
      variants: [
        { color: 'Black', available: 5 },
        { color: 'White', available: 0 },
      ],
    });
    await makeProduct({ name: 'Simple', price: 100, stock: 7 });

    const res = await admin.get('/admin/inventory');

    // Two variants plus one simple product.
    expect(res.body.data.items).toHaveLength(3);
  });

  it('filters to what is actually out of stock', async () => {
    await makeProduct({
      name: 'Partly Out',
      price: 100,
      variants: [
        { color: 'Black', available: 5 },
        { color: 'White', available: 0 },
      ],
    });

    const res = await admin.get('/admin/inventory?outOfStockOnly=1');
    expect(res.body.data.items).toHaveLength(1);
    expect(res.body.data.items[0].available).toBe(0);
  });

  it('adjusts stock and records who did it', async () => {
    const product = await makeProduct({ name: 'Adjustable', price: 100, stock: 10 });

    const res = await admin.post('/admin/inventory/adjust', {
      productId: String(product._id),
      delta: 5,
      note: 'Stock take correction',
    });

    expect(res.status).toBe(200);
    expect(res.body.data.stock.available).toBe(15);

    const history = await admin.get(`/admin/inventory/${product._id}/history`);
    expect(history.body.data.items[0].type).toBe('adjustment');
    expect(history.body.data.items[0].note).toBe('Stock take correction');
    // The ledger names the person, which is the point of an audit trail.
    expect(history.body.data.items[0].actor).toBeTruthy();
  });

  it('refuses an adjustment that would drive stock negative', async () => {
    const product = await makeProduct({ name: 'Scarce', price: 100, stock: 3 });

    const res = await admin.post('/admin/inventory/adjust', {
      productId: String(product._id),
      delta: -10,
    });

    expect(res.status).toBe(422);
    const after = await Product.findById(product._id).lean();
    expect(after!.stock.available).toBe(3);
  });
});

describe('review moderation', () => {
  async function makeReview(
    productId: Types.ObjectId,
    rating: number,
    status: 'pending' | 'approved' | 'rejected' = 'pending',
  ) {
    const user = await makeUser({
      email: `reviewer-${Math.random().toString(36).slice(2, 9)}@example.com`,
    });
    return Review.create({
      user: user._id,
      product: productId,
      order: new Types.ObjectId(),
      rating,
      comment: 'A perfectly ordinary review of this product.',
      status,
    });
  }

  it('excludes rejected reviews from the product rating', async () => {
    const product = await makeProduct({ name: 'Reviewed', price: 100, stock: 5 });
    const good = await makeReview(product._id, 5);
    const bad = await makeReview(product._id, 1);

    await admin.patch(`/admin/reviews/${good._id}/moderate`, { status: 'approved' });
    await admin.patch(`/admin/reviews/${bad._id}/moderate`, { status: 'approved' });

    let after = await Product.findById(product._id).lean();
    expect(after!.rating.average).toBe(3);
    expect(after!.rating.count).toBe(2);

    // Rejecting the one-star review must remove it from the average, or
    // moderation would be cosmetic.
    await admin.patch(`/admin/reviews/${bad._id}/moderate`, {
      status: 'rejected',
      rejectionReason: 'Abusive language',
    });

    after = await Product.findById(product._id).lean();
    expect(after!.rating.average).toBe(5);
    expect(after!.rating.count).toBe(1);
  });

  it('publishes a response to a review', async () => {
    const product = await makeProduct({ name: 'Responded', price: 100, stock: 5 });
    const review = await makeReview(product._id, 3);

    const res = await admin.post(`/admin/reviews/${review._id}/respond`, {
      text: 'Thanks for the feedback — we have passed this to the team.',
    });

    expect(res.body.data.review.adminResponse.text).toContain('Thanks for the feedback');
  });
});

describe('coupon management', () => {
  it('requires a ceiling on a percentage coupon', async () => {
    const res = await admin.post('/admin/coupons', {
      code: 'UNCAPPED',
      type: 'percentage',
      value: 50,
      startsAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    });

    // Without maxDiscount, "50% off" has no ceiling on a large basket.
    expect(res.status).toBe(422);
    expect(JSON.stringify(res.body.errors)).toContain('maxDiscount');
  });

  it('rejects a percentage above 100', async () => {
    const res = await admin.post('/admin/coupons', {
      code: 'TOOMUCH',
      type: 'percentage',
      value: 150,
      maxDiscount: 500,
      startsAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    });

    expect(res.status).toBe(422);
  });

  it('deactivates rather than deletes', async () => {
    const created = await admin.post('/admin/coupons', {
      code: 'REMOVEME',
      type: 'fixed',
      value: 100,
      startsAt: new Date().toISOString(),
      expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    });

    await admin.delete(`/admin/coupons/${created.body.data.coupon._id}`);

    // The row survives because orders and the redemption ledger reference it.
    const list = await admin.get('/admin/coupons?q=REMOVEME');
    expect(list.body.data.items).toHaveLength(1);
    expect(list.body.data.items[0].isActive).toBe(false);
  });
});

describe('product editing', () => {
  /**
   * The rule this protects is the one the whole inventory design rests on:
   * editing a product must never be able to cause an oversell.
   *
   * `reserved` and `sold` are derived from checkout activity and are absent
   * from the update schema by design. Assigning the incoming variants array
   * straight onto the document therefore let Mongoose refill both from their
   * schema defaults — so renaming a product silently zeroed them. Losing
   * `sold` costs history; losing `reserved` frees units that an in-flight
   * checkout is holding, and they can then be sold twice.
   */
  it('keeps reserved and sold when an admin edits a product', async () => {
    const product = await makeProduct({
      name: 'Editable Thing',
      variants: [
        { color: 'Black', available: 10 },
        { color: 'White', available: 4 },
      ],
    });

    // Put the variants into a realistic mid-life state.
    product.variants[0]!.stock.reserved = 3;
    product.variants[0]!.stock.sold = 21;
    product.variants[1]!.stock.reserved = 1;
    product.variants[1]!.stock.sold = 7;
    await product.save();

    const detail = await admin.get(`/admin/products/${String(product._id)}`);
    expect(detail.status).toBe(200);

    // Exactly what the admin form sends back: available and the threshold, and
    // nothing else about stock.
    const variants = detail.body.data.product.variants.map(
      (variant: {
        _id: string;
        sku: string;
        optionValues: unknown;
        price: number;
        stock: { available: number; lowStockThreshold: number };
      }) => ({
        _id: variant._id,
        sku: variant.sku,
        optionValues: variant.optionValues,
        price: variant.price,
        stock: {
          available: variant.stock.available,
          lowStockThreshold: variant.stock.lowStockThreshold,
        },
        isActive: true,
      }),
    );

    const res = await admin.patch(`/admin/products/${String(product._id)}`, {
      name: 'Renamed Thing',
      variants,
    });
    expect(res.status).toBe(200);

    const after = await Product.findById(product._id).lean();
    expect(after?.name).toBe('Renamed Thing');
    expect(after?.variants[0]?.stock.reserved).toBe(3);
    expect(after?.variants[0]?.stock.sold).toBe(21);
    expect(after?.variants[1]?.stock.reserved).toBe(1);
    expect(after?.variants[1]?.stock.sold).toBe(7);
    // The admin still owns the numbers that are theirs to set.
    expect(after?.variants[0]?.stock.available).toBe(10);
  });

  it('ignores stock.available sent for an existing variant', async () => {
    const product = await makeProduct({
      name: 'Adjustable Thing',
      variants: [{ color: 'Blue', available: 5 }],
    });
    product.variants[0]!.stock.reserved = 2;
    await product.save();

    // The form snapshots `available` when the page loads and re-sends it on
    // every save. Honouring that writes a stale absolute value back over a
    // number reservations and ledger adjustments have since moved — inventing
    // units. Stock belongs to the inventory endpoints, which use a guarded
    // `$inc` and write an audit row.
    const variantId = String(product.variants[0]!._id);
    const res = await admin.patch(`/admin/products/${String(product._id)}`, {
      variants: [
        {
          _id: variantId,
          sku: product.variants[0]!.sku,
          optionValues: product.variants[0]!.optionValues,
          price: product.variants[0]!.price,
          stock: { available: 999, lowStockThreshold: 12 },
          isActive: true,
        },
      ],
    });
    expect(res.status).toBe(200);

    const after = await Product.findById(product._id).lean();
    expect(after?.variants[0]?.stock.available).toBe(5);
    expect(after?.variants[0]?.stock.reserved).toBe(2);
    // The threshold IS the admin's to set, so that one still applies.
    expect(after?.variants[0]?.stock.lowStockThreshold).toBe(12);
  });

  it('refuses to remove a variant that is holding reserved stock', async () => {
    const product = await makeProduct({
      name: 'Reserved Thing',
      variants: [
        { color: 'Green', available: 4 },
        { color: 'Grey', available: 6 },
      ],
    });
    product.variants[0]!.stock.reserved = 3;
    await product.save();

    // Removing this row would orphan the StockReservation that names it: the
    // later commit or release matches nothing, writes no ledger entry, and
    // raises no error, so the units vanish silently.
    const keep = product.variants[1]!;
    const res = await admin.patch(`/admin/products/${String(product._id)}`, {
      variants: [
        {
          _id: String(keep._id),
          sku: keep.sku,
          optionValues: keep.optionValues,
          price: keep.price,
          stock: { available: 6, lowStockThreshold: 5 },
          isActive: true,
        },
      ],
    });

    expect(res.status).toBe(409);
    const after = await Product.findById(product._id).lean();
    expect(after?.variants).toHaveLength(2);
    expect(after?.variants[0]?.stock.reserved).toBe(3);
  });

  it('treats an unknown variant id as a new variant rather than reviving one', async () => {
    const product = await makeProduct({
      name: 'Ghost Thing',
      variants: [{ color: 'Amber', available: 3 }],
    });
    const keep = product.variants[0]!;

    // A stale form can carry the id of a variant that has since been deleted.
    // Honouring it would resurrect the row with reserved and sold reset to
    // zero, which is a fabricated history.
    const res = await admin.patch(`/admin/products/${String(product._id)}`, {
      options: [{ name: 'Color', values: ['Amber', 'Ivory'], position: 0 }],
      variants: [
        {
          _id: String(keep._id),
          sku: keep.sku,
          optionValues: keep.optionValues,
          price: keep.price,
          stock: { available: 3, lowStockThreshold: 5 },
          isActive: true,
        },
        {
          _id: '507f1f77bcf86cd799439011',
          sku: 'GHOST-IVORY',
          optionValues: [{ name: 'Color', value: 'Ivory' }],
          price: 1200,
          stock: { available: 7, lowStockThreshold: 5 },
          isActive: true,
        },
      ],
    });
    expect(res.status).toBe(200);

    const after = await Product.findById(product._id).lean();
    expect(after?.variants).toHaveLength(2);
    const ghost = after?.variants.find((v) => v.sku === 'GHOST-IVORY');
    expect(String(ghost?._id)).not.toBe('507f1f77bcf86cd799439011');
    expect(ghost?.stock.available).toBe(7);
    expect(ghost?.stock.reserved).toBe(0);
    expect(ghost?.stock.sold).toBe(0);
  });

  it('adds a brand-new variant without an id', async () => {
    const product = await makeProduct({
      name: 'Growable Thing',
      variants: [{ color: 'Red', available: 3 }],
    });

    const existing = product.variants[0]!;
    const res = await admin.patch(`/admin/products/${String(product._id)}`, {
      options: [{ name: 'Color', values: ['Red', 'Green'], position: 0 }],
      variants: [
        {
          _id: String(existing._id),
          sku: existing.sku,
          optionValues: existing.optionValues,
          price: existing.price,
          stock: { available: 3, lowStockThreshold: 5 },
          isActive: true,
        },
        {
          sku: 'GROWABLE-GREEN',
          optionValues: [{ name: 'Color', value: 'Green' }],
          price: 1500,
          stock: { available: 8, lowStockThreshold: 5 },
          isActive: true,
        },
      ],
    });
    expect(res.status).toBe(200);

    const after = await Product.findById(product._id).lean();
    expect(after?.variants).toHaveLength(2);
    expect(after?.variants[1]?.stock.available).toBe(8);
    expect(after?.variants[1]?.stock.reserved).toBe(0);
  });
});

describe('partial updates', () => {
  /**
   * A PATCH must change only what it names.
   *
   * `updateProductSchema` was `productBaseSchema.partial()`, and Zod applies
   * `.partial()` outside `.default()` — so a body of `{ name }` arrived at the
   * service carrying `variants: []`, `status: 'draft'`, `categories: []` and
   * `images: []`. Renaming a product therefore deleted every variant (with the
   * units in-flight checkouts were holding), unpublished it, and stripped its
   * categories and images. The service's `value === undefined` guards could not
   * help: nothing was undefined.
   *
   * The test that already covered variant merging did not catch it, because it
   * sent `variants` explicitly and only asserted on stock.
   */
  it('changes only the fields a PATCH actually names', async () => {
    const category = await Category.create({
      name: 'Keepme',
      slug: 'keepme-cat',
      path: 'keepme-cat',
      level: 0,
      ancestors: [],
    });
    const product = await makeProduct({
      name: 'Untouched Thing',
      status: 'active',
      category: { _id: category._id, ancestors: [] },
      variants: [{ color: 'Black', available: 10 }],
    });
    product.variants[0]!.stock.reserved = 4;
    product.variants[0]!.stock.sold = 9;
    product.images = [{ url: 'https://example.test/a.png', alt: '', position: 0 }] as never;
    product.isFeatured = true;
    product.taxRate = 0.05;
    await product.save();

    const res = await admin.patch(`/admin/products/${String(product._id)}`, {
      name: 'Renamed Only',
    });
    expect(res.status).toBe(200);

    const after = await Product.findById(product._id).lean();
    expect(after?.name).toBe('Renamed Only');

    // Everything the request did not mention must survive untouched.
    expect(after?.variants).toHaveLength(1);
    expect(after?.variants[0]?.stock.available).toBe(10);
    expect(after?.variants[0]?.stock.reserved).toBe(4);
    expect(after?.variants[0]?.stock.sold).toBe(9);
    expect(after?.status).toBe('active');
    expect(after?.categories).toHaveLength(1);
    expect(after?.images).toHaveLength(1);
    expect(after?.isFeatured).toBe(true);
    expect(after?.taxRate).toBe(0.05);
  });

  it("leaves a variant's low-stock threshold alone when stock is omitted", async () => {
    const product = await makeProduct({
      name: 'Threshold Thing',
      variants: [{ color: 'Teal', available: 6 }],
    });
    product.variants[0]!.stock.lowStockThreshold = 25;
    await product.save();

    const variant = product.variants[0]!;
    const res = await admin.patch(`/admin/products/${String(product._id)}`, {
      variants: [
        {
          _id: String(variant._id),
          sku: variant.sku,
          optionValues: variant.optionValues,
          price: variant.price,
          isActive: true,
          // No `stock` key at all.
        },
      ],
    });
    expect(res.status).toBe(200);

    // `variantStockSchema.default(...)` sits INSIDE the array element, so
    // stripping defaults at the top level alone left it injecting
    // `{ available: 0, lowStockThreshold: 5 }` — which made the service's
    // `incoming.stock?.x ?? current.x` fallback dead code and quietly reset
    // the threshold on any request that omitted stock.
    const after = await Product.findById(product._id).lean();
    expect(after?.variants[0]?.stock.lowStockThreshold).toBe(25);
    expect(after?.variants[0]?.stock.available).toBe(6);
  });

  it('still applies an explicit empty array when one is sent', async () => {
    const product = await makeProduct({
      name: 'Clearable Thing',
      variants: [{ color: 'Red', available: 2 }],
    });

    // Absence means "leave alone"; an explicit [] means "clear it". The fix
    // must not have turned the second into the first.
    const res = await admin.patch(`/admin/products/${String(product._id)}`, { tags: [] });
    expect(res.status).toBe(200);

    const after = await Product.findById(product._id).lean();
    expect(after?.tags).toEqual([]);
    expect(after?.variants).toHaveLength(1);
  });

  it("leaves a category's position and status alone when only the name changes", async () => {
    const category = await Category.create({
      name: 'Ordered',
      slug: 'ordered-cat',
      path: 'ordered-cat',
      level: 0,
      ancestors: [],
      order: 7,
      status: 'inactive',
      isFeatured: true,
    });

    const res = await admin.patch(`/admin/categories/${String(category._id)}`, {
      name: 'Renamed Category',
    });
    expect(res.status).toBe(200);

    const after = await Category.findById(category._id).lean();
    expect(after?.name).toBe('Renamed Category');
    // Renaming used to reset order to 0, reviving it to the top of the tree,
    // and re-activate a deliberately hidden category.
    expect(after?.order).toBe(7);
    expect(after?.status).toBe('inactive');
    expect(after?.isFeatured).toBe(true);
  });
});
