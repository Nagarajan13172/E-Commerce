import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../helpers/db.js';
import { createApiAgent, type ApiAgent } from '../helpers/api.js';
import { makeUser, TEST_PASSWORD } from '../helpers/factories.js';
import { createApp } from '../../src/app.js';
import type { UserRole } from '@ecom/shared';

useTestDatabase();

const app = createApp();

/**
 * Authorization enforcement.
 *
 * The frontend also hides admin routes, but that is presentation — anyone can
 * call the API with curl. These tests are what actually proves the server is the
 * enforcement point.
 *
 * The route list below is exhaustive on purpose. Testing a sample would let an
 * unguarded endpoint ship unnoticed, and an unguarded admin endpoint is the
 * single worst bug this codebase could have.
 */

interface RouteCase {
  method: 'get' | 'post' | 'patch' | 'delete';
  path: string;
  /** Roles that SHOULD be allowed through the permission check. */
  allowed: UserRole[];
}

const OBJECT_ID = '507f1f77bcf86cd799439011';

const ADMIN_ROUTES: RouteCase[] = [
  // Reads: support can see the catalog to answer customer questions.
  { method: 'get', path: '/admin/products', allowed: ['support', 'manager', 'admin'] },
  { method: 'get', path: `/admin/products/${OBJECT_ID}`, allowed: ['support', 'manager', 'admin'] },
  { method: 'get', path: '/admin/categories', allowed: ['support', 'manager', 'admin'] },
  { method: 'get', path: '/admin/brands', allowed: ['support', 'manager', 'admin'] },

  // Writes: support must NOT be able to change prices or the catalog.
  { method: 'post', path: '/admin/products', allowed: ['manager', 'admin'] },
  { method: 'patch', path: `/admin/products/${OBJECT_ID}`, allowed: ['manager', 'admin'] },
  { method: 'delete', path: `/admin/products/${OBJECT_ID}`, allowed: ['manager', 'admin'] },
  { method: 'post', path: `/admin/products/${OBJECT_ID}/restore`, allowed: ['manager', 'admin'] },
  { method: 'post', path: `/admin/products/${OBJECT_ID}/duplicate`, allowed: ['manager', 'admin'] },
  { method: 'post', path: '/admin/products/bulk', allowed: ['manager', 'admin'] },

  { method: 'post', path: '/admin/categories', allowed: ['manager', 'admin'] },
  { method: 'patch', path: `/admin/categories/${OBJECT_ID}`, allowed: ['manager', 'admin'] },
  { method: 'delete', path: `/admin/categories/${OBJECT_ID}`, allowed: ['manager', 'admin'] },
  { method: 'post', path: '/admin/categories/reorder', allowed: ['manager', 'admin'] },

  { method: 'post', path: '/admin/brands', allowed: ['manager', 'admin'] },
  { method: 'patch', path: `/admin/brands/${OBJECT_ID}`, allowed: ['manager', 'admin'] },
  { method: 'delete', path: `/admin/brands/${OBJECT_ID}`, allowed: ['manager', 'admin'] },

  { method: 'get', path: '/admin/media', allowed: ['manager', 'admin'] },
  { method: 'post', path: '/admin/media/presign', allowed: ['manager', 'admin'] },
  { method: 'post', path: '/admin/media/confirm', allowed: ['manager', 'admin'] },
  { method: 'delete', path: `/admin/media/${OBJECT_ID}`, allowed: ['manager', 'admin'] },

  // ── Dashboard and analytics ───────────────────────────────────────────────
  // Revenue figures are management information, not something support needs.
  { method: 'get', path: '/admin/dashboard', allowed: ['manager', 'admin'] },

  // ── Orders ────────────────────────────────────────────────────────────────
  { method: 'get', path: '/admin/orders', allowed: ['support', 'manager', 'admin'] },
  { method: 'get', path: `/admin/orders/${OBJECT_ID}`, allowed: ['support', 'manager', 'admin'] },
  { method: 'patch', path: `/admin/orders/${OBJECT_ID}/status`, allowed: ['manager', 'admin'] },
  { method: 'patch', path: `/admin/orders/${OBJECT_ID}/shipping`, allowed: ['manager', 'admin'] },
  // Refunds move money — deliberately out of reach for support.
  { method: 'post', path: `/admin/orders/${OBJECT_ID}/refund`, allowed: ['manager', 'admin'] },
  { method: 'get', path: `/admin/orders/${OBJECT_ID}/refundable`, allowed: ['manager', 'admin'] },
  {
    method: 'post',
    path: `/admin/orders/${OBJECT_ID}/notes`,
    allowed: ['support', 'manager', 'admin'],
  },

  // ── Customers ─────────────────────────────────────────────────────────────
  { method: 'get', path: '/admin/customers', allowed: ['support', 'manager', 'admin'] },
  {
    method: 'get',
    path: `/admin/customers/${OBJECT_ID}`,
    allowed: ['support', 'manager', 'admin'],
  },
  { method: 'patch', path: `/admin/customers/${OBJECT_ID}/status`, allowed: ['manager', 'admin'] },
  // Granting roles is privilege escalation — admin only.
  { method: 'patch', path: `/admin/customers/${OBJECT_ID}/role`, allowed: ['admin'] },

  // ── Inventory ─────────────────────────────────────────────────────────────
  { method: 'get', path: '/admin/inventory', allowed: ['support', 'manager', 'admin'] },
  { method: 'post', path: '/admin/inventory/adjust', allowed: ['manager', 'admin'] },
  {
    method: 'get',
    path: `/admin/inventory/${OBJECT_ID}/history`,
    allowed: ['support', 'manager', 'admin'],
  },

  // ── Reviews ───────────────────────────────────────────────────────────────
  { method: 'get', path: '/admin/reviews', allowed: ['support', 'manager', 'admin'] },
  {
    method: 'patch',
    path: `/admin/reviews/${OBJECT_ID}/moderate`,
    allowed: ['support', 'manager', 'admin'],
  },
  {
    method: 'post',
    path: `/admin/reviews/${OBJECT_ID}/respond`,
    allowed: ['support', 'manager', 'admin'],
  },
  {
    method: 'delete',
    path: `/admin/reviews/${OBJECT_ID}`,
    allowed: ['support', 'manager', 'admin'],
  },

  // ── Coupons ───────────────────────────────────────────────────────────────
  { method: 'get', path: '/admin/coupons', allowed: ['manager', 'admin'] },
  { method: 'post', path: '/admin/coupons', allowed: ['manager', 'admin'] },
  { method: 'patch', path: `/admin/coupons/${OBJECT_ID}`, allowed: ['manager', 'admin'] },
  { method: 'delete', path: `/admin/coupons/${OBJECT_ID}`, allowed: ['manager', 'admin'] },

  // ── Payments ──────────────────────────────────────────────────────────────
  { method: 'get', path: '/admin/payments', allowed: ['manager', 'admin'] },
];

