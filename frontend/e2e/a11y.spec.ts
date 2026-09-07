import { expect, test } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import { STATE_FILES } from './helpers';

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
  '/admin/inventory',
  '/admin/customers',
  '/admin/reviews',
  '/admin/coupons',
];

async function scan(page: import('@playwright/test').Page) {
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
        await page.waitForLoadState('networkidle');
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
        await page.waitForLoadState('networkidle');
        expect(await scan(page), `violations on ${path}`).toEqual([]);
      }
      await context.close();
    });
  });
}
