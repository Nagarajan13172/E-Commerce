import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import { afterAll, afterEach, beforeAll } from 'vitest';

// Importing the barrel compiles every model, so `syncIndexes` below covers the
// whole schema rather than only the models a given test happens to touch.
import '../../src/models/index.js';

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

    /**
     * Build the indexes before anything runs.
     *
     * Mongoose schedules index creation in the background when a model is first
     * used, which is a race the tests were losing: the database had only `_id_`
     * on every collection, so unique constraints were not being enforced and a
     * `$text` search failed outright with "text index required". The suite was
     * therefore testing a schema shape that no deployed environment has.
     *
     * `syncIndexes` is awaited so the topology matches production before the
     * first test, at a one-off cost of well under a second.
     */
    await Promise.all(Object.values(mongoose.models).map((model) => model.syncIndexes()));
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
