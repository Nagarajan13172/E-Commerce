import http from 'node:http';
import request from 'supertest';
import type { Express } from 'express';

export const PREFIX = '/api/v1';

/**
 * One listening server per app, for the lifetime of the test file.
 *
 * Handed a bare Express app, supertest calls `app.listen(0)` for EVERY request
 * and closes it afterwards. Superagent's agent keeps a keep-alive pool keyed by
 * host:port, so when the OS eventually recycles an ephemeral port onto a new
 * server, a pooled socket from the previous occupant gets reused — and the
 * reply arrives as `Parse Error: Expected HTTP/, RTSP/ or ICE/`. That is the
 * intermittent failure this suite had been seeing: never the same test twice,
 * never reproducible on retry, and always in the files that fire the most
 * requests through one agent.
 *
 * Given a server that is ALREADY listening, supertest reuses it, so the port
 * stays fixed for the whole file and there is nothing to recycle.
 */
const servers = new WeakMap<Express, http.Server>();
const open = new Set<http.Server>();

function listeningServer(app: Express): http.Server {
  const existing = servers.get(app);
  if (existing) return existing;

  const server = http.createServer(app);
  server.listen(0);
  servers.set(app, server);
  open.add(server);
  return server;
}

/** Closes every server this file opened. Called from the global test teardown. */
export async function closeTestServers(): Promise<void> {
  await Promise.all(
    [...open].map(
      (server) =>
        new Promise<void>((resolve) => {
          open.delete(server);
          server.closeAllConnections();
          server.close(() => resolve());
        }),
    ),
  );
}

/**
 * A supertest agent that keeps cookies AND handles CSRF the way the browser does.
 *
 * Without this every test would repeat the seed-a-GET-then-copy-the-token
 * dance. It also means the tests exercise the real CSRF path rather than
 * disabling it, so a regression there would actually fail a test.
 */
export async function createApiAgent(app: Express) {
  const agent = request.agent(listeningServer(app));

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
