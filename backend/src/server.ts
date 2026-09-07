import type { Server } from 'node:http';
import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { connectDatabase, disconnectDatabase } from './config/db.js';
import { storage } from './integrations/storage/index.js';
import { cache } from './integrations/cache/index.js';
import { registerNotificationHandlers } from './events/handlers/notification.handlers.js';
import { registerOrderHandlers } from './events/handlers/order.handlers.js';
import { startJobs, stopJobs } from './jobs/runner.js';
// Imported for its side effect: every Mongoose model must be registered before
// any query runs `populate()`, which throws MissingSchemaError otherwise.
import './models/index.js';

/**
 * Process lifecycle: ordered startup, and a shutdown that actually finishes
 * in-flight work instead of severing connections mid-request.
 */

let server: Server | undefined;
let shuttingDown = false;

async function bootstrap(): Promise<void> {
  logger.info({ env: env.NODE_ENV, port: env.PORT }, 'Starting API');

  // Database first: nothing else is useful without it, and failing here should
  // stop the boot rather than produce a server that 500s on every request.
  await connectDatabase();

  // Storage is a soft dependency — the API still serves the catalog if object
  // storage is briefly unavailable, so a failure here warns rather than exits.
  try {
    await storage.ensureBucket();
    logger.info({ bucket: env.STORAGE_BUCKET }, 'Object storage ready');
  } catch (err) {
    logger.warn({ err }, 'Object storage unavailable at boot — uploads will fail until it returns');
  }

  // Subscribe domain-event handlers before the server accepts traffic, so no
  // event emitted by an early request is dropped.
  registerNotificationHandlers();
  registerOrderHandlers();

  // Sweeps stock reservations whose checkout was abandoned. Without it, an
  // unpaid order holds inventory forever.
  startJobs();

  const app = createApp();

  server = app.listen(env.PORT, () => {
    logger.info(`API listening on ${env.API_URL}${env.API_PREFIX}`);
    logger.info(`Health: ${env.API_URL}${env.API_PREFIX}/health/ready`);
  });

  // Slowloris protection: cap how long a client may take to send headers.
  server.headersTimeout = 20_000;
  server.requestTimeout = 30_000;
  server.keepAliveTimeout = 65_000;
}

/**
 * Graceful shutdown.
 *
 * Stop accepting new connections, let in-flight requests finish, then close the
 * database. The hard timeout matters: without it a single hung keep-alive
 * socket keeps the process alive until the orchestrator SIGKILLs it, which
 * would abort any request that was still being served.
 */
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Shutting down');

  const forceExit = setTimeout(() => {
    logger.error('Graceful shutdown timed out after 15s — forcing exit');
    process.exit(1);
  }, 15_000);
  forceExit.unref();

  try {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((err) => (err ? reject(err) : resolve()));
      });
      logger.info('HTTP server closed');
    }

    stopJobs();
    await Promise.allSettled([disconnectDatabase(), cache.disconnect()]);

    clearTimeout(forceExit);
    logger.info('Shutdown complete');
    process.exit(0);
  } catch (err) {
    logger.error({ err }, 'Error during shutdown');
    process.exit(1);
  }
}

process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));

// An unhandled rejection leaves the process in an unknown state. Log it with
// full context, then shut down cleanly rather than limping on.
process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  void shutdown('unhandledRejection');
});

process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception');
  void shutdown('uncaughtException');
});

bootstrap().catch((err) => {
  logger.fatal({ err }, 'Failed to start API');
  process.exit(1);
});
