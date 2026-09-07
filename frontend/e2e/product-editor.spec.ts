import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { expect, test } from '@playwright/test';
import { STATE_FILES } from './helpers';

/**
 * Creating and editing a product, including a real upload.
 *
 * This is the only test anywhere that exercises the presigned-upload pipeline
 * end to end: ask the API for a URL, PUT the bytes straight to object storage,
 * then confirm so the server can verify the magic bytes. Every part of that has
 * server-side coverage, but nothing joined them up through a browser until now
 * — and the screen that drives it did not exist at all.
 */

/** A genuine 100x100 PNG, so the server's magic-byte check has real bytes. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAGQAAABkCAIAAAD/gAIDAAAACXBIWXMAAA7EAAAOxAGVKw4bAAAA' +
    'IUlEQVR4nO3BAQ0AAADCoPdPbQ43oAAAAAAAAAAAAOA3EMwAAeM0uYcAAAAASUVORK5CYII=',
  'base64',
);

let pngPath: string;
const created: string[] = [];

test.beforeAll(() => {
  pngPath = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'aurora-e2e-')), 'swatch.png');
  fs.writeFileSync(pngPath, PNG);
});

/**
 * Retire what the suite made.
 *
 * The create test necessarily writes a real product, and without this every run
 * would leave another behind until the development catalogue was mostly test
 * litter. A suite that quietly grows the database is one people stop running.
 *
 * This archives rather than erases: `DELETE /admin/products/:id` is a soft
 * delete throughout this codebase, deliberately, so an order's history can
 * still resolve the product it refers to. The row survives with `deletedAt`
 * set and drops out of every listing, which is what matters here.
 */
test.afterAll(async ({ playwright }) => {
  if (created.length === 0) return;
  const request = await playwright.request.newContext({ storageState: STATE_FILES.admin });
  const csrf = (await request.storageState()).cookies.find((c) => c.name === 'csrf_token')?.value;

  for (const id of created) {
    await request
      .delete(`http://localhost:4000/api/v1/admin/products/${id}`, {
        headers: csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {},
      })
      .catch(() => undefined);
  }
  await request.dispose();
});

test('an admin can create a product with images and variants', async ({ page }) => {
  const sku = `E2E-${Date.now().toString().slice(-8)}`;

  await page.goto('/admin/products/new');
  await expect(page.getByRole('heading', { name: 'New product' })).toBeVisible();

  await page.locator('#name').fill('Aurora E2E Lamp');
  await page.locator('#sku').fill(sku);
  await page.locator('#description').fill('Created by the end-to-end suite.');

  // Media: a real upload, straight to storage.
  await page.getByRole('tab', { name: 'Media' }).click();
  await page.setInputFiles('input[type=file]', pngPath);

  const preview = page.locator('img[src^="http"]').first();
  await expect(preview).toBeVisible({ timeout: 20_000 });
  // The URL points at object storage, not at the API — the bytes never passed
  // through Node, which is the entire point of presigning.
  expect(await preview.getAttribute('src')).toContain('/products/');

  await page.getByRole('tab', { name: 'Pricing' }).click();
  await page.locator('#price').fill('2499');
  await page.locator('#compareAtPrice').fill('3499');

  // Variants: two axes, four combinations.
  await page.getByRole('tab', { name: 'Variants' }).click();
  for (const [option, values] of [
    ['Colour', ['Black', 'White']],
    ['Size', ['Small', 'Large']],
  ] as const) {
    await page.getByLabel('New option name').fill(option);
    await page.getByRole('button', { name: 'Add option' }).click();
    for (const value of values) {
      await page.getByLabel(`Add a value to ${option}`).fill(value);
      await page.getByRole('button', { name: `Add value to ${option}` }).click();
    }
  }

  await page.getByRole('button', { name: 'Generate from options' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(4);

  await page.getByRole('button', { name: 'Create product' }).click();
  // Creating navigates to the editor for the new product.
  await page.waitForURL(/\/admin\/products\/[a-f0-9]{24}\/edit/, { timeout: 20_000 });

  const id = /\/products\/([a-f0-9]{24})\//.exec(page.url())![1]!;
  created.push(id);
  const saved = await (
    await page.request.get(`http://localhost:4000/api/v1/admin/products/${id}`)
  ).json();

  expect(saved.data.product.sku).toBe(sku);
  expect(saved.data.product.variants).toHaveLength(4);
  expect(saved.data.product.images).toHaveLength(1);
  // Compare-at is carried onto generated variants; without it the rollup would
  // compute a 0% discount and the sale badge would never show.
  expect(saved.data.product.variants[0].compareAtPrice).toBe(3499);
  // New products are drafts: creating one must not publish it by accident.
  expect(saved.data.product.status).toBe('draft');
});

test('editing a product leaves reserved and sold untouched', async ({ page }) => {
  const listing = await page.request.get('http://localhost:4000/api/v1/admin/products?limit=50');
  const items = (await listing.json()).data.items as {
    _id: string;
    variantCount: number;
    totalStock: number;
  }[];
  const target = items.find((item) => item.variantCount > 1 && item.totalStock > 0);
  expect(target, 'no seeded product with stocked variants to edit').toBeTruthy();

  const read = async () => {
    const res = await page.request.get(
      `http://localhost:4000/api/v1/admin/products/${target!._id}`,
    );
    const product = (await res.json()).data.product;
    return product.variants.map(
      (v: { stock: { available: number; reserved: number; sold: number } }) => v.stock,
    );
  };

  const before = await read();

  await page.goto(`/admin/products/${target!._id}/edit`);
  await expect(page.locator('#name')).not.toHaveValue('');
  // Nothing has been touched, so there is nothing to save.
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();

  const marker = `Edited by the suite at ${Date.now()}`;
  await page.locator('#shortDescription').fill(marker);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('Product saved')).toBeVisible();

  const after = await read();

  // Regression, and the important one: `updateProduct` used to assign the
  // incoming variants array straight onto the document, so Mongoose refilled
  // `reserved` and `sold` from their defaults. Renaming a product silently
  // freed units held for an in-flight checkout, and they could be sold twice.
  expect(after).toEqual(before);
});

test('the shared schema rejects a compare-at price below the selling price', async ({ page }) => {
  const listing = await page.request.get('http://localhost:4000/api/v1/admin/products?limit=1');
  const target = (await listing.json()).data.items[0] as { _id: string };

  await page.goto(`/admin/products/${target._id}/edit`);
  await expect(page.locator('#name')).not.toHaveValue('');

  await page.getByRole('tab', { name: 'Pricing' }).click();
  await page.locator('#compareAtPrice').fill('1');
  await page.getByRole('button', { name: 'Save changes' }).click();

  // The exact schema message, not a loose match: the field's own hint text
  // paraphrases the same rule and would satisfy a fuzzier selector whether or
  // not validation actually ran.
  await expect(page.getByText('Compare-at price must be at least the selling price')).toBeVisible();
});
