import request from 'supertest';
import type { Express } from 'express';

export const PREFIX = '/api/v1';

/**
 * A supertest agent that keeps cookies AND handles CSRF the way the browser does.
 *
 * Without this every test would repeat the seed-a-GET-then-copy-the-token
 * dance. It also means the tests exercise the real CSRF path rather than
 * disabling it, so a regression there would actually fail a test.
 */
export async function createApiAgent(app: Express) {
  const agent = request.agent(app);

  const seed = await agent.get(`${PREFIX}/health`);
  const cookies = (seed.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  const csrf = cookies
    .find((c) => c.startsWith('csrf_token='))
    ?.split(';')[0]
    ?.split('=')[1];

  const csrfToken = csrf ? decodeURIComponent(csrf) : '';

  return {
    agent,
    csrfToken,
    post: (url: string, body?: unknown) =>
      agent
        .post(`${PREFIX}${url}`)
        .set('X-CSRF-Token', csrfToken)
        .send(body ?? {}),
    patch: (url: string, body?: unknown) =>
      agent
        .patch(`${PREFIX}${url}`)
        .set('X-CSRF-Token', csrfToken)
        .send(body ?? {}),
    delete: (url: string) => agent.delete(`${PREFIX}${url}`).set('X-CSRF-Token', csrfToken),
    get: (url: string) => agent.get(`${PREFIX}${url}`),
  };
}

export type ApiAgent = Awaited<ReturnType<typeof createApiAgent>>;

/** A password that satisfies the policy, so tests aren't testing the validator. */
export const VALID_PASSWORD = 'CorrectHorse9';

export function uniqueEmail(prefix = 'user'): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 10)}@example.com`;
}

/** Read one cookie's value out of a response's Set-Cookie header. */
export function readSetCookie(res: request.Response, name: string): string | undefined {
  const cookies = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  return cookies
    .find((c) => c.startsWith(`${name}=`))
    ?.split(';')[0]
    ?.split('=')[1];
}
