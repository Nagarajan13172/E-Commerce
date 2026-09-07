import fs from 'node:fs';
import { test as setup } from '@playwright/test';
import { ACCOUNTS, signIn, STATE_FILES } from './helpers';

/**
 * Sign in once per role and reuse the session across tests — and across runs.
 *
 * Not merely an optimisation. `authLimiter` allows ten attempts per fifteen
 * minutes per (IP, email), which is correct production behaviour. A suite that
 * signs in afresh for every test trips it immediately; one that signs in three
 * times per run trips it after three runs, and the failure surfaces as a
 * timeout that looks like a broken login rather than the rate limit it is.
 *
 * So a stored session is reused whenever it still works. `/auth/me` is the
 * cheapest way to ask — the access token is httpOnly, so its validity cannot be
 * inspected from the file. Weakening the limit for tests would remove exactly
 * the protection worth having.
 */
/**
 * How old a saved session may be before it is thrown away.
 *
 * Well under the 15-minute access-token lifetime, and that margin is the whole
 * point. Refresh tokens rotate on every use and a reused one revokes the entire
 * family — correct, deliberate security behaviour. But every browser context in
 * a run starts from the *same* saved snapshot, so if the access token expires
 * mid-run the first context to refresh rotates the token and every later
 * context presents one that has already been spent. Reuse detection then fires
 * and signs all of them out at once: an entire project's tests fail together,
 * looking for all the world like the pages are broken.
 *
 * Keeping the snapshot young means no context ever needs to refresh, so the
 * situation never arises. Five minutes still costs at most one sign-in per role
 * per five minutes, comfortably inside `authLimiter`.
 */
const MAX_SESSION_AGE_MS = 5 * 60 * 1000;

async function reusableSession(
  request: import('@playwright/test').APIRequestContext,
  statePath: string,
): Promise<boolean> {
  if (!fs.existsSync(statePath)) return false;
  if (Date.now() - fs.statSync(statePath).mtimeMs > MAX_SESSION_AGE_MS) return false;

  try {
    const response = await request.get('http://localhost:4000/api/v1/auth/me');
    return response.ok();
  } catch {
    return false;
  }
}

for (const [role, account] of Object.entries(ACCOUNTS)) {
  const statePath = STATE_FILES[role as keyof typeof ACCOUNTS];

  setup(`authenticate as ${role}`, async ({ browser }) => {
    if (fs.existsSync(statePath)) {
      const context = await browser.newContext({ storageState: statePath });
      const valid = await reusableSession(context.request, statePath);
      await context.close();
      if (valid) {
        setup.info().annotations.push({ type: 'reused', description: `${role} session` });
        return;
      }
    }

    const context = await browser.newContext();
    const page = await context.newPage();
    await signIn(page, account);
    await context.storageState({ path: statePath });
    await context.close();
  });
}
