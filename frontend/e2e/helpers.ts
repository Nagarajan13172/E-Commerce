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
