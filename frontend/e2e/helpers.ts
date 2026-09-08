import path from 'node:path';
import type { Page } from '@playwright/test';

/** Seeded accounts. The seed prints these; they exist only in dev fixtures. */
export const ACCOUNTS = {
  customer: { email: 'priya@example.com', password: 'Password123' },
  admin: { email: 'admin@aurora.local', password: 'Password123' },
  support: { email: 'support@aurora.local', password: 'Password123' },
};

const AUTH_DIR = path.join(import.meta.dirname, '.auth');

export const STATE_FILES = {
  customer: path.join(AUTH_DIR, 'customer.json'),
  admin: path.join(AUTH_DIR, 'admin.json'),
  support: path.join(AUTH_DIR, 'support.json'),
};

export async function signIn(page: Page, account: { email: string; password: string }) {
  await page.goto('/login');
  await page.locator('input[type=email]').fill(account.email);
  await page.locator('input[type=password]').fill(account.password);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 20_000 });
}

/**
 * Wait for a page to be ready to inspect.
 *
 * Deliberately NOT `waitForLoadState('networkidle')`, which waits for 500ms of
 * complete network silence and never gets it on a page whose queries refetch —
 * it simply hung until the test timed out. Playwright discourages it for
 * exactly this reason.
 *
 * A rendered heading says the route resolved and its lazy chunk loaded — but on
 * most admin screens the `<h1>` sits ABOVE the `isPending` branch, so it paints
 * while the page is still all skeletons. Waiting on the heading alone therefore
 * handed the accessibility and responsive sweeps a loading state to measure,
 * which has far less on it to fail: the "zero violations" those sweeps reported
 * was partly a statement about skeletons.
 *
 * So this waits for the skeletons to go too. Anything a test needs beyond a
 * loaded page should still be awaited explicitly by that test.
 */
export async function pageReady(page: Page) {
  await page.locator('h1, [role="heading"][aria-level="1"]').first().waitFor({ state: 'visible' });
  await page
    .locator('[data-slot="skeleton"], .animate-pulse')
    .first()
    .waitFor({ state: 'detached', timeout: 15_000 })
    .catch(() => undefined); // A page with no skeletons at all is already ready.
}
