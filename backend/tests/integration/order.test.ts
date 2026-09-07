import { beforeEach, describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { useTestDatabase } from '../helpers/db.js';
import { createApiAgent, type ApiAgent } from '../helpers/api.js';
import { makeProduct, makeUser, TEST_PASSWORD } from '../helpers/factories.js';
import { createApp } from '../../src/app.js';
import { Order } from '../../src/models/order.model.js';
import { Payment } from '../../src/models/payment.model.js';
import { Product } from '../../src/models/product.model.js';
import { StockReservation } from '../../src/models/stockReservation.model.js';
import { InventoryTransaction } from '../../src/models/inventoryTransaction.model.js';
import { WebhookEvent } from '../../src/models/webhookEvent.model.js';
import { getMockProvider } from '../../src/integrations/payments/index.js';
import { releaseExpiredReservations } from '../../src/jobs/releaseExpiredReservations.js';

useTestDatabase();

const app = createApp();
const mock = getMockProvider()!;

async function signIn(
  email = `order-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.com`,
) {
  const user = await makeUser({ email });
  const agent = await createApiAgent(app);
  await agent.post('/auth/login', { email, password: TEST_PASSWORD });
  await agent.post('/account/addresses', {
    fullName: 'Test Shopper',
    phone: '9876543210',
    line1: '14 Brigade Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    postalCode: '560001',
    country: 'India',
  });
  return { agent, user };
}

/** Sign in, add a product to the bag, and create the checkout session. */
async function placeOrder(
  agent: ApiAgent,
  productId: string,
  quantity = 1,
  headers: Record<string, string> = {},
) {
  await agent.post('/cart/items', { productId, quantity });
  let request = agent.agent.post('/api/v1/checkout/session').set('X-CSRF-Token', agent.csrfToken);
  for (const [key, value] of Object.entries(headers)) request = request.set(key, value);
  return request.send({ deliveryMethod: 'standard' });
}

let api: ApiAgent;
beforeEach(async () => {
  api = await createApiAgent(app);
});

describe('order creation', () => {
  it('creates an order, reserves stock and opens a payment', async () => {
    const { agent } = await signIn();
    const product = await makeProduct({ name: 'Order Widget', price: 1000, stock: 10 });

    const res = await placeOrder(agent, String(product._id), 2);

    expect(res.status).toBe(201);
    expect(res.body.data.order.orderNumber).toMatch(/^ORD-\d{8}-\d{6}$/);
    expect(res.body.data.payment.providerOrderId).toBeTruthy();
    // Only the publishable key ever reaches the browser.
    expect(res.body.data.payment.keyId).toBeTruthy();
    expect(JSON.stringify(res.body)).not.toContain('secret');

    // Stock moved from available into reserved — not yet sold.
    const after = await Product.findById(product._id).lean();
    expect(after!.stock.available).toBe(8);
    expect(after!.stock.reserved).toBe(2);
    expect(after!.stock.sold).toBe(0);

    const reservation = await StockReservation.findOne({ order: res.body.data.order.id });
    expect(reservation!.status).toBe('held');
  });

  it('writes a ledger entry for the reservation', async () => {
    const { agent } = await signIn();
    const product = await makeProduct({ name: 'Ledger Widget', price: 500, stock: 5 });

    await placeOrder(agent, String(product._id), 1);

    const entries = await InventoryTransaction.find({ product: product._id }).lean();
    expect(entries).toHaveLength(1);
    expect(entries[0]!.type).toBe('reserve');
    expect(entries[0]!.before.available).toBe(5);
    expect(entries[0]!.after.available).toBe(4);
  });

  it('rolls back every line when one cannot be reserved', async () => {
    const { agent } = await signIn();
    const plenty = await makeProduct({ name: 'Plenty', price: 100, stock: 50 });
    const scarce = await makeProduct({ name: 'Scarce', price: 100, stock: 1 });

    await agent.post('/cart/items', { productId: String(plenty._id), quantity: 2 });
    await agent.post('/cart/items', { productId: String(scarce._id), quantity: 1 });

    // Drain the scarce item after it is in the bag but before checkout.
    await Product.updateOne({ _id: scarce._id }, { $set: { 'stock.available': 0, totalStock: 0 } });

    const res = await agent.agent
      .post('/api/v1/checkout/session')
      .set('X-CSRF-Token', agent.csrfToken)
      .send({ deliveryMethod: 'standard' });

    expect(res.status).toBeGreaterThanOrEqual(400);

    // The transaction rolled back: the plentiful item was NOT left reserved.
    const plentyAfter = await Product.findById(plenty._id).lean();
    expect(plentyAfter!.stock.available).toBe(50);
    expect(plentyAfter!.stock.reserved).toBe(0);
    expect(await Order.countDocuments()).toBe(0);
  });
});

describe('oversell prevention', () => {
  it('lets exactly one of many concurrent buyers take the last unit', async () => {
    const product = await makeProduct({ name: 'Last One', price: 1000, stock: 1 });

    // Five separate customers, all trying to buy the single remaining unit at
    // the same moment. This is the scenario the whole reservation design exists
    // for, and the one that a read-then-write implementation gets wrong.
    const buyers = await Promise.all([0, 1, 2, 3, 4].map(() => signIn()));
    await Promise.all(
      buyers.map(({ agent }) =>
        agent.post('/cart/items', { productId: String(product._id), quantity: 1 }),
      ),
    );

    const results = await Promise.all(
      buyers.map(({ agent }) =>
        agent.agent
          .post('/api/v1/checkout/session')
          .set('X-CSRF-Token', agent.csrfToken)
          .send({ deliveryMethod: 'standard' }),
      ),
    );

    const succeeded = results.filter((r) => r.status === 201);
    const failed = results.filter((r) => r.status !== 201);

    expect(succeeded).toHaveLength(1);
    expect(failed).toHaveLength(4);
    expect(failed.every((r) => r.body.code === 'INSUFFICIENT_STOCK')).toBe(true);

    // Stock never went negative and exactly one unit is held.
    const after = await Product.findById(product._id).lean();
    expect(after!.stock.available).toBe(0);
    expect(after!.stock.reserved).toBe(1);
    expect(await Order.countDocuments()).toBe(1);
  });

  it('never drives available stock below zero', async () => {
    const product = await makeProduct({ name: 'Three Left', price: 100, stock: 3 });
    const buyers = await Promise.all([0, 1, 2, 3, 4, 5].map(() => signIn()));

    await Promise.all(
      buyers.map(({ agent }) =>
        agent.post('/cart/items', { productId: String(product._id), quantity: 1 }),
      ),
    );
    await Promise.all(
      buyers.map(({ agent }) =>
        agent.agent
          .post('/api/v1/checkout/session')
          .set('X-CSRF-Token', agent.csrfToken)
          .send({ deliveryMethod: 'standard' }),
      ),
    );

    const after = await Product.findById(product._id).lean();
    expect(after!.stock.available).toBeGreaterThanOrEqual(0);
    expect(after!.stock.available + after!.stock.reserved).toBe(3);
  });
});

describe('idempotency', () => {
  it('returns the same order for a repeated Idempotency-Key', async () => {
    const { agent } = await signIn();
    const product = await makeProduct({ name: 'Idempotent Widget', price: 1000, stock: 10 });
    const key = `key-${Date.now()}-abcdefgh`;

    const first = await placeOrder(agent, String(product._id), 1, { 'Idempotency-Key': key });
    expect(first.status).toBe(201);

    // The double-clicked pay button.
    const second = await agent.agent
      .post('/api/v1/checkout/session')
      .set('X-CSRF-Token', agent.csrfToken)
      .set('Idempotency-Key', key)
      .send({ deliveryMethod: 'standard' });

    expect(second.headers['idempotent-replay']).toBe('true');
    expect(second.body.data.order.orderNumber).toBe(first.body.data.order.orderNumber);

    // One order, and stock held once.
    expect(await Order.countDocuments()).toBe(1);
    const after = await Product.findById(product._id).lean();
    expect(after!.stock.reserved).toBe(1);
  });

  it('refuses to reuse a key for a different request', async () => {
    const { agent } = await signIn();
    const product = await makeProduct({ name: 'Widget', price: 1000, stock: 10 });
    const key = `key-${Date.now()}-differing`;

    await placeOrder(agent, String(product._id), 1, { 'Idempotency-Key': key });

    const different = await agent.agent
      .post('/api/v1/checkout/session')
      .set('X-CSRF-Token', agent.csrfToken)
      .set('Idempotency-Key', key)
      .send({ deliveryMethod: 'express' });

    // Replaying the first response here would silently answer a question the
    // client did not ask.
    expect(different.status).toBe(409);
  });
});

describe('payment verification', () => {
  it('confirms the order and commits the reserved stock', async () => {
    const { agent } = await signIn();
    const product = await makeProduct({ name: 'Pay Widget', price: 1000, stock: 5 });
    const created = await placeOrder(agent, String(product._id), 2);
    const { providerOrderId } = created.body.data.payment;

    const paymentId = 'mock_pay_verify_1';
    const signature = mock.signPayment(providerOrderId, paymentId);

    const res = await agent.post('/payments/verify', {
      providerOrderId,
      providerPaymentId: paymentId,
      signature,
    });

    expect(res.status).toBe(200);
    expect(res.body.data.order.status).toBe('confirmed');

    // reserved → sold.
    const after = await Product.findById(product._id).lean();
    expect(after!.stock.available).toBe(3);
    expect(after!.stock.reserved).toBe(0);
    expect(after!.stock.sold).toBe(2);

    // The bag is emptied in the same transaction, so a customer can never hold
    // both an order and the cart that produced it.
    const cart = await agent.get('/cart');
    expect(cart.body.data.cart.items).toHaveLength(0);
  });

  it('rejects a forged signature and leaves the order unpaid', async () => {
    const { agent } = await signIn();
    const product = await makeProduct({ name: 'Forge Widget', price: 1000, stock: 5 });
    const created = await placeOrder(agent, String(product._id), 1);

    const res = await agent.post('/payments/verify', {
      providerOrderId: created.body.data.payment.providerOrderId,
      providerPaymentId: 'mock_pay_forged',
      signature: 'f'.repeat(64),
    });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('PAYMENT_SIGNATURE_INVALID');

    const order = await Order.findById(created.body.data.order.id).lean();
    expect(order!.status).toBe('pending_payment');
    // Nothing was sold on the strength of an unverified claim.
    const after = await Product.findById(product._id).lean();
    expect(after!.stock.sold).toBe(0);
  });

  it('is idempotent when verified twice', async () => {
    const { agent } = await signIn();
    const product = await makeProduct({ name: 'Twice Widget', price: 1000, stock: 5 });
    const created = await placeOrder(agent, String(product._id), 1);
    const { providerOrderId } = created.body.data.payment;
    const paymentId = 'mock_pay_twice';
    const signature = mock.signPayment(providerOrderId, paymentId);

    await agent.post('/payments/verify', {
      providerOrderId,
      providerPaymentId: paymentId,
      signature,
    });
    const second = await agent.post('/payments/verify', {
      providerOrderId,
      providerPaymentId: paymentId,
      signature,
    });

    expect(second.status).toBe(200);
    // Stock committed exactly once.
    const after = await Product.findById(product._id).lean();
    expect(after!.stock.sold).toBe(1);
    expect(after!.stock.available).toBe(4);
  });
});

describe('route mounting', () => {
  it('leaves the webhook endpoint unauthenticated', async () => {
    // Regression guard. `requireAuth` applied router-wide on a router mounted
    // at '/' runs for EVERY path that reaches it, which silently required a
    // session on the webhook endpoint — a provider has no cookies, so every
    // delivery would have 401'd and every payment would have gone unconfirmed
    // until the reservation expired.
    const res = await api.agent
      .post('/api/v1/webhooks/payments/mock')
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Signature', 'deadbeef')
      .send('{}');

    // Rejected for a bad signature — which proves it reached the handler
    // rather than being turned away by an auth guard.
    expect(res.status).not.toBe(401);
    expect(res.status).toBe(403);
  });

  it('keeps quoting open to guests while requiring a session to order', async () => {
    const product = await makeProduct({ name: 'Guest Quote', price: 1000, stock: 5 });
    await api.post('/cart/items', { productId: String(product._id), quantity: 1 });

    // A guest can price their bag …
    expect((await api.post('/checkout/quote', { deliveryMethod: 'standard' })).status).toBe(200);
    // … but an order needs an owner.
    expect((await api.post('/checkout/session', { deliveryMethod: 'standard' })).status).toBe(401);
  });
});

describe('webhooks', () => {
  it('confirms an order from a signed webhook', async () => {
    const { agent } = await signIn();
    const product = await makeProduct({ name: 'Hook Widget', price: 1000, stock: 5 });
    const created = await placeOrder(agent, String(product._id), 1);
    const { providerOrderId } = created.body.data.payment;

    const { body, signature } = mock.buildWebhook({
      event: 'payment.captured',
      providerOrderId,
      providerPaymentId: 'mock_pay_hook',
      amount: 1000,
    });

    const res = await api.agent
      .post('/api/v1/webhooks/payments/mock')
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Signature', signature)
      .send(body);

    expect(res.status).toBe(200);
    expect(res.body.data.duplicate).toBe(false);

    const order = await Order.findById(created.body.data.order.id).lean();
    expect(order!.status).toBe('confirmed');
  });

  it('ignores a redelivered webhook without acting twice', async () => {
    const { agent } = await signIn();
    const product = await makeProduct({ name: 'Dup Widget', price: 1000, stock: 5 });
    const created = await placeOrder(agent, String(product._id), 2);
    const { providerOrderId } = created.body.data.payment;

    // The SAME event id, delivered twice — normal provider behaviour.
    const { body, signature } = mock.buildWebhook({
      eventId: 'evt_duplicate_fixed',
      event: 'payment.captured',
      providerOrderId,
      providerPaymentId: 'mock_pay_dup',
      amount: 2000,
    });

    const send = () =>
      api.agent
        .post('/api/v1/webhooks/payments/mock')
        .set('Content-Type', 'application/json')
        .set('X-Webhook-Signature', signature)
        .send(body);

    const first = await send();
    const second = await send();

    expect(first.body.data.duplicate).toBe(false);
    expect(second.status).toBe(200);
    expect(second.body.data.duplicate).toBe(true);

    // The properties that matter: stock decremented once, one webhook record.
    const after = await Product.findById(product._id).lean();
    expect(after!.stock.sold).toBe(2);
    expect(after!.stock.available).toBe(3);
    expect(await WebhookEvent.countDocuments({ eventId: 'evt_duplicate_fixed' })).toBe(1);
  });

  it('rejects a webhook with an invalid signature', async () => {
    const { body } = mock.buildWebhook({
      event: 'payment.captured',
      providerOrderId: 'mock_order_unknown',
      providerPaymentId: 'x',
      amount: 100,
    });

    const res = await api.agent
      .post('/api/v1/webhooks/payments/mock')
      .set('Content-Type', 'application/json')
      .set('X-Webhook-Signature', 'a'.repeat(64))
      .send(body);

    expect(res.status).toBe(403);
    expect(await WebhookEvent.countDocuments()).toBe(0);
  });

  it('handles verify and webhook racing each other', async () => {
    const { agent } = await signIn();
    const product = await makeProduct({ name: 'Race Widget', price: 1000, stock: 5 });
    const created = await placeOrder(agent, String(product._id), 1);
    const { providerOrderId } = created.body.data.payment;
    const paymentId = 'mock_pay_race';

    const signature = mock.signPayment(providerOrderId, paymentId);
    const hook = mock.buildWebhook({
      event: 'payment.captured',
      providerOrderId,
      providerPaymentId: paymentId,
      amount: 1000,
    });

    // Both confirmation paths at once — the real-world case that makes
    // idempotency non-negotiable.
    await Promise.all([
      agent.post('/payments/verify', { providerOrderId, providerPaymentId: paymentId, signature }),
      api.agent
        .post('/api/v1/webhooks/payments/mock')
        .set('Content-Type', 'application/json')
        .set('X-Webhook-Signature', hook.signature)
        .send(hook.body),
    ]);

    const after = await Product.findById(product._id).lean();
    expect(after!.stock.sold).toBe(1);
    expect(after!.stock.reserved).toBe(0);
    expect(after!.stock.available).toBe(4);
  });
});

describe('expiry sweeper', () => {
  it('returns stock held by a checkout that was never paid', async () => {
    const { agent } = await signIn();
    const product = await makeProduct({ name: 'Abandoned Widget', price: 1000, stock: 5 });
    const created = await placeOrder(agent, String(product._id), 2);

    // Age the reservation past its deadline.
    await StockReservation.updateOne(
      { order: created.body.data.order.id },
      { $set: { expiresAt: new Date(Date.now() - 60_000) } },
    );

    const released = await releaseExpiredReservations();
    expect(released).toBe(1);

    // Stock is back on the shelf, and the order is marked expired rather than
    // lingering as pending forever.
    const after = await Product.findById(product._id).lean();
    expect(after!.stock.available).toBe(5);
    expect(after!.stock.reserved).toBe(0);

    const order = await Order.findById(created.body.data.order.id).lean();
    expect(order!.status).toBe('expired');
  });

  it('leaves a paid order alone even if its reservation looks stale', async () => {
    const { agent } = await signIn();
    const product = await makeProduct({ name: 'Paid Widget', price: 1000, stock: 5 });
    const created = await placeOrder(agent, String(product._id), 1);
    const { providerOrderId } = created.body.data.payment;

    await agent.post('/payments/verify', {
      providerOrderId,
      providerPaymentId: 'mock_pay_paid',
      signature: mock.signPayment(providerOrderId, 'mock_pay_paid'),
    });

    await StockReservation.updateOne(
      { order: created.body.data.order.id },
      { $set: { expiresAt: new Date(Date.now() - 60_000) } },
    );

    await releaseExpiredReservations();

    // The reservation was already committed, so the sweep must not touch it.
    const order = await Order.findById(created.body.data.order.id).lean();
    expect(order!.status).toBe('confirmed');
    const after = await Product.findById(product._id).lean();
    expect(after!.stock.sold).toBe(1);
  });
});

describe('cancellation', () => {
  it('releases the reservation when an unpaid order is cancelled', async () => {
    const { agent } = await signIn();
    const product = await makeProduct({ name: 'Cancel Widget', price: 1000, stock: 5 });
    const created = await placeOrder(agent, String(product._id), 2);

    const res = await agent.post(`/orders/${created.body.data.order.orderNumber}/cancel`, {
      reason: 'Changed my mind',
    });

    expect(res.status).toBe(200);
    const after = await Product.findById(product._id).lean();
    expect(after!.stock.available).toBe(5);
    expect(after!.stock.reserved).toBe(0);
    // Nothing was ever sold, so `sold` must not move.
    expect(after!.stock.sold).toBe(0);
  });

  it('restocks sold units when a paid order is cancelled', async () => {
    const { agent } = await signIn();
    const product = await makeProduct({ name: 'Paid Cancel', price: 1000, stock: 5 });
    const created = await placeOrder(agent, String(product._id), 2);
    const { providerOrderId } = created.body.data.payment;

    await agent.post('/payments/verify', {
      providerOrderId,
      providerPaymentId: 'mock_pay_cancel',
      signature: mock.signPayment(providerOrderId, 'mock_pay_cancel'),
    });

    await agent.post(`/orders/${created.body.data.order.orderNumber}/cancel`, {
      reason: 'No longer needed',
    });

    const after = await Product.findById(product._id).lean();
    expect(after!.stock.available).toBe(5);
    expect(after!.stock.sold).toBe(0);
  });

  it('refuses to cancel an order already dispatched', async () => {
    const { agent } = await signIn();
    const product = await makeProduct({ name: 'Shipped Widget', price: 1000, stock: 5 });
    const created = await placeOrder(agent, String(product._id), 1);
    const { providerOrderId } = created.body.data.payment;

    await agent.post('/payments/verify', {
      providerOrderId,
      providerPaymentId: 'mock_pay_ship',
      signature: mock.signPayment(providerOrderId, 'mock_pay_ship'),
    });

    await Order.updateOne({ _id: created.body.data.order.id }, { $set: { status: 'shipped' } });

    const res = await agent.post(`/orders/${created.body.data.order.orderNumber}/cancel`, {
      reason: 'Too late',
    });

    expect(res.status).toBe(409);
    expect(res.body.code).toBe('ORDER_NOT_CANCELLABLE');
  });
});

describe('order access', () => {
  it('does not let one customer read another customer order', async () => {
    const alice = await signIn('alice-order@example.com');
    const bob = await signIn('bob-order@example.com');
    const product = await makeProduct({ name: 'Private Order', price: 1000, stock: 5 });

    const created = await placeOrder(alice.agent, String(product._id), 1);
    const orderNumber = created.body.data.order.orderNumber;

    // Order numbers are sequential and guessable, so lookup must be scoped to
    // the owner — by number alone this would be an IDOR.
    const res = await bob.agent.get(`/api/v1/orders/${orderNumber}`);
    expect(res.status).toBe(404);
  });

  it('lists only the signed-in customer own orders', async () => {
    const alice = await signIn('alice-list@example.com');
    const bob = await signIn('bob-list@example.com');
    const product = await makeProduct({ name: 'Listed', price: 1000, stock: 20 });

    await placeOrder(alice.agent, String(product._id), 1);
    await placeOrder(bob.agent, String(product._id), 1);

    const res = await alice.agent.get('/orders');
    expect(res.body.data.items).toHaveLength(1);
    expect(await Order.countDocuments()).toBe(2);
  });
});

describe('database invariants', () => {
  it('keeps available + reserved + sold conserved across the lifecycle', async () => {
    const { agent } = await signIn();
    const product = await makeProduct({ name: 'Conserved', price: 1000, stock: 10 });
    const initial = 10;

    const created = await placeOrder(agent, String(product._id), 3);
    let after = await Product.findById(product._id).lean();
    // Reserving moves units between buckets; the total is unchanged.
    expect(after!.stock.available + after!.stock.reserved + after!.stock.sold).toBe(initial);

    const { providerOrderId } = created.body.data.payment;
    await agent.post('/payments/verify', {
      providerOrderId,
      providerPaymentId: 'mock_pay_conserve',
      signature: mock.signPayment(providerOrderId, 'mock_pay_conserve'),
    });

    after = await Product.findById(product._id).lean();
    expect(after!.stock.available + after!.stock.reserved + after!.stock.sold).toBe(initial);
    expect(after!.stock.sold).toBe(3);
  });

  it('records one payment row per order', async () => {
    const { agent } = await signIn();
    const product = await makeProduct({ name: 'One Payment', price: 1000, stock: 5 });
    const created = await placeOrder(agent, String(product._id), 1);

    const payments = await Payment.find({ order: created.body.data.order.id }).lean();
    expect(payments).toHaveLength(1);
    expect(payments[0]!.amount).toBe(created.body.data.order.total);
    // Card data must never be stored, in any form.
    expect(JSON.stringify(payments[0])).not.toMatch(/cardNumber|cvv|pan/i);
  });
});

// Keeps mongoose types referenced for the lean() casts above.
export type { mongoose };
