import mongoose from 'mongoose';
import { env, isProduction, isTest } from './env.js';
import { createLogger } from './logger.js';

const log = createLogger('db');

/**
 * MongoDB connection lifecycle.
 *
 * The deployment must be a replica set (a single-node one is fine in dev):
 * checkout reserves stock for every line item inside a transaction, and
 * transactions do not exist on a standalone mongod. `connect()` verifies this
 * at boot so the failure surfaces immediately rather than at the first checkout.
 */

mongoose.set('strictQuery', true);
// Index building is convenient in dev but a foot-gun in production, where a
// deploy could silently start a foreground index build on a large collection.
mongoose.set('autoIndex', !isProduction);

export async function connectDatabase(uri = env.MONGODB_URI): Promise<typeof mongoose> {
  mongoose.connection.on('connected', () => log.info('MongoDB connected'));
  mongoose.connection.on('disconnected', () => log.warn('MongoDB disconnected'));
  mongoose.connection.on('reconnected', () => log.info('MongoDB reconnected'));
  mongoose.connection.on('error', (err) => log.error({ err }, 'MongoDB connection error'));

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
    socketTimeoutMS: 45_000,
    maxPoolSize: 20,
    minPoolSize: 2,
    retryWrites: true,
  });

  if (!isTest) await assertTransactionSupport();

  return mongoose;
}

/**
 * Fail fast if the server cannot do transactions, with an actionable message —
 * this is by far the most common local-setup mistake.
 */
async function assertTransactionSupport(): Promise<void> {
  try {
    const admin = mongoose.connection.db?.admin();
    const info = (await admin?.command({ hello: 1 })) as { setName?: string; msg?: string };
    const isReplicaSet = Boolean(info?.setName);
    const isSharded = info?.msg === 'isdbgrid';

    if (!isReplicaSet && !isSharded) {
      log.error(
        'MongoDB is running as a STANDALONE server, which cannot run transactions.\n' +
          'Checkout requires them to reserve stock atomically across line items.\n' +
          'Fix: start MongoDB via `docker compose up -d` (it runs a single-node replica set).',
      );
      throw new Error('MongoDB transactions unavailable: server is not a replica set');
    }

    log.info({ replicaSet: info.setName ?? 'sharded' }, 'MongoDB transaction support verified');
  } catch (err) {
    if (err instanceof Error && err.message.includes('transactions unavailable')) throw err;
    log.warn({ err }, 'Could not verify transaction support');
  }
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.connection.close(false);
  log.info('MongoDB connection closed');
}

/** Used by the readiness probe. */
export async function pingDatabase(): Promise<boolean> {
  try {
    if (mongoose.connection.readyState !== 1) return false;
    await mongoose.connection.db?.admin().command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}

export { mongoose };
