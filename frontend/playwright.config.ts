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
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:5173',
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
      testMatch: /admin\.spec\.ts/,
      dependencies: ['setup'],
      use: { ...devices['Desktop Chrome'], storageState: STATE_FILES.admin },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