async function signIn(role: UserRole): Promise<ApiAgent> {
  const email = `${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`;
  await makeUser({ email, role });

  const api = await createApiAgent(app);
  const res = await api.post('/auth/login', { email, password: TEST_PASSWORD });
  expect(res.status).toBe(200);
  return api;
}

function call(api: ApiAgent, route: RouteCase) {
  switch (route.method) {
    case 'get':
      return api.get(route.path);
    case 'post':
      return api.post(route.path, {});
    case 'patch':
      return api.patch(route.path, {});
    case 'delete':
      return api.delete(route.path);
  }
}

describe('admin routes reject anonymous callers', () => {
  it.each(ADMIN_ROUTES)('$method $path → 401', async (route) => {
    const api = await createApiAgent(app);
    const res = await call(api, route);

    expect(res.status).toBe(401);
  });
});

describe('admin routes reject customers', () => {
  let customer: ApiAgent;

  beforeEach(async () => {
    customer = await signIn('customer');
  });

  it.each(ADMIN_ROUTES)('$method $path → 403', async (route) => {
    const res = await call(customer, route);

    // 403, never 200 and never 404 — a customer must not even be able to probe
    // which admin resources exist.
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('INSUFFICIENT_PERMISSIONS');
  });
});

describe('support role is read-only', () => {
  let support: ApiAgent;

  beforeEach(async () => {
    support = await signIn('support');
  });

  it.each(ADMIN_ROUTES.filter((r) => !r.allowed.includes('support')))(
    'cannot $method $path',
    async (route) => {
      const res = await call(support, route);
      expect(res.status).toBe(403);
    },
  );

  it.each(ADMIN_ROUTES.filter((r) => r.allowed.includes('support')))(
    'can reach $method $path',
    async (route) => {
      const res = await call(support, route);
      // Anything but 403 means the permission check passed. A 404 for a
      // non-existent id is the expected outcome and proves authorization
      // succeeded and the handler ran.
      expect(res.status).not.toBe(403);
    },
  );
});

describe('manager role', () => {
  it('can write to the catalog', async () => {
    const manager = await signIn('manager');
    const res = await manager.post('/admin/brands', { name: 'Manager Brand' });

    expect(res.status).toBe(201);
    expect(res.body.data.brand.slug).toBe('manager-brand');
  });

  it('cannot escalate its own role through the profile endpoint', async () => {
    const manager = await signIn('manager');
    // Mass assignment: `role` is not in the update schema, so it is stripped.
    const res = await manager.patch('/auth/profile', { name: 'Renamed', role: 'admin' });

    expect(res.status).toBe(200);
    expect(res.body.data.user.role).toBe('manager');
  });
});

describe('a disabled staff account loses access immediately', () => {
  it('is rejected on the next request after being disabled', async () => {
    const email = `manager-disable-${Date.now()}@example.com`;
    const user = await makeUser({ email, role: 'manager' });

    const api = await createApiAgent(app);
    await api.post('/auth/login', { email, password: TEST_PASSWORD });
    expect((await api.get('/admin/brands')).status).toBe(200);

    // Access tokens are stateless, but requireAuth re-reads status on every
    // request — that is what makes a suspension take effect at once rather than
    // whenever the JWT happens to expire.
    user.status = 'disabled';
    await user.save();

    const res = await api.get('/admin/brands');
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_DISABLED');
  });
});
