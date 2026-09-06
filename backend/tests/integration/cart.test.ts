import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../helpers/db.js';
import { createApiAgent, type ApiAgent } from '../helpers/api.js';
import { makeProduct, makeUser, TEST_PASSWORD } from '../helpers/factories.js';
import { createApp } from '../../src/app.js';
import { Product } from '../../src/models/product.model.js';

useTestDatabase();

const app = createApp();
let api: ApiAgent;

beforeEach(async () => {
  api = await createApiAgent(app);
});

describe('guest cart', () => {
  it('lets an anonymous shopper fill a bag', async () => {
    const product = await makeProduct({ name: 'Simple Widget', price: 500, stock: 10 });

    const res = await api.post('/cart/items', { productId: String(product._id), quantity: 2 });

    expect(res.status).toBe(200);
    expect(res.body.data.cart.itemCount).toBe(2);
    expect(res.body.data.cart.subtotal).toBe(1000);
    // A cookie identity is minted on demand, so the bag survives navigation.
    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('guest_cart_id='))).toBe(true);
  });

  it('does not create a cart just because someone looked at one', async () => {
    const res = await api.get('/cart');

    expect(res.status).toBe(200);
    expect(res.body.data.cart.id).toBeNull();
    // No cookie: a crawler hitting this endpoint must not create a row.
    const cookies = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
    expect(cookies.some((c) => c.startsWith('guest_cart_id='))).toBe(false);
  });
});

describe('pricing authority', () => {
  it('ignores any price the client sends', async () => {
    const product = await makeProduct({ name: 'Priced Widget', price: 2500, stock: 5 });

    const res = await api.post('/cart/items', {
      productId: String(product._id),
      quantity: 1,
      // A hostile client trying to set its own price.
      price: 1,
      unitPrice: 1,
      lineTotal: 1,
    });

    // Zod strips the unknown keys; the server prices from the product document.
    expect(res.body.data.cart.items[0].unitPrice).toBe(2500);
    expect(res.body.data.cart.subtotal).toBe(2500);
  });

  it('re-prices the cart when the product price changes', async () => {
    const product = await makeProduct({ name: 'Movable Widget', price: 1000, stock: 5 });
    await api.post('/cart/items', { productId: String(product._id), quantity: 1 });

    await Product.updateOne({ _id: product._id }, { $set: { price: 1200 } });

    const res = await api.get('/cart');
    const line = res.body.data.cart.items[0];

    // The live price wins, and the change is surfaced rather than hidden.
    expect(line.unitPrice).toBe(1200);
    expect(res.body.data.cart.subtotal).toBe(1200);
    expect(line.priceChanged).toEqual({ from: 1000, to: 1200 });
  });
});

describe('stock enforcement', () => {
  it('refuses more than exists', async () => {
    const product = await makeProduct({ name: 'Scarce Widget', price: 100, stock: 3 });

    const res = await api.post('/cart/items', { productId: String(product._id), quantity: 5 });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INSUFFICIENT_STOCK');
    expect(res.body.message).toContain('3');
  });

  it('refuses an out-of-stock product', async () => {
    const product = await makeProduct({ name: 'Sold Out Widget', price: 100, stock: 0 });

    const res = await api.post('/cart/items', { productId: String(product._id), quantity: 1 });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INSUFFICIENT_STOCK');
  });

  it('counts what is already in the bag when adding more', async () => {
    const product = await makeProduct({ name: 'Limited Widget', price: 100, stock: 4 });

    await api.post('/cart/items', { productId: String(product._id), quantity: 3 });
    // Repeated adds must not stack past live stock.
    const res = await api.post('/cart/items', { productId: String(product._id), quantity: 3 });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INSUFFICIENT_STOCK');
  });

  it('flags a line when stock falls below what was added', async () => {
    const product = await makeProduct({ name: 'Shrinking Widget', price: 100, stock: 5 });
    await api.post('/cart/items', { productId: String(product._id), quantity: 4 });

    await Product.updateOne({ _id: product._id }, { $set: { totalStock: 2 } });

    const res = await api.get('/cart');
    expect(res.body.data.cart.items[0].issue).toBe('insufficient_stock');
    expect(res.body.data.cart.hasIssues).toBe(true);
  });

  it('flags a line whose product was archived', async () => {
    const product = await makeProduct({ name: 'Withdrawn Widget', price: 100, stock: 5 });
    await api.post('/cart/items', { productId: String(product._id), quantity: 1 });

    await Product.updateOne({ _id: product._id }, { $set: { status: 'archived' } });

    const res = await api.get('/cart');
    expect(res.body.data.cart.items[0].issue).toBe('unavailable');
    // An unavailable line contributes nothing to the total.
    expect(res.body.data.cart.subtotal).toBe(0);
  });
});

