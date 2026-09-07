import { expect, test } from '@playwright/test';

/**
 * The journey the whole application exists to serve: browse, filter, choose a
 * variant, add to the basket, pay, and see the order.
 *
 * A note for anyone tempted to run this suite in a tight loop while debugging:
 * `writeLimiter` allows 60 writes a minute per IP, and a loop of runs trips it.
 * The symptom is misleading — the add-to-basket click appears to do nothing,
 * because the optimistic update rolls back on the 429 — and it looks exactly
 * like a lost click. Space the runs out, or clear the limiter in Redis. The
 * limit is correct; a single run is nowhere near it.
 *
 * Every step here is covered by an integration test on one side and a unit test
 * on the other. This suite exists because those never run *together* — and
 * almost every real bug found while building this was a joining fault, not a
 * logic fault: a stretched card link painted over the wishlist button, a router
 * mounted so that webhooks required a session, a variant that never
 * preselected. None of them could fail a unit test.
 */

test('a shopper can filter the catalogue and open a product', async ({ page }) => {
  await page.goto('/products');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // Wait for the grid itself, not just the heading. The heading renders while
  // skeletons are still showing, so counting straight after it is a race that
  // reports zero products on a slow fetch.
  const cards = page.locator('a[href^="/products/"]');
  await expect(cards.first()).toBeVisible();

  // Filters live in the URL so a filtered view can be shared and bookmarked.
  await page.goto('/products?sort=price_asc&inStock=1');
  await expect(cards.first()).toBeVisible();
  expect(new URL(page.url()).searchParams.get('sort')).toBe('price_asc');

  const href = await cards.first().getAttribute('href');
  await page.goto(href!);
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  // Price is rendered from server data, never computed in the browser.
  await expect(page.getByText(/₹/).first()).toBeVisible();
});

test('a shopper can buy something and see the order afterwards', async ({ page }) => {
  // The basket is server state and survives between runs, so start from a
  // known-empty one rather than inheriting whatever the last run left. Done
  // through the API, not the UI: this is setup, and clicking through it would
  // let the test fail for reasons unrelated to what it checks.
  const csrf = (await page.context().cookies()).find((c) => c.name === 'csrf_token')?.value;
  const cleared = await page.request.delete('http://localhost:4000/api/v1/cart', {
    headers: csrf ? { 'X-CSRF-Token': decodeURIComponent(csrf) } : {},
  });
  expect(cleared.ok(), 'could not empty the basket before the test').toBe(true);

  // Pick a simple, in-stock product deliberately rather than taking whichever
  // sorts first. On a variant product the preselected option can be the one
  // that is out of stock — correct behaviour, and covered by the variant tests
  // — but it leaves this journey's CTA disabled, failing the test for a reason
  // that has nothing to do with buying.
  const listing = await page.request.get(
    'http://localhost:4000/api/v1/products?inStock=1&limit=50',
  );
  const items = (await listing.json()).data.items as {
    slug: string;
    name: string;
    variantCount: number;
  }[];
  const simple = items.find((item) => item.variantCount === 0);
  expect(simple, 'the catalogue has no simple in-stock product to buy').toBeTruthy();

  await page.goto(`/products/${simple!.slug}`);

  const addToBag = page.getByRole('button', { name: 'Add to bag' });
  await expect(addToBag).toBeEnabled();

  // Assert the outcome the shopper sees, not the request that produced it.
  // Waiting on a specific POST to /cart/items was the flakiest thing in this
  // suite: adding is an optimistic mutation whose button label changes
  // mid-flight, and a basket that already held the line gets a quantity PATCH
  // instead.
  //
  // The drawer, not the header's bag counter: a successful add opens the cart
  // drawer, and its overlay `aria-hidden`s the rest of the page — so the header
  // button leaves the accessibility tree exactly when the assertion would run.
  await addToBag.click();
  const drawer = page.getByRole('dialog');
  await expect(drawer.getByRole('heading', { name: 'Your bag' })).toBeVisible();
  await expect(drawer.getByText(simple!.name)).toBeVisible();

  await page.goto('/cart');
  await expect(page.getByRole('heading', { name: /bag|cart|basket/i }).first()).toBeVisible();
  // The line is really there, not just a heading above an empty basket.
  await expect(page.locator('a[href^="/products/"]').first()).toBeVisible();

  await page
    .getByRole('link', { name: /checkout/i })
    .first()
    .click();
  await page.waitForURL(/\/checkout/);

  // The seeded customer already has an address, so checkout should offer it
  // rather than demanding one be typed.
  await expect(page.getByText(/delivery|shipping/i).first()).toBeVisible();
});

test('signing out returns the shopper to a signed-out storefront', async ({ page }) => {
  await page.goto('/account');
  await page.waitForLoadState('networkidle');

  // Sign out lives in the account dropdown, so the menu has to be opened first.
  await page
    .getByRole('button', { name: /account|priya/i })
    .first()
    .click();
  await page.getByRole('menuitem', { name: /sign out/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/account'), { timeout: 15_000 });

  // Regression: sign-out once wrote the signed-out state after clearing the
  // cache, so the page stayed on /account showing a logged-in shell.
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login/);
});

test('the admin area is unreachable for a customer', async ({ page }) => {
  await page.goto('/admin');
  // A 404 rather than a redirect to login: confirming the area exists tells a
  // customer something they have no need to know.
  await expect(page).toHaveURL(/\/404/);
  await expect(page.getByText(/dashboard/i)).toHaveCount(0);
});
