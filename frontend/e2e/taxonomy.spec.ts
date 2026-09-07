import { expect, test } from '@playwright/test';
import { pageReady, STATE_FILES } from './helpers';

/**
 * Categories, brands, media and payments.
 *
 * All four back onto endpoints that already existed and were already
 * authorization-tested; what was missing was any interface calling them. These
 * tests cover the writes, because a read-only screen that renders is easy to
 * verify by looking and a write that half-succeeds is not.
 */

const stamp = () => Date.now().toString().slice(-7);
const created: { categories: string[]; brands: string[] } = { categories: [], brands: [] };

/** Remove what the suite made, so a development catalogue does not fill with it. */
test.afterAll(async ({ playwright }) => {
  if (created.categories.length + created.brands.length === 0) return;

  const request = await playwright.request.newContext({ storageState: STATE_FILES.admin });
  const csrf = (await request.storageState()).cookies.find((c) => c.name === 'csrf_token')?.value;
  const headers = csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {};

  // Children before parents: deleting a category with descendants is refused.
  for (const id of created.categories.reverse()) {
    await request
      .delete(`http://localhost:4000/api/v1/admin/categories/${id}`, { headers })
      .catch(() => undefined);
  }
  for (const id of created.brands) {
    await request
      .delete(`http://localhost:4000/api/v1/admin/brands/${id}`, { headers })
      .catch(() => undefined);
  }
  await request.dispose();
});

test('a category can be created, nested and reordered', async ({ page }) => {
  const id = stamp();
  const parentName = `Zz Suite ${id}`;
  const childName = `Zz Child ${id}`;

  await page.goto('/admin/categories');
  await pageReady(page);

  // The tree's own row label, not any of the accessible names on its buttons,
  // the success toast, or an option in a category picker — all of which
  // legitimately contain the name too.
  const treeLabel = (name: string) =>
    page.locator('#main-content span.flex-1', { hasText: name }).first();

  await page.getByRole('button', { name: 'New category' }).click();
  await page.locator('#categoryName').fill(parentName);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(treeLabel(parentName)).toBeVisible();

  // A subcategory, added from the parent's own row.
  const parentRow = page.locator('li', { hasText: parentName }).first();
  await parentRow
    .getByRole('button', { name: /Add a subcategory/ })
    .first()
    .click();
  await page.locator('#categoryName').fill(childName);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(treeLabel(childName)).toBeVisible();

  // The server builds the materialised path and ancestor list from the parent.
  const tree = await (
    await page.request.get('http://localhost:4000/api/v1/admin/categories')
  ).json();
  const flatten = (nodes: { children?: unknown[] }[]): Record<string, unknown>[] =>
    nodes.flatMap((n) => [n as Record<string, unknown>, ...flatten((n.children ?? []) as never)]);
  const all = flatten(tree.data.items);

  const parent = all.find((c) => c.name === parentName)!;
  const child = all.find((c) => c.name === childName)!;
  created.categories.push(parent._id as string, child._id as string);

  expect(child.level).toBe(1);
  expect(child.parent).toBe(parent._id);
  expect(child.path).toBe(`${parent.slug as string}/${child.slug as string}`);

  // Reordering sends the whole sibling list, because a position only means
  // anything relative to its siblings.
  const rootLabels = () => page.locator('div[style*="padding-left: 0.5rem"] span.flex-1');
  const before = await rootLabels().allTextContents();

  // Whichever direction is actually available. A new category takes order 0, so
  // it can land first among the roots, and "move up" is then correctly disabled
  // — asserting on that direction specifically tested the fixture, not the
  // feature.
  const up = page.getByRole('button', { name: `Move ${parentName} up` });
  const down = page.getByRole('button', { name: `Move ${parentName} down` });
  await ((await up.isEnabled()) ? up : down).click();

  await expect
    .poll(async () => (await rootLabels().allTextContents()).join('|'))
    .not.toBe(before.join('|'));
});

test('a brand is validated by the shared schema before it is created', async ({ page }) => {
  const name = `Zz Brand ${stamp()}`;

  await page.goto('/admin/brands');
  await pageReady(page);

  await page.getByRole('button', { name: 'New brand' }).click();
  await page.locator('#brandName').fill(name);
  await page.locator('#brandWebsite').fill('not-a-url');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText('Enter a valid URL')).toBeVisible();

  await page.locator('#brandWebsite').fill('https://example.com');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('cell', { name }).first()).toBeVisible();

  const brands = await (await page.request.get('http://localhost:4000/api/v1/admin/brands')).json();
  const brand = brands.data.items.find((b: { name: string }) => b.name === name);
  expect(brand).toBeTruthy();
  created.brands.push(brand._id);
});

test('the product form offers nested categories, not just the roots', async ({ page }) => {
  await page.goto('/admin/products/new');
  await pageReady(page);

  await page.locator('#category').click();
  const options = await page.locator('[role=option]').allTextContents();

  // Regression: the endpoint returns a nested tree, and iterating it directly
  // offered only the top level — most of the catalogue was unreachable.
  expect(options.length).toBeGreaterThan(5);
  expect(options.filter((option) => option.includes('—')).length).toBeGreaterThan(0);
});

test('the payment ledger lists real payments and links to their orders', async ({ page }) => {
  await page.goto('/admin/payments');
  await pageReady(page);

  const rows = page.locator('tbody tr');
  await expect(rows.first()).toBeVisible();
  // Every payment belongs to an order, and the ledger is a way into it.
  await expect(rows.first().getByRole('link')).toHaveAttribute('href', /\/admin\/orders\//);
});

test('the media library lists uploaded files', async ({ page }) => {
  await page.goto('/admin/media');
  await pageReady(page);

  await expect(page.getByRole('button', { name: 'Choose images' })).toBeVisible();
  // Deleting media is genuinely destructive, so the control must exist and the
  // confirmation must say what will happen.
  const firstDelete = page.getByRole('button', { name: /Delete this file/ }).first();
  await expect(firstDelete).toBeVisible();
  await firstDelete.click();
  await expect(page.getByText(/cannot be recovered/)).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
});
