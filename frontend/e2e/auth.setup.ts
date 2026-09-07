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
async function sessionStillValid(
  request: import('@playwright/test').APIRequestContext,
  statePath: string,
): Promise<boolean> {
  if (!fs.existsSync(statePath)) return false;
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
      const valid = await sessionStillValid(context.request, statePath);
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
