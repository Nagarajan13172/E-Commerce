import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { useTestDatabase } from '../helpers/db.js';
import { createApiAgent, uniqueEmail, VALID_PASSWORD, type ApiAgent } from '../helpers/api.js';
import { makeProduct, makeUser, TEST_PASSWORD } from '../helpers/factories.js';
import { createApp } from '../../src/app.js';
import { User } from '../../src/models/user.model.js';

/**
 * Adversarial tests.
 *
 * Every other suite checks that the application does what it should when asked
 * politely. This one asks impolitely: injection payloads, forged privileges,
 * other people's data, missing tokens. Each test corresponds to a rule the
 * brief made non-negotiable, and each would be a real vulnerability if it
 * failed — so they are written as attacks, not as feature checks.
 */

useTestDatabase();

const app = createApp();
const PREFIX = '/api/v1';

let api: ApiAgent;
beforeEach(async () => {
  api = await createApiAgent(app);
});

// ── NoSQL injection ─────────────────────────────────────────────────────────

describe('NoSQL injection', () => {
  it('cannot authenticate with an operator object in place of an email', async () => {
    await makeUser({ email: 'victim@example.com' });

    // The classic Mongo auth bypass: `{$ne: null}` matches the first user.
    // Strict Zod parsing rejects it as a non-string before any query is built.
    const res = await api.post('/auth/login', {
      email: { $ne: null },
      password: { $ne: null },
    });

    expect(res.status).toBe(422);
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('drops a bracketed operator in the query string instead of filtering by it', async () => {
    await makeProduct({ name: 'Visible Thing', price: 500 });

    const clean = await api.get('/products');
    const injected = await api.get('/products?minPrice[$gt]=999999');

    // Express 5's default `simple` query parser does not build nested objects,
    // so this arrives as the flat, unrecognised key "minPrice[$gt]" and the
    // schema strips it. The proof is that it changed nothing: had it been read
    // as `{minPrice: {$gt: 999999}}` and reached the pipeline, the result set
    // would be empty.
    expect(injected.status).toBe(200);
    expect(injected.body.data.items).toHaveLength(clean.body.data.items.length);
  });

  it('keeps the query parser in the mode that makes nested injection impossible', () => {
    // Switching this to 'extended' would let `?a[$ne]=1` become a real object
    // again. The schemas reject that too, but this is the structural guarantee
    // underneath them, and it should not change without a deliberate re-audit.
    expect(app.get('query parser')).toBe('simple');
  });

  it('strips unknown query parameters rather than passing them through', async () => {
    await makeProduct({ name: 'Filtered Thing', price: 500 });

    // Whitelisting, not blacklisting: an unrecognised key is dropped by the
    // schema, so it can never become part of a filter.
    const res = await api.get('/products?$where=this.price>0&limit=5');

    expect(res.status).toBe(200);
    expect(res.body.data.items.length).toBeGreaterThan(0);
  });

  it('treats a regex operator as text rather than a pattern', async () => {
    await makeProduct({ name: 'Findable Thing', price: 500 });

    // `.*` would match everything if it reached Mongo as a $regex.
    const res = await api.get('/products?q=' + encodeURIComponent('.*'));

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
  });
});

describe('regex injection', () => {
  it('treats regex metacharacters in a search term as literal text', async () => {
    await makeProduct({ name: 'Findable Thing', price: 500 });
    const email = uniqueEmail('regex');
    await makeUser({ email, role: 'admin' });
    await api.post('/auth/login', { email, password: TEST_PASSWORD });

    // Unescaped, `.*` matches every row — a search box that returns the whole
    // catalogue regardless of what was typed.
    const wildcard = await api.get('/admin/products?q=' + encodeURIComponent('.*'));
    expect(wildcard.status).toBe(200);
    expect(wildcard.body.data.items).toHaveLength(0);

    // Unbalanced brackets are an invalid pattern: unescaped, this throws inside
    // the driver and the search box becomes a 500.
    const malformed = await api.get('/admin/products?q=' + encodeURIComponent('[a-'));
    expect(malformed.status).toBe(200);

    // Catastrophic backtracking, the denial-of-service case.
    const redos = await api.get('/admin/products?q=' + encodeURIComponent('(a+)+$'));
    expect(redos.status).toBe(200);
  });

  it('still matches a term that happens to contain a metacharacter', async () => {
    await makeProduct({ name: 'Nike Air Max (2024)', price: 9999 });
    const email = uniqueEmail('literal');
    await makeUser({ email, role: 'admin' });
    await api.post('/auth/login', { email, password: TEST_PASSWORD });

    // Escaping must not break legitimate searches — brackets appear in real
    // product names constantly.
    const res = await api.get('/admin/products?q=' + encodeURIComponent('(2024)'));
    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(1);
  });
});

// ── Privilege escalation ────────────────────────────────────────────────────

describe('privilege escalation', () => {
  it('ignores a role sent at registration', async () => {
    const email = uniqueEmail('escalate');

    await api.post('/auth/register', {
      name: 'Sneaky',
      email,
      password: VALID_PASSWORD,
      confirmPassword: VALID_PASSWORD,
      role: 'admin',
      status: 'active',
    });

    const user = await User.findOne({ email }).lean();
    expect(user?.role).toBe('customer');
  });

  it('ignores a role sent to the profile endpoint', async () => {
    const email = uniqueEmail('profile');
    await makeUser({ email });
    await api.post('/auth/login', { email, password: TEST_PASSWORD });

    await api.patch('/auth/profile', { name: 'Renamed', role: 'admin', tokenVersion: 99 });

    const user = await User.findOne({ email }).lean();
    expect(user?.name).toBe('Renamed');
    expect(user?.role).toBe('customer');
  });

  it('does not let a customer promote themselves through the admin API', async () => {
    const email = uniqueEmail('selfpromote');
    const user = await makeUser({ email });
    await api.post('/auth/login', { email, password: TEST_PASSWORD });

    const res = await api.patch(`/admin/customers/${String(user._id)}/role`, { role: 'admin' });

    expect(res.status).toBe(403);
    const after = await User.findById(user._id).lean();
    expect(after?.role).toBe('customer');
  });
});

// ── Secrets and data leakage ────────────────────────────────────────────────

describe('response leakage', () => {
  it('never returns a password hash', async () => {
    const email = uniqueEmail('hash');
    await makeUser({ email });

    const login = await api.post('/auth/login', { email, password: TEST_PASSWORD });
    const me = await api.get('/auth/me');

    // Serialised and searched as text, so a hash nested anywhere still fails.
    for (const body of [login.body, me.body]) {
      const text = JSON.stringify(body);
      expect(text).not.toContain('$argon2');
      expect(text).not.toMatch(/passwordHash/i);
    }
  });

  it('gives the same answer for a wrong password and an unknown account', async () => {
    await makeUser({ email: 'known@example.com' });

    const wrongPassword = await api.post('/auth/login', {
      email: 'known@example.com',
      password: 'WrongPassword9',
    });
    const noSuchUser = await api.post('/auth/login', {
      email: 'nobody@example.com',
      password: 'WrongPassword9',
    });

    // Differing responses would turn the login form into an account oracle.
    expect(wrongPassword.status).toBe(noSuchUser.status);
    expect(wrongPassword.body.code).toBe(noSuchUser.body.code);
    expect(wrongPassword.body.message).toBe(noSuchUser.body.message);
  });

  it('does not confirm whether an address is registered on password reset', async () => {
    await makeUser({ email: 'real@example.com' });

    const known = await api.post('/auth/forgot-password', { email: 'real@example.com' });
    const unknown = await api.post('/auth/forgot-password', { email: 'ghost@example.com' });

    expect(known.status).toBe(unknown.status);
    expect(known.body.message).toBe(unknown.body.message);
  });
});

// ── Cross-account access ────────────────────────────────────────────────────

describe('cross-account access', () => {
  it('will not serve one customer another customer address', async () => {
    const victimEmail = uniqueEmail('victim');
    const victim = await makeUser({ email: victimEmail });
    const victimApi = await createApiAgent(app);
    await victimApi.post('/auth/login', { email: victimEmail, password: TEST_PASSWORD });
    const created = await victimApi.post('/account/addresses', {
      fullName: 'Victim',
      phone: '9876543210',
      line1: '1 Private Road',
      city: 'Chennai',
      state: 'TN',
      postalCode: '600001',
      country: 'India',
    });
    const addressId = created.body.data.addresses[0]._id as string;

    const attackerEmail = uniqueEmail('attacker');
    await makeUser({ email: attackerEmail });
    const attacker = await createApiAgent(app);
    await attacker.post('/auth/login', { email: attackerEmail, password: TEST_PASSWORD });

    // Guessing an id must not be enough — ownership is scoped server-side.
    const read = await attacker.patch(`/account/addresses/${addressId}`, { city: 'Hijacked' });
    expect([403, 404]).toContain(read.status);

    const stillMine = await User.findById(victim._id).lean();
    expect(stillMine?.addresses?.[0]?.city).toBe('Chennai');
  });
});

// ── Transport and headers ───────────────────────────────────────────────────

describe('security headers and cookies', () => {
  it('sets the headers that stop a JSON response being weaponised', async () => {
    const res = await request(app).get(`${PREFIX}/health`);

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'none'");
    expect(res.headers['content-security-policy']).toContain("frame-ancestors 'none'");
    expect(res.headers['referrer-policy']).toBe('no-referrer');
    // Advertising the framework hands an attacker a version to look up.
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('issues session cookies that JavaScript cannot read', async () => {
    const email = uniqueEmail('cookies');
    await makeUser({ email });

    const res = await api.post('/auth/login', { email, password: TEST_PASSWORD });
    const cookies = (res.headers['set-cookie'] as unknown as string[]) ?? [];

    const access = cookies.find((c) => c.startsWith('access_token='));
    const refresh = cookies.find((c) => c.startsWith('refresh_token='));

    expect(access).toMatch(/HttpOnly/i);
    expect(refresh).toMatch(/HttpOnly/i);
    expect(access).toMatch(/SameSite/i);
    // The refresh token is scoped to the endpoint that consumes it, so it is
    // not attached to every ordinary API call.
    expect(refresh).toMatch(/Path=\/api\/v1\/auth/i);
  });

  it('refuses a state-changing request with no CSRF token', async () => {
    const email = uniqueEmail('csrf');
    await makeUser({ email });

    // Deliberately bypasses the helper, which supplies the header.
    const res = await request(app)
      .post(`${PREFIX}/auth/login`)
      .send({ email, password: TEST_PASSWORD });

    expect(res.status).toBe(403);
    expect(res.body.code).toBe('CSRF_TOKEN_INVALID');
  });

  it('refuses a forged CSRF token that was not signed by us', async () => {
    const res = await request(app)
      .post(`${PREFIX}/auth/login`)
      .set('Cookie', 'csrf_token=forged.signature')
      .set('X-CSRF-Token', 'forged.signature')
      .send({ email: 'a@example.com', password: VALID_PASSWORD });

    expect(res.status).toBe(403);
  });

  it('caps the request body', async () => {
    const res = await api.post('/auth/login', {
      email: 'a@example.com',
      password: 'x'.repeat(300_000),
    });

    // 413 from the body parser, or 422 if the schema rejects it first — either
    // way the payload never reaches a handler.
    expect([413, 422]).toContain(res.status);
  });
});
