import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../helpers/db.js';
import { createApiAgent, type ApiAgent } from '../helpers/api.js';
import {
  makeBrand,
  makeCategory,
  makeProduct,
  makeUser,
  TEST_PASSWORD,
} from '../helpers/factories.js';
import { createApp } from '../../src/app.js';
import { Coupon } from '../../src/models/coupon.model.js';
import { CouponRedemption } from '../../src/models/couponRedemption.model.js';
import { Order } from '../../src/models/order.model.js';
import { Product } from '../../src/models/product.model.js';
import { Types } from 'mongoose';

useTestDatabase();

const app = createApp();
let api: ApiAgent;

beforeEach(async () => {
  api = await createApiAgent(app);
});

const days = (n: number) => new Date(Date.now() + n * 86_400_000);

async function makeCoupon(overrides: Record<string, unknown> = {}) {
  return Coupon.create({
    code: 'SAVE10',
    type: 'percentage',
    value: 10,
    minOrderValue: 0,
    perUserLimit: 1,
    startsAt: days(-1),
    expiresAt: days(30),
    isActive: true,
    ...overrides,
  });
}

async function signIn(email = `checkout-${Date.now()}@example.com`) {
  const user = await makeUser({ email });
  const agent = await createApiAgent(app);
  await agent.post('/auth/login', { email, password: TEST_PASSWORD });
  return { agent, user };
}

/** A saved address, so the quote can report `canPlaceOrder`. */
async function addAddress(agent: ApiAgent) {
  return agent.post('/account/addresses', {
    fullName: 'Test Shopper',
    phone: '9876543210',
    line1: '14 Brigade Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560001',
    country: 'India',
  });
}

