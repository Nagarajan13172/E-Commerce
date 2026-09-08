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
  '/admin/categories',
  '/admin/brands',
  '/admin/media',
  '/admin/payments',
  '/admin/customers',
  '/admin/reviews',
  '/admin/coupons',
];

/**
 * Wait for anything that fades in to finish fading.
 *
 * Toasts and dialogs both animate their opacity, and axe measures the composite
 * at whatever opacity it happens to catch. A toast mid-fade reported near-white
 * on near-white — 1.01:1. A dialog mid-fade let the overlay show through its own
 * card, so the same description measured 4.3:1 on one run, 4.21:1 on the next
 * and passed on a third, as the "background colour" drifted between #fdfdfc,
 * #ededec and #e6e6e5.
 *
 * None of those are states a person reads text in. Waiting for opacity to reach
 * 1 audits them where they are actually read, and — just as importantly — makes
 * the result deterministic, so a genuine regression is not lost among noise.
 */
async function settleAnimations(page: import('@playwright/test').Page) {
  await page
    .waitForFunction(
      () =>
        [
          ...document.querySelectorAll(
            '[data-sonner-toast], [role="dialog"], [data-slot="dialog-overlay"]',
          ),
        ].every((el) => Number(getComputedStyle(el).opacity) === 1),
      undefined,
      { timeout: 5_000 },
    )
    .catch(() => undefined);
}

async function scan(page: import('@playwright/test').Page) {
  await settleAnimations(page);
  const results = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return results.violations.map(
    (v) =>
      `${v.id} (${v.impact}, ${v.nodes.length} node(s)): ${v.nodes[0]?.failureSummary?.split('\n')[1]?.trim() ?? v.help}` +
      ` :: ${v.nodes[0]?.target.join(' ')} :: ${(v.nodes[0]?.html ?? '').slice(0, 200)}`,
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

/**
 * Dialogs, which the page sweeps never see.
 *
 * A dialog is not in the DOM until it is opened, so scanning the page it lives
 * on says nothing about it — and dialogs here are forms, which is precisely
 * where labelling and contrast go wrong.
 */
test.describe('dialogs', () => {
  for (const [path, open, label] of [
    ['/admin/categories', 'New category', 'category'],
    ['/admin/brands', 'New brand', 'brand'],
    ['/admin/coupons', 'New coupon', 'coupon'],
  ] as const) {
    test(`the ${label} dialog is clean`, async ({ browser }) => {
      const context = await browser.newContext({ storageState: STATE_FILES.admin });
      const page = await context.newPage();
      await page.goto(path);
      // Let the page behind finish loading first. Opening the dialog over a
      // still-loading page put animating skeletons under muted text, and axe
      // measured that transient pairing at 4.3:1 — a state no user sees, and
      // not what this test is about.
      await pageReady(page);
      await expect(page.locator('.animate-pulse')).toHaveCount(0);

      await page.getByRole('button', { name: open }).click();
      await expect(page.getByRole('dialog')).toBeVisible();

      expect(await scan(page), `violations in the ${label} dialog`).toEqual([]);
      await context.close();
    });
  }
});

/**
 * The uploader mid-upload.
 *
 * Progress rows exist only while a file is in flight, so every scan in this
 * file — page sweeps, the form's tabs, the dialogs — is structurally incapable
 * of seeing them. They were unnamed progressbars with no value: a wcag2a
 * failure that automated coverage reported nothing about, because the coverage
 * could never reach the state.
 */
test('upload progress is announced, not just drawn', async ({ browser }) => {
  const context = await browser.newContext({ storageState: STATE_FILES.admin });
  const page = await context.newPage();

  // Hold the presign open so the pending row stays on screen to be scanned.
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/v1/admin/media/presign', async (route) => {
    await held;
    await route.continue();
  });

  await page.goto('/admin/products/new');
  await pageReady(page);
  await page.getByRole('tab', { name: 'Media' }).click();

  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAA' +
      'IUlEQVR4nO3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAOA3EMwAAeM0uYcAAAAASUVORK5CYII=',
    'base64',
  );
  await page.setInputFiles('input[type=file]', {
    name: 'progress.png',
    mimeType: 'image/png',
    buffer: png,
  });

  const bar = page.getByRole('progressbar');
  await expect(bar).toBeVisible();
  // A progressbar with no accessible name is exactly what axe objects to.
  await expect(bar).toHaveAccessibleName(/uploading progress\.png/i);

  expect(await scan(page), 'violations while an upload is in flight').toEqual([]);

  release();
  await context.close();
});
