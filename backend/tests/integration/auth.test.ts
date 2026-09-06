import { beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { useTestDatabase } from '../helpers/db.js';
import {
  createApiAgent,
  readSetCookie,
  uniqueEmail,
  VALID_PASSWORD,
  type ApiAgent,
} from '../helpers/api.js';
import { createApp } from '../../src/app.js';
import { User } from '../../src/models/user.model.js';
import { RefreshToken } from '../../src/models/refreshToken.model.js';
import { getTestEmailProvider } from '../../src/integrations/email/index.js';

/**
 * The in-memory email provider is the only place a one-time token's plaintext
 * exists after issuance — tokens are stored hashed, exactly as they would be in
 * production. Reading it out of the email is precisely what a real user does by
 * clicking the link.
 */
const mailbox = getTestEmailProvider()!;

useTestDatabase();

const app = createApp();
let api: ApiAgent;

beforeEach(async () => {
  api = await createApiAgent(app);
  mailbox.clear();
});

/** The token from the most recent email of a given kind sent to an address. */
function tokenFromEmail(email: string, subjectContains: string): string {
  const message = mailbox.lastTo(email, subjectContains);
  if (!message) throw new Error(`No "${subjectContains}" email was sent to ${email}`);
  const token = mailbox.tokenFrom(message);
  if (!token) throw new Error(`No token found in the email sent to ${email}`);
  return token;
}

async function registerUser(email = uniqueEmail()) {
  const res = await api.post('/auth/register', {
    name: 'Test Shopper',
    email,
    password: VALID_PASSWORD,
    confirmPassword: VALID_PASSWORD,
  });
  return { res, email };
}

describe('registration', () => {
  it('creates an account and establishes a session', async () => {
    const { res, email } = await registerUser();

    expect(res.status).toBe(201);
    expect(res.body.data.user.email).toBe(email);
    expect(res.body.data.user.role).toBe('customer');
    expect(res.body.data.user.emailVerified).toBe(false);

    const cookies = res.headers['set-cookie'] as unknown as string[];
    expect(cookies.some((c) => c.startsWith('access_token='))).toBe(true);
    expect(cookies.some((c) => c.startsWith('refresh_token='))).toBe(true);
  });

  it('never returns the password hash', async () => {
    const { res } = await registerUser();

    const serialised = JSON.stringify(res.body);
    expect(serialised).not.toContain('passwordHash');
    expect(serialised).not.toContain('$argon2');
    expect(serialised).not.toContain('tokenVersion');
  });

  it('stores the password as an argon2id hash, never in plain text', async () => {
    const { email } = await registerUser();

    const user = await User.findOne({ email }).select('+passwordHash');
    expect(user!.passwordHash).toMatch(/^\$argon2id\$/);
    expect(user!.passwordHash).not.toContain(VALID_PASSWORD);
  });

  it('rejects a duplicate email with a specific code', async () => {
    const email = uniqueEmail();
    await registerUser(email);
    const second = await registerUser(email);

    expect(second.res.status).toBe(409);
    expect(second.res.body.code).toBe('EMAIL_ALREADY_REGISTERED');
  });

  it('rejects a weak password with a field-level error', async () => {
    const res = await api.post('/auth/register', {
      name: 'Test',
      email: uniqueEmail(),
      password: 'weak',
      confirmPassword: 'weak',
    });

    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
    expect(res.body.errors.some((e: { field: string }) => e.field === 'password')).toBe(true);
  });

  it('ignores a role supplied by the client — privilege escalation guard', async () => {
    const email = uniqueEmail();
    const res = await api.post('/auth/register', {
      name: 'Sneaky',
      email,
      password: VALID_PASSWORD,
      confirmPassword: VALID_PASSWORD,
      role: 'admin',
    });

    expect(res.status).toBe(201);
    expect(res.body.data.user.role).toBe('customer');
    const user = await User.findOne({ email });
    expect(user!.role).toBe('customer');
  });
});

describe('login', () => {
  it('signs in with correct credentials', async () => {
    const { email } = await registerUser();
    const fresh = await createApiAgent(app);

    const res = await fresh.post('/auth/login', { email, password: VALID_PASSWORD });

    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(email);
  });

  it('gives the same error for a wrong password and an unknown account', async () => {
    const { email } = await registerUser();
    const fresh = await createApiAgent(app);

    const wrongPassword = await fresh.post('/auth/login', { email, password: 'WrongPass123' });
    const unknownEmail = await fresh.post('/auth/login', {
      email: uniqueEmail(),
      password: VALID_PASSWORD,
    });

    // Identical status, code and message: no account enumeration oracle.
    expect(wrongPassword.status).toBe(401);
    expect(unknownEmail.status).toBe(401);
    expect(wrongPassword.body.code).toBe(unknownEmail.body.code);
    expect(wrongPassword.body.message).toBe(unknownEmail.body.message);
  });

  it('locks the account after repeated failures', async () => {
    const { email } = await registerUser();
    const fresh = await createApiAgent(app);

    for (let attempt = 0; attempt < 5; attempt += 1) {
      await fresh.post('/auth/login', { email, password: 'WrongPass123' });
    }

    // Even the correct password is refused while the lock holds.
    const res = await fresh.post('/auth/login', { email, password: VALID_PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_LOCKED');
  });

  it('refuses a disabled account', async () => {
    const { email } = await registerUser();
    await User.updateOne({ email }, { $set: { status: 'disabled' } });
    const fresh = await createApiAgent(app);

    const res = await fresh.post('/auth/login', { email, password: VALID_PASSWORD });
    expect(res.status).toBe(403);
    expect(res.body.code).toBe('ACCOUNT_DISABLED');
  });
});

describe('session', () => {
  it('returns the current user from the session cookie', async () => {
    const { email } = await registerUser();

    const res = await api.get('/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe(email);
  });

  it('rejects an unauthenticated request', async () => {
    const res = await api.get('/auth/me');
    expect(res.status).toBe(401);
  });

  it('rotates the refresh token on every use', async () => {
    const { email } = await registerUser();
    const user = await User.findOne({ email });

    const before = await RefreshToken.find({ user: user!._id }).lean();
    expect(before).toHaveLength(1);

    const res = await api.post('/auth/refresh');
    expect(res.status).toBe(200);

    const after = await RefreshToken.find({ user: user!._id }).sort({ createdAt: 1 }).lean();
    expect(after).toHaveLength(2);
    // The presented token is retired, and its successor is recorded.
    expect(after[0]!.revokedAt).toBeTruthy();
    expect(after[0]!.reasonRevoked).toBe('rotated');
    expect(after[0]!.replacedByHash).toBe(after[1]!.tokenHash);
    expect(after[1]!.revokedAt).toBeFalsy();
    // Same sign-in, so the family is unchanged.
    expect(after[1]!.family).toBe(after[0]!.family);
  });

  it('detects refresh token reuse and revokes the whole family', async () => {
    const email = uniqueEmail();
    const fresh = await createApiAgent(app);

    // Register on a bare agent so the refresh cookie can be read off the wire —
    // this is the attacker's copy of the token.
    const registered = await fresh.post('/auth/register', {
      name: 'Reuse Victim',
      email,
      password: VALID_PASSWORD,
      confirmPassword: VALID_PASSWORD,
    });
    const stolenToken = readSetCookie(registered, 'refresh_token')!;
    expect(stolenToken).toBeTruthy();

    const user = await User.findOne({ email });

    // The legitimate client refreshes, retiring the stolen copy.
    const rotated = await fresh.post('/auth/refresh');
    expect(rotated.status).toBe(200);

    // The attacker now replays the token they captured earlier. A bare request
    // is used rather than the agent, so the agent's own (already rotated)
    // cookie jar cannot overwrite the stolen value.
    const replay = await request(app)
      .post('/api/v1/auth/refresh')
      .set(
        'Cookie',
        `csrf_token=${encodeURIComponent(fresh.csrfToken)}; refresh_token=${stolenToken}`,
      )
      .set('X-CSRF-Token', fresh.csrfToken);

    expect(replay.status).toBe(401);
    expect(replay.body.code).toBe('REFRESH_TOKEN_REUSED');

    // Every token in that family is dead — including the legitimate successor.
    // Losing the real session is the correct trade: we cannot tell victim from
    // thief, so both are forced to sign in again.
    const family = await RefreshToken.find({ user: user!._id }).lean();
    expect(family.every((t) => t.revokedAt)).toBe(true);
    expect(family.some((t) => t.reasonRevoked === 'reuse_detected')).toBe(true);
  });

  it('signs out and revokes the refresh token', async () => {
    const { email } = await registerUser();
    const user = await User.findOne({ email });

    const res = await api.post('/auth/logout');
    expect(res.status).toBe(200);

    const tokens = await RefreshToken.find({ user: user!._id }).lean();
    expect(tokens.every((t) => t.revokedAt)).toBe(true);
    expect(await api.get('/auth/me').then((r) => r.status)).toBe(401);
  });
});

describe('email verification', () => {
  it('confirms an address with a valid token and marks it single-use', async () => {
    const { email } = await registerUser();
    const token = tokenFromEmail(email, 'confirm');

    const res = await api.post('/auth/verify-email', { token });
    expect(res.status).toBe(200);
    expect(res.body.data.user.emailVerified).toBe(true);

    // A second use of the same link fails.
    const replay = await api.post('/auth/verify-email', { token });
    expect(replay.status).toBe(400);
  });

  it('rejects a forged token', async () => {
    await registerUser();
    const res = await api.post('/auth/verify-email', { token: 'a'.repeat(40) });
    expect(res.status).toBe(400);
  });
});

describe('password reset', () => {
  it('responds identically whether or not the account exists', async () => {
    const { email } = await registerUser();

    const known = await api.post('/auth/forgot-password', { email });
    const unknown = await api.post('/auth/forgot-password', { email: uniqueEmail() });

    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(known.body.message).toBe(unknown.body.message);
  });

  it('resets the password and revokes every existing session', async () => {
    const { email } = await registerUser();
    const user = await User.findOne({ email }).select('+tokenVersion');
    const versionBefore = user!.tokenVersion;

    await api.post('/auth/forgot-password', { email });
    const token = tokenFromEmail(email, 'reset');

    const newPassword = 'BrandNewPass1';
    const res = await api.post('/auth/reset-password', {
      token,
      password: newPassword,
      confirmPassword: newPassword,
    });
    expect(res.status).toBe(200);

    // tokenVersion bumped: outstanding access tokens are dead immediately, not
    // when they happen to expire.
    const after = await User.findOne({ email }).select('+tokenVersion');
    expect(after!.tokenVersion).toBe(versionBefore + 1);

    const refreshTokens = await RefreshToken.find({ user: user!._id }).lean();
    expect(refreshTokens.every((t) => t.revokedAt)).toBe(true);

    // The new password works; the old one does not.
    const fresh = await createApiAgent(app);
    expect(
      await fresh.post('/auth/login', { email, password: newPassword }).then((r) => r.status),
    ).toBe(200);

    const fresh2 = await createApiAgent(app);
    expect(
      await fresh2.post('/auth/login', { email, password: VALID_PASSWORD }).then((r) => r.status),
    ).toBe(401);
  });
});

describe('NoSQL injection', () => {
  it('cannot bypass login with a query operator payload', async () => {
    await registerUser('injection-target@example.com');

    // The classic attack: if `email` reached the query unparsed, `$ne: null`
    // would match the first user and log the attacker in as them.
    const res = await api.post('/auth/login', {
      email: { $ne: null },
      password: { $ne: null },
    });

    // Zod rejects it as a type error long before Mongoose sees it.
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('strips unknown keys rather than passing them through', async () => {
    const email = uniqueEmail();
    const res = await api.post('/auth/register', {
      name: 'Test',
      email,
      password: VALID_PASSWORD,
      confirmPassword: VALID_PASSWORD,
      status: 'banned',
      tokenVersion: 999,
      emailVerifiedAt: new Date().toISOString(),
    });

    expect(res.status).toBe(201);
    const user = await User.findOne({ email }).select('+tokenVersion');
    expect(user!.status).toBe('active');
    expect(user!.tokenVersion).toBe(0);
    expect(user!.emailVerifiedAt).toBeUndefined();
  });
});
