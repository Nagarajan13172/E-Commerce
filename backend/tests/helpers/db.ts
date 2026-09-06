import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';

/**
 * Per-suite in-memory MongoDB.
 *
 * Deliberately a REPLICA SET, not a standalone `MongoMemoryServer`: the code
 * under test reserves inventory inside transactions, and a standalone mongod
 * would fail those with "Transaction numbers are only allowed on a replica set"
 * — meaning the exact behaviour most worth testing would be untestable.
 */
let replSet: MongoMemoryReplSet | undefined;

export function useTestDatabase(): void {
  beforeAll(async () => {
    replSet = await MongoMemoryReplSet.create({
      replSet: { count: 1, storageEngine: 'wiredTiger' },
    });
    await mongoose.connect(replSet.getUri(), { directConnection: true });
  });

  // Wipe between tests rather than dropping the database: dropping would also
  // drop the indexes, and several behaviours under test (unique constraints,
  // duplicate-key handling) depend on them existing.
  afterEach(async () => {
    const { collections } = mongoose.connection;
    await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await replSet?.stop();
  });
}
