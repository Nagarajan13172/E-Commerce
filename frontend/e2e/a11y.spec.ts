import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { STATE_FILES, pageReady } from './helpers';

/**
 * Automated accessibility gate.
 *
 * Axe catches perhaps a third of what a real audit would, but it catches that
 * third every single run — and the third it catches is the one that regresses
 * silently. When this suite was first written it found six colour-contrast
 * failures across the admin area, all from the same copy-pasted
 * `bg-<tone>/15 text-<tone>` badge idiom, which lowers contrast rather than
 * raising it. Both themes are scanned because the light theme passing says
 * nothing about the dark one: `--warning-foreground` is dark by design and was
 * measuring 1.35:1 against its own dark tint.
 */
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

const STOREFRONT = ['/', '/products', '/cart', '/account', '/account/orders', '/account/addresses'];
const ADMIN = [
  '/admin',
  '/admin/orders',
  '/admin/products',
  '/admin/products/new',
  '/admin/inventory',
  '/admin/customers',
  '/admin/reviews',
  '/admin/coupons',
];

/**
 * Wait for any toast to finish animating.
 *
 * Sonner fades a toast in, and axe scanning mid-transition sees near-white text
 * on near-white — a 1.01 contrast ratio that no user ever experiences. Scanning
 * the toast once it has settled is the honest check: it still gets audited, at
 * the opacity it is actually read at.
 */
async function settleToasts(page: import('@playwright/test').Page) {
  await page
    .waitForFunction(
      () =>
        [...document.querySelectorAll('[data-sonner-toast]')].every(
          (el) => Number(getComputedStyle(el).opacity) === 1,
        ),
      undefined,
      { timeout: 5_000 },
    )
    .catch(() => undefined);
}

async function scan(page: import('@playwright/test').Page) {
  await settleToasts(page);
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return results.violations.map(
    (v) =>
      `${v.id} (${v.impact}, ${v.nodes.length} node(s)): ${v.nodes[0]?.failureSummary?.split('\n')[1]?.trim() ?? v.help}`,
  );
}

for (const theme of ['light', 'dark'] as const) {
  test.describe(`${theme} theme`, () => {
    test.use({ colorScheme: theme });

    test('storefront has no WCAG A/AA violations', async ({ browser }) => {
      const context = await browser.newContext({
        storageState: STATE_FILES.customer,
        colorScheme: theme,
      });
      const page = await context.newPage();
      for (const path of STOREFRONT) {
        await page.goto(path);
        await pageReady(page);
        expect(await scan(page), `violations on ${path}`).toEqual([]);
      }
      await context.close();
    });

    test('admin has no WCAG A/AA violations', async ({ browser }) => {
      const context = await browser.newContext({
        storageState: STATE_FILES.admin,
        colorScheme: theme,
      });
      const page = await context.newPage();
      for (const path of ADMIN) {
        await page.goto(path);
        await pageReady(page);
        expect(await scan(page), `violations on ${path}`).toEqual([]);
      }
      await context.close();
    });
  });
}

/**
 * The product form, tab by tab.
 *
 * The sweep above only ever sees whichever tab is open by default, and tab
 * panels are not rendered until selected — so the uploader and the variant
 * table, by far the most control-dense parts of the admin, were never being
 * looked at. They are where a missing label actually costs someone their job.
 */
test.describe('product form', () => {
  for (const theme of ['light', 'dark'] as const) {
    test(`every tab is clean in the ${theme} theme`, async ({ browser }) => {
      const context = await browser.newContext({
        storageState: STATE_FILES.admin,
        colorScheme: theme,
      });
      const page = await context.newPage();
      await page.goto('/admin/products/new');
      await expect(page.getByRole('heading', { name: 'New product' })).toBeVisible();

      for (const tab of ['General', 'Media', 'Pricing', 'Variants', 'SEO']) {
        await page.getByRole('tab', { name: tab }).click();
        expect(await scan(page), `violations on the ${tab} tab`).toEqual([]);
      }

      // And again with a variant table on screen, which is a different tree.
      await page.getByRole('tab', { name: 'Variants' }).click();
      await page.getByLabel('New option name').fill('Colour');
      await page.getByRole('button', { name: 'Add option' }).click();
      await page.getByLabel('Add a value to Colour').fill('Black');
      await page.getByRole('button', { name: 'Add value to Colour' }).click();
      await page.getByRole('button', { name: 'Generate from options' }).click();
      await expect(page.locator('tbody tr')).toHaveCount(1);
      expect(await scan(page), 'violations with variants generated').toEqual([]);

      await context.close();
    });
  }
});
