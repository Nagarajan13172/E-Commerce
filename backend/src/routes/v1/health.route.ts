import { Router } from 'express';
import mongoose from 'mongoose';
import { pingDatabase } from '../../config/db.js';
import { cache } from '../../integrations/cache/index.js';
import { storage } from '../../integrations/storage/index.js';
import { env } from '../../config/env.js';
import { sendSuccess } from '../../utils/apiResponse.js';

const router: Router = Router();

const startedAt = Date.now();

/**
 * Liveness: "is this process running?" Deliberately dependency-free — an
 * orchestrator must not restart a healthy API just because the database blipped.
 */
router.get('/', (_req, res) => {
  sendSuccess(res, {
    status: 'ok',
    uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    environment: env.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Readiness: "can this process actually serve traffic?" Checks every backing
 * service and reports 503 if a hard dependency is down.
 *
 * MongoDB is a hard dependency. Storage and cache are reported but do not fail
 * the probe: the storefront still renders (with degraded images / cold caches)
 * when they are unavailable, and taking the whole API out of rotation would be
 * a worse outcome.
 */
router.get('/ready', async (_req, res) => {
  const [database, objectStorage, cacheHealthy] = await Promise.all([
    pingDatabase(),
    storage.isHealthy(),
    cache.isHealthy(),
  ]);

  const checks = {
    database: { status: database ? 'ok' : 'down', required: true },
    storage: { status: objectStorage ? 'ok' : 'down', required: false },
    cache: { status: cacheHealthy ? 'ok' : 'down', required: false },
  };

  const ready = database;

  res.status(ready ? 200 : 503).json({
    success: ready,
    data: {
      status: ready ? 'ready' : 'not_ready',
      checks,
      replicaSet: mongoose.connection.readyState === 1,
      timestamp: new Date().toISOString(),
    },
    ...(ready ? {} : { message: 'One or more required dependencies are unavailable' }),
  });
});

export default router;