describe('coupon application', () => {
  it('applies a percentage discount to the cart', async () => {
    const product = await makeProduct({ name: 'Coupon Widget', price: 1000, stock: 10 });
    await makeCoupon();
    await api.post('/cart/items', { productId: String(product._id), quantity: 2 });

    const res = await api.post('/checkout/coupon', { code: 'SAVE10' });

    expect(res.status).toBe(200);
    expect(res.body.data.cart.coupon.valid).toBe(true);
    expect(res.body.data.cart.coupon.discount).toBe(200);
  });

  it('caps a percentage discount at maxDiscount', async () => {
    const product = await makeProduct({ name: 'Expensive Widget', price: 50_000, stock: 5 });
    await makeCoupon({ code: 'HALF', value: 50, maxDiscount: 2000 });
    await api.post('/cart/items', { productId: String(product._id), quantity: 1 });

    const res = await api.post('/checkout/coupon', { code: 'HALF' });

    // Without the cap this coupon would cost ₹25,000 on a single order.
    expect(res.body.data.cart.coupon.discount).toBe(2000);
  });

  it('never discounts more than the basket is worth', async () => {
    const product = await makeProduct({ name: 'Cheap Widget', price: 200, stock: 5 });
    await makeCoupon({ code: 'FLAT5000', type: 'fixed', value: 5000 });
    await api.post('/cart/items', { productId: String(product._id), quantity: 1 });

    const res = await api.post('/checkout/coupon', { code: 'FLAT5000' });

    expect(res.body.data.cart.coupon.discount).toBe(200);
  });

  it('rejects an unknown code', async () => {
    const product = await makeProduct({ name: 'Widget', price: 1000, stock: 5 });
    await api.post('/cart/items', { productId: String(product._id), quantity: 1 });

    const res = await api.post('/checkout/coupon', { code: 'NOPE' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('COUPON_INVALID');
  });

  it('rejects an expired coupon', async () => {
    const product = await makeProduct({ name: 'Widget', price: 1000, stock: 5 });
    await makeCoupon({ code: 'OLD', startsAt: days(-60), expiresAt: days(-1) });
    await api.post('/cart/items', { productId: String(product._id), quantity: 1 });

    const res = await api.post('/checkout/coupon', { code: 'OLD' });

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/expired/i);
  });

  it('rejects a coupon that has not started', async () => {
    const product = await makeProduct({ name: 'Widget', price: 1000, stock: 5 });
    await makeCoupon({ code: 'SOON', startsAt: days(7), expiresAt: days(30) });
    await api.post('/cart/items', { productId: String(product._id), quantity: 1 });

    expect((await api.post('/checkout/coupon', { code: 'SOON' })).status).toBe(422);
  });

  it('enforces the minimum order value against the whole bag', async () => {
    const product = await makeProduct({ name: 'Widget', price: 500, stock: 5 });
    await makeCoupon({ code: 'BIG', minOrderValue: 2000 });
    await api.post('/cart/items', { productId: String(product._id), quantity: 1 });

    const res = await api.post('/checkout/coupon', { code: 'BIG' });

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/spend/i);
  });

  it('refuses a coupon once its global usage limit is reached', async () => {
    const product = await makeProduct({ name: 'Widget', price: 1000, stock: 5 });
    await makeCoupon({ code: 'LIMITED', usageLimit: 5, usedCount: 5 });
    await api.post('/cart/items', { productId: String(product._id), quantity: 1 });

    expect((await api.post('/checkout/coupon', { code: 'LIMITED' })).status).toBe(422);
  });

  it('refuses a coupon the customer has already used', async () => {
    const { agent, user } = await signIn();
    const product = await makeProduct({ name: 'Widget', price: 1000, stock: 5 });
    const coupon = await makeCoupon({ code: 'ONCE', perUserLimit: 1 });

    await CouponRedemption.create({
      coupon: coupon._id,
      code: 'ONCE',
      user: user._id,
      order: new Types.ObjectId(),
      discountAmount: 100,
    });

    await agent.post('/cart/items', { productId: String(product._id), quantity: 1 });
    const res = await agent.post('/checkout/coupon', { code: 'ONCE' });

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/already used/i);
  });

  it('refuses a first-order coupon to a returning customer', async () => {
    const { agent, user } = await signIn();
    const product = await makeProduct({ name: 'Widget', price: 1000, stock: 5 });
    await makeCoupon({ code: 'WELCOME', firstOrderOnly: true });

    await Order.create({
      orderNumber: `ORD-${Date.now()}`,
      user: user._id,
      email: user.email,
      items: [
        {
          product: product._id,
          productSnapshot: { name: 'Widget', slug: 'widget', sku: 'W1' },
          quantity: 1,
          unitPrice: 1000,
          lineTotal: 1000,
        },
      ],
      pricing: { subtotal: 1000, grandTotal: 1000 },
      shippingAddress: {
        fullName: 'T',
        phone: '1',
        line1: 'a',
        city: 'b',
        state: 'c',
        postalCode: '1',
        country: 'India',
      },
      billingAddress: {
        fullName: 'T',
        phone: '1',
        line1: 'a',
        city: 'b',
        state: 'c',
        postalCode: '1',
        country: 'India',
      },
      status: 'delivered',
    });

    await agent.post('/cart/items', { productId: String(product._id), quantity: 1 });
    const res = await agent.post('/checkout/coupon', { code: 'WELCOME' });

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/first order/i);
  });

  it('only discounts the products a restricted coupon covers', async () => {
    const electronics = await makeCategory('Electronics');
    const fashion = await makeCategory('Fashion');
    const covered = await makeProduct({
      name: 'Covered',
      price: 1000,
      stock: 5,
      category: electronics,
    });
    const other = await makeProduct({ name: 'Other', price: 1000, stock: 5, category: fashion });

    await makeCoupon({
      code: 'ELEC20',
      value: 20,
      appliesTo: { products: [], categories: [electronics._id], brands: [], users: [] },
    });

    await api.post('/cart/items', { productId: String(covered._id), quantity: 1 });
    await api.post('/cart/items', { productId: String(other._id), quantity: 1 });

    const res = await api.post('/checkout/coupon', { code: 'ELEC20' });

    // 20% of the ₹1,000 electronics line only — not of the ₹2,000 bag.
    expect(res.body.data.cart.coupon.discount).toBe(200);
  });

  it('rejects a coupon when nothing in the bag qualifies', async () => {
    const electronics = await makeCategory('Electronics');
    const fashion = await makeCategory('Fashion');
    const product = await makeProduct({ name: 'Shirt', price: 1000, stock: 5, category: fashion });

    await makeCoupon({
      code: 'ELECONLY',
      appliesTo: { products: [], categories: [electronics._id], brands: [], users: [] },
    });
    await api.post('/cart/items', { productId: String(product._id), quantity: 1 });

    const res = await api.post('/checkout/coupon', { code: 'ELECONLY' });

    expect(res.status).toBe(422);
    expect(res.body.message).toMatch(/does not apply/i);
  });

  it('re-evaluates a stored coupon on every cart read', async () => {
    const product = await makeProduct({ name: 'Widget', price: 3000, stock: 5 });
    const coupon = await makeCoupon({ code: 'MIN2000', minOrderValue: 2000 });
    await api.post('/cart/items', { productId: String(product._id), quantity: 1 });
    await api.post('/checkout/coupon', { code: 'MIN2000' });

    // The coupon becomes invalid without anyone touching it.
    await Coupon.updateOne({ _id: coupon._id }, { $set: { isActive: false } });

    const res = await api.get('/cart');
    // Surfaced as invalid rather than silently still discounting.
    expect(res.body.data.cart.coupon.valid).toBe(false);
    expect(res.body.data.cart.coupon.rejection).toBe('inactive');
  });

  it('drops the discount when the qualifying item is removed', async () => {
    const electronics = await makeCategory('Electronics');
    const covered = await makeProduct({
      name: 'Phone',
      price: 2000,
      stock: 5,
      category: electronics,
    });

    await makeCoupon({
      code: 'PHONE10',
      appliesTo: { products: [], categories: [electronics._id], brands: [], users: [] },
    });

    const added = await api.post('/cart/items', { productId: String(covered._id), quantity: 1 });
    await api.post('/checkout/coupon', { code: 'PHONE10' });

    const itemId = added.body.data.cart.items[0].itemId;
    await api.delete(`/cart/items/${itemId}`);

    const res = await api.get('/cart');
    expect(res.body.data.cart.coupon?.valid ?? false).toBe(false);
  });

  it('removes an applied coupon', async () => {
    const product = await makeProduct({ name: 'Widget', price: 1000, stock: 5 });
    await makeCoupon();
    await api.post('/cart/items', { productId: String(product._id), quantity: 1 });
    await api.post('/checkout/coupon', { code: 'SAVE10' });

    const res = await api.delete('/checkout/coupon');
    expect(res.body.data.cart.coupon).toBeUndefined();
  });
});

