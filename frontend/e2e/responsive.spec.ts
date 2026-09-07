import { expect, test } from '@playwright/test';
import { STATE_FILES, pageReady } from './helpers';

/**
 * No page may scroll sideways at any supported width.
 *
 * Measured by whether the page *can* scroll horizontally, not by comparing
 * `documentElement.scrollWidth` against `clientWidth`. Chrome reports the
 * root's scrollWidth as including the content of a descendant scroll
 * container, so a wide table scrolling correctly inside `overflow-x-auto`
 * reads as a page-level overflow when nothing is wrong — a false positive I
 * spent a while chasing before checking what the page actually does.
 */
const WIDTHS = [375, 768, 1024, 1440, 1920];

const STOREFRONT = ['/', '/products', '/cart', '/login'];
const ADMIN = [
  '/admin',
  '/admin/orders',
  '/admin/products',
  '/admin/products/new',
  '/admin/inventory',
  '/admin/categories',
  '/admin/brands',
  '/admin/media',
  '/admin/payments',
  '/admin/customers',
  '/admin/coupons',
];

async function scrollsSideways(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    window.scrollTo(2000, 0);
    const x = window.scrollX;
    window.scrollTo(0, 0);
    return x > 0;
  });
}

for (const width of WIDTHS) {
  test(`storefront does not overflow at ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    for (const path of STOREFRONT) {
      await page.goto(path);
      await pageReady(page);
      expect(await scrollsSideways(page), `${path} scrolls sideways at ${width}px`).toBe(false);
    }
    await context.close();
  });

  test(`admin does not overflow at ${width}px`, async ({ browser }) => {
    const context = await browser.newContext({
      viewport: { width, height: 900 },
      storageState: STATE_FILES.admin,
    });
    const page = await context.newPage();
    for (const path of ADMIN) {
      await page.goto(path);
      await pageReady(page);
      expect(await scrollsSideways(page), `${path} scrolls sideways at ${width}px`).toBe(false);
    }
    await context.close();
  });
}