describe('variants', () => {
  it('requires an option to be chosen for a product that has variants', async () => {
    const product = await makeProduct({
      name: 'Variant Widget',
      price: 800,
      variants: [
        { color: 'Black', available: 5 },
        { color: 'White', available: 5 },
      ],
    });

    const res = await api.post('/cart/items', { productId: String(product._id), quantity: 1 });

    expect(res.status).toBe(400);
  });

  it('prices from the chosen variant, not the product', async () => {
    const product = await makeProduct({
      name: 'Tiered Widget',
      price: 800,
      variants: [
        { color: 'Black', price: 800, available: 5 },
        { color: 'Gold', price: 1500, available: 5 },
      ],
    });
    const gold = product.variants.find((v) => v.optionValues[0]?.value === 'Gold')!;

    const res = await api.post('/cart/items', {
      productId: String(product._id),
      variantId: String(gold._id),
      quantity: 1,
    });

    expect(res.body.data.cart.items[0].unitPrice).toBe(1500);
  });
});

describe('quantity updates', () => {
  it('treats a quantity of zero as removal', async () => {
    const product = await makeProduct({ name: 'Removable Widget', price: 100, stock: 5 });
    const added = await api.post('/cart/items', { productId: String(product._id), quantity: 2 });
    const itemId = added.body.data.cart.items[0].itemId;

    const res = await api.patch(`/cart/items/${itemId}`, { quantity: 0 });

    expect(res.body.data.cart.items).toHaveLength(0);
  });

  it('refuses an increase beyond live stock', async () => {
    const product = await makeProduct({ name: 'Capped Widget', price: 100, stock: 2 });
    const added = await api.post('/cart/items', { productId: String(product._id), quantity: 1 });
    const itemId = added.body.data.cart.items[0].itemId;

    const res = await api.patch(`/cart/items/${itemId}`, { quantity: 5 });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('INSUFFICIENT_STOCK');
  });
});

describe('guest cart merge on sign-in', () => {
  it('carries the anonymous bag into the account and sums duplicates', async () => {
    const email = `merge-${Date.now()}@example.com`;
    await makeUser({ email });

    const productA = await makeProduct({ name: 'Merge A', price: 100, stock: 10 });
    const productB = await makeProduct({ name: 'Merge B', price: 200, stock: 10 });

    // Signed in on one agent: put A in the bag.
    const member = await createApiAgent(app);
    await member.post('/auth/login', { email, password: TEST_PASSWORD });
    await member.post('/cart/items', { productId: String(productA._id), quantity: 1 });
    await member.post('/auth/logout');

    // Same browser, now anonymous: add A again plus B.
    await member.post('/cart/items', { productId: String(productA._id), quantity: 2 });
    await member.post('/cart/items', { productId: String(productB._id), quantity: 1 });

    // Sign back in — the guest bag must merge, not replace.
    await member.post('/auth/login', { email, password: TEST_PASSWORD });

    const res = await member.get('/cart');
    const items = res.body.data.cart.items as { product: { name: string }; quantity: number }[];

    expect(items).toHaveLength(2);
    // 1 from the account + 2 added as a guest.
    expect(items.find((i) => i.product.name === 'Merge A')?.quantity).toBe(3);
    expect(items.find((i) => i.product.name === 'Merge B')?.quantity).toBe(1);
  });
});

describe('account scoping', () => {
  it('does not let one customer read another customer bag', async () => {
    const product = await makeProduct({ name: 'Private Widget', price: 100, stock: 5 });

    const alice = await createApiAgent(app);
    await makeUser({ email: 'alice-cart@example.com' });
    await alice.post('/auth/login', { email: 'alice-cart@example.com', password: TEST_PASSWORD });
    await alice.post('/cart/items', { productId: String(product._id), quantity: 2 });

    const bob = await createApiAgent(app);
    await makeUser({ email: 'bob-cart@example.com' });
    await bob.post('/auth/login', { email: 'bob-cart@example.com', password: TEST_PASSWORD });

    // Carts are keyed by the authenticated user, never by a client-supplied id.
    const res = await bob.get('/cart');
    expect(res.body.data.cart.items).toHaveLength(0);
  });

  it('requires authentication for wishlist and addresses', async () => {
    expect((await api.get('/account/wishlist')).status).toBe(401);
    expect((await api.get('/account/addresses')).status).toBe(401);
    expect(
      (await api.post('/account/wishlist', { productId: '507f1f77bcf86cd799439011' })).status,
    ).toBe(401);
  });
});