describe('checkout quote', () => {
  it('returns a server-computed breakdown', async () => {
    const { agent } = await signIn();
    await addAddress(agent);
    const product = await makeProduct({ name: 'Quote Widget', price: 1180, stock: 10 });
    await agent.post('/cart/items', { productId: String(product._id), quantity: 2 });

    const res = await agent.post('/checkout/quote', { deliveryMethod: 'standard' });

    expect(res.status).toBe(200);
    const { pricing } = res.body.data.quote;
    expect(pricing.subtotal).toBe(2360);
    // Inclusive tax extracted, not added.
    expect(pricing.taxTotal).toBe(360);
    expect(pricing.shippingTotal).toBe(0);
    expect(pricing.grandTotal).toBe(2360);
    expect(res.body.data.quote.canPlaceOrder).toBe(true);
  });

  it('ignores any totals the client tries to send', async () => {
    const { agent } = await signIn();
    await addAddress(agent);
    // Below the ₹999 free-shipping threshold, so shipping is part of the total
    // and a forged discount would be visible if it were honoured.
    const product = await makeProduct({ name: 'Widget', price: 500, stock: 5 });
    await agent.post('/cart/items', { productId: String(product._id), quantity: 1 });

    const res = await agent.post('/checkout/quote', {
      deliveryMethod: 'standard',
      grandTotal: 1,
      subtotal: 1,
      discountTotal: 499,
      shippingTotal: 0,
    });

    // Extra keys are stripped by the schema; the server prices from the database.
    expect(res.body.data.quote.pricing.subtotal).toBe(500);
    expect(res.body.data.quote.pricing.shippingTotal).toBe(49);
    expect(res.body.data.quote.pricing.discountTotal).toBe(0);
    expect(res.body.data.quote.pricing.grandTotal).toBe(549);
  });

  it('reports blocking issues and refuses to allow the order', async () => {
    const { agent } = await signIn();
    await addAddress(agent);
    const product = await makeProduct({ name: 'Vanishing Widget', price: 1000, stock: 5 });
    await agent.post('/cart/items', { productId: String(product._id), quantity: 3 });

    await Product.updateOne({ _id: product._id }, { $set: { totalStock: 1 } });

    const res = await agent.post('/checkout/quote', { deliveryMethod: 'standard' });

    expect(res.body.data.quote.issues[0].type).toBe('insufficient_stock');
    expect(res.body.data.quote.canPlaceOrder).toBe(false);
  });

  it('will not let a signed-in customer order without an address', async () => {
    const { agent } = await signIn();
    const product = await makeProduct({ name: 'Widget', price: 1000, stock: 5 });
    await agent.post('/cart/items', { productId: String(product._id), quantity: 1 });

    const res = await agent.post('/checkout/quote', { deliveryMethod: 'standard' });

    expect(res.body.data.quote.canPlaceOrder).toBe(false);
    expect(res.body.data.quote.shippingAddress).toBeUndefined();
  });

  it('cannot be given another customer address id', async () => {
    const alice = await signIn('alice-checkout@example.com');
    const bob = await signIn('bob-checkout@example.com');
    const created = await addAddress(alice.agent);
    const aliceAddressId = created.body.data.addresses[0]._id;

    const product = await makeProduct({ name: 'Widget', price: 1000, stock: 5 });
    await bob.agent.post('/cart/items', { productId: String(product._id), quantity: 1 });

    // Addresses are looked up by user AND id, so this resolves to nothing.
    const res = await bob.agent.post('/checkout/quote', {
      deliveryMethod: 'standard',
      addressId: aliceAddressId,
    });

    expect(res.status).toBe(404);
  });

  it('prices express delivery higher than standard', async () => {
    const { agent } = await signIn();
    await addAddress(agent);
    const product = await makeProduct({ name: 'Widget', price: 5000, stock: 5 });
    await agent.post('/cart/items', { productId: String(product._id), quantity: 1 });

    const standard = await agent.post('/checkout/quote', { deliveryMethod: 'standard' });
    const express = await agent.post('/checkout/quote', { deliveryMethod: 'express' });

    expect(standard.body.data.quote.pricing.shippingTotal).toBe(0);
    expect(express.body.data.quote.pricing.shippingTotal).toBe(100);
    expect(express.body.data.quote.estimatedDelivery.from).toBeTruthy();
  });

  it('refuses to quote an empty bag', async () => {
    const { agent } = await signIn();
    const res = await agent.post('/checkout/quote', { deliveryMethod: 'standard' });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('CART_EMPTY');
  });

  it('applies an approved coupon to the quoted total', async () => {
    const { agent } = await signIn();
    await addAddress(agent);
    await makeBrand('Quote Brand');
    const product = await makeProduct({ name: 'Widget', price: 2000, stock: 5 });
    await makeCoupon({ code: 'SAVE10' });

    await agent.post('/cart/items', { productId: String(product._id), quantity: 1 });
    await agent.post('/checkout/coupon', { code: 'SAVE10' });

    const res = await agent.post('/checkout/quote', { deliveryMethod: 'standard' });
    const { pricing } = res.body.data.quote;

    expect(pricing.discountTotal).toBe(200);
    expect(pricing.grandTotal).toBe(1800);
  });
});

describe('public offers', () => {
  it('lists live coupons but hides customer-specific ones', async () => {
    const user = await makeUser({ email: 'targeted@example.com' });
    await makeCoupon({ code: 'PUBLIC1' });
    await makeCoupon({ code: 'EXPIREDONE', startsAt: days(-60), expiresAt: days(-1) });
    await makeCoupon({
      code: 'PRIVATE1',
      appliesTo: { products: [], categories: [], brands: [], users: [user._id] },
    });

    const res = await api.get('/offers');
    const codes = res.body.data.items.map((c: { code: string }) => c.code);

    expect(codes).toContain('PUBLIC1');
    expect(codes).not.toContain('EXPIREDONE');
    // Advertising a targeted coupon would let anyone try to redeem it.
    expect(codes).not.toContain('PRIVATE1');
  });
});
