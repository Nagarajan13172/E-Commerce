import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import request from 'supertest';
import { useTestDatabase } from '../helpers/db.js';
import { createApp } from '../../src/app.js';

useTestDatabase();

const app = createApp();
const PREFIX = '/api/v1';

describe('health endpoints', () => {
  it('reports liveness without touching dependencies', async () => {
    const res = await request(app).get(`${PREFIX}/health`).expect(200);

    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('ok');
  });

  it('reports readiness with per-dependency detail', async () => {
    const res = await request(app).get(`${PREFIX}/health/ready`);

    expect(res.body.data.checks.database.status).toBe('ok');
    expect(res.body.data.checks.database.required).toBe(true);
  });
});

describe('error envelope', () => {
  it('returns a consistent shape and a correlation id for unknown routes', async () => {
    const res = await request(app).get(`${PREFIX}/nope`).expect(404);

    expect(res.body).toMatchObject({ success: false, code: 'NOT_FOUND' });
    expect(res.body.requestId).toBeTruthy();
    expect(res.headers['x-request-id']).toBe(res.body.requestId);
  });

  it('rejects a state-changing request that carries no CSRF token', async () => {
    const res = await request(app).post(`${PREFIX}/health`).send({}).expect(403);

    expect(res.body.code).toBe('CSRF_TOKEN_INVALID');
  });

  it('accepts a state-changing request when cookie and header agree', async () => {
    const agent = request.agent(app);
    // Any GET issues the CSRF cookie.
    const seed = await agent.get(`${PREFIX}/health`);
    const cookies = seed.headers['set-cookie'] as unknown as string[];
    const csrf = cookies
      .find((c) => c.startsWith('csrf_token='))!
      .split(';')[0]!
      .split('=')[1]!;

    // Passes CSRF, so it reaches routing and fails there instead — proof the
    // token was accepted rather than the request being rejected up front.
    const res = await agent
      .post(`${PREFIX}/health`)
      .set('X-CSRF-Token', decodeURIComponent(csrf))
      .send({});

    expect(res.status).toBe(404);
  });
});

describe('test harness', () => {
  it('runs MongoDB as a replica set so transactions are testable', async () => {
    const session = await mongoose.startSession();

    // The whole inventory-reservation design depends on this working.
    await session.withTransaction(async () => {
      await mongoose.connection.collection('txn_probe').insertOne({ ok: true }, { session });
    });
    await session.endSession();

    await expect(mongoose.connection.collection('txn_probe').countDocuments()).resolves.toBe(1);
  });
});
