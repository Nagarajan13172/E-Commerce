import { expect, test } from '@playwright/test';
import { STATE_FILES } from './helpers';

/**
 * Admin journeys, signed in as an administrator via stored state.
 *
 * The authorization assertions here are UX assertions. The server-side proof
 * lives in `backend/tests/integration/adminAuthz.test.ts`, which calls all 46
 * admin routes with a customer token and requires a 403 from every one. What
 * this file checks is the second half of that contract: that the interface does
 * not offer a control the server would refuse.
 */

test('the dashboard reports figures rather than an empty shell', async ({ page }) => {
  await page.goto('/admin');
  await page.waitForLoadState('networkidle');

  await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  // Exact, because "Revenue over time" and "Revenue by category" are also on
  // this page and a loose match is ambiguous.
  await expect(page.getByText('Revenue', { exact: true })).toBeVisible();
  await expect(page.getByText('Orders', { exact: true }).first()).toBeVisible();
  // Currency, never a bare number: money is formatted in one place.
  await expect(page.getByText(/₹[\d,]/).first()).toBeVisible();
});

test('an order can be opened from the list', async ({ page }) => {
  await page.goto('/admin/orders');
  await page.waitForLoadState('networkidle');

  const rows = page.locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  await rows.first().click();

  await expect(page).toHaveURL(/\/admin\/orders\/[a-f0-9]{24}/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/ORD-/);
});

test('products can be selected for a bulk action', async ({ page }) => {
  await page.goto('/admin/products');
  await page.waitForLoadState('networkidle');

  await page.locator('tbody tr').first().locator('button[role=checkbox]').click();
  await expect(page.getByText('1 selected')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Apply' })).toBeVisible();
});

test('a percentage coupon is refused without a ceiling', async ({ page }) => {
  await page.goto('/admin/coupons');
  await page.waitForLoadState('networkidle');

  await page.getByRole('button', { name: 'New coupon' }).click();
  await page.locator('#code').fill(`E2E${Date.now().toString().slice(-6)}`);
  await page.locator('#value').fill('25');
  await page.getByRole('button', { name: 'Create coupon' }).click();

  // The same shared Zod schema the API validates with. "50% off" with no cap
  // has no upper bound on a large basket.
  await expect(page.getByText(/set a maximum discount/i)).toBeVisible();
});

test('staff see only the sections their permissions allow', async ({ browser }) => {
  const context = await browser.newContext({ storageState: STATE_FILES.support });
  const page = await context.newPage();
  await page.goto('/admin/orders');
  await page.waitForLoadState('networkidle');

  const nav = page.locator('nav').first();
  await expect(nav.getByRole('link', { name: 'Orders' })).toBeVisible();
  // Support has neither analytics:read nor coupon:write, so the navigation is
  // filtered by permission rather than by role.
  await expect(nav.getByRole('link', { name: 'Dashboard' })).toHaveCount(0);
  await expect(nav.getByRole('link', { name: 'Coupons' })).toHaveCount(0);
  await context.close();
});
