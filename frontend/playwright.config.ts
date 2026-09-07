import { defineConfig, devices } from '@playwright/test';
import { STATE_FILES } from './e2e/helpers';

/**
 * End-to-end and accessibility tests.
 *
 * These run against the real stack — a real API, a real MongoDB replica set, a
 * real MinIO — because the bugs worth catching here are exactly the ones that
 * only exist when the pieces are joined up. Unit and integration tests already
 * cover the pieces in isolation.
 *
 * They are therefore NOT part of `pnpm test`: they need `docker compose up` and
 * a seeded database, and a suite that fails for want of infrastructure trains
 * people to ignore it. `pnpm test:e2e` runs them deliberately.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:4173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    // One sign-in per role for the whole run; see e2e/auth.setup.ts.
    { name: 'setup', testMatch: /auth\.setup\.ts/ },
    {
      name: 'customer',
      testMatch: /shopping\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: STATE_FILES.customer },
    },
    {
      name: 'a11y',
      testMatch: /a11y\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'responsive',
      testMatch: /responsive\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'admin',
      testMatch: /(admin|product-editor|taxonomy)\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: STATE_FILES.admin },
    },
  ],
  /**
   * Serve the production build, not the dev server.
   *
   * Vite transforms a route's modules the first time that route is visited, so
   * against `pnpm dev` the first run after any edit pays compilation inside
   * whichever assertion happens to touch each page — enough on the heavier
   * admin screens to blow a 10-second expectation and fail a suite that is
   * working correctly. Chasing that with longer timeouts only hides genuinely
   * slow pages too.
   *
   * A preview server serves static files, so the timing is stable, the suite
   * runs in a third of the time, and — the part that actually matters — it
   * exercises the bundle that ships rather than an unminified dev graph.
   *
   * The API still needs to be running separately; only the web app is built.
   */
  webServer: {
    command: 'pnpm build && pnpm exec vite preview --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
