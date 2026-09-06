import rateLimit, { ipKeyGenerator, type Options } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { isTest } from '../config/env.js';
import { cache, RedisCache } from '../integrations/cache/index.js';
import { AppError } from '../utils/AppError.js';
import { createLogger } from '../config/logger.js';

const limiterLog = createLogger('rate-limit');

/**
 * Rate limiting, layered by how expensive and how attackable each surface is.
 *
 * When Redis is available the counters are shared across API instances;
 * otherwise they fall back to per-process memory, which still stops naive abuse
 * but is per-instance. That is an accepted trade-off for a single-node dev setup.
 */
function store() {
  if (!(cache instanceof RedisCache)) return undefined;

  // Captured out of the narrowed branch: TypeScript does not preserve an
  // `instanceof` narrowing inside a closure over an imported binding.
  const client = cache.raw;
  return new RedisStore({
    sendCommand: (...args: string[]) => client.call(...(args as [string, ...string[]])) as never,
    prefix: 'rl:',
  });
}

const base: Partial<Options> = {
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  // Never rate-limit the test suite; it would make tests order-dependent.
  skip: () => isTest,
  handler: (_req, _res, next) => next(AppError.tooManyRequests()),
  // Fail OPEN. Rate limiting protects against abuse; it is not a correctness
  // mechanism. If Redis blips, briefly unthrottled traffic is a far better
  // outcome than returning 500 to every customer — failing closed here would
  // turn a cache outage into a full storefront outage.
  passOnStoreError: true,
  // Route the limiter's own diagnostics through pino instead of console, so
  // store failures are structured and redacted like everything else.
  logger: {
    error: (err: unknown, message?: string) =>
      limiterLog.error({ err }, message ?? 'rate limit store error'),
    warn: (err: unknown, message?: string) =>
      limiterLog.warn({ err }, message ?? 'rate limit store warning'),
  },
};

/** Broad protection for the whole API. */
export const globalLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: 300,
  store: store(),
});

/**
 * Credential endpoints. Keyed by IP *and* the submitted email, so one attacker
 * cannot lock every account from a single IP, and a distributed attack still
 * hits the per-account ceiling.
 */
export const authLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60_000,
  limit: 10,
  store: store(),
  keyGenerator: (req) => {
    const email = typeof req.body?.email === 'string' ? req.body.email.toLowerCase() : 'anon';
    // ipKeyGenerator normalises IPv6 to its /64 prefix — without it a single
    // client could rotate through billions of addresses to evade the limit.
    return `auth:${ipKeyGenerator(req.ip ?? '')}:${email}`;
  },
  message: 'Too many attempts. Please try again in 15 minutes.',
});

/** Password reset / verification resend — expensive because they send email. */
export const emailLimiter = rateLimit({
  ...base,
  windowMs: 60 * 60_000,
  limit: 5,
  store: store(),
  keyGenerator: (req) => `email:${ipKeyGenerator(req.ip ?? '')}`,
});

/** Search hits the text index; cheap per call but easy to hammer. */
export const searchLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: 120,
  store: store(),
});

/** Writes are costlier than reads and worth a tighter ceiling. */
export const writeLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: 60,
  store: store(),
});

/**
 * Checkout. Deliberately strict: each attempt reserves inventory, so abuse here
 * is a denial-of-inventory attack, not just wasted CPU.
 */
export const checkoutLimiter = rateLimit({
  ...base,
  windowMs: 10 * 60_000,
  limit: 20,
  store: store(),
  keyGenerator: (req) => `checkout:${req.user?.id ?? ipKeyGenerator(req.ip ?? '')}`,
});
