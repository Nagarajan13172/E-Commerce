import { afterAll, beforeAll } from 'vitest';

/**
 * Global test bootstrap.
 *
 * NODE_ENV must be `test` before any application module is imported: `env.ts`
 * reads it to decide which .env file to load, and `logger.ts` reads it to go
 * silent. Setting it inside a test would be too late — module init has run.
 */
process.env.NODE_ENV = 'test';

// Deterministic secrets so tests never depend on a developer's local .env.
process.env.JWT_SECRET ??= 'test-jwt-secret-value-that-is-long-enough-x';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-value-that-is-long-enough';
process.env.CSRF_SECRET ??= 'test-csrf-secret-value-that-is-long-enough-abc';
process.env.CLIENT_URL ??= 'http://localhost:5173';
process.env.API_URL ??= 'http://localhost:4000';
process.env.MONGODB_URI ??= 'mongodb://localhost:27017/ecommerce_test?directConnection=true';
process.env.STORAGE_ENDPOINT ??= 'http://localhost:9000';
process.env.STORAGE_ACCESS_KEY ??= 'minioadmin';
process.env.STORAGE_SECRET_KEY ??= 'minioadmin';
process.env.STORAGE_BUCKET ??= 'ecom-media-test';
process.env.STORAGE_PUBLIC_URL ??= 'http://localhost:9000/ecom-media-test';
// Force the in-memory cache: tests must not depend on a running Redis, and
// must not leak state between files through a shared one.
process.env.REDIS_URL = '';

beforeAll(() => {
  // Placeholder for future global fixtures; per-suite DB setup lives in db.ts.
});

// Release the HTTP servers the API helper opened, so a test file does not leave
// a listening handle behind and stall the worker's exit.
afterAll(async () => {
  const { closeTestServers } = await import('./api.js');
  await closeTestServers();
});
