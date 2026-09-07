import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { useTestDatabase } from '../helpers/db.js';
import { makeProduct, makeUser } from '../helpers/factories.js';
import { Product } from '../../src/models/product.model.js';
import { User } from '../../src/models/user.model.js';

/**
 * Index topology.
 *
 * These read like plumbing tests, and they exist because the plumbing was
 * broken and nothing noticed: the suite ran for seven phases against databases
 * that had only `_id_` on every collection. Unique constraints were therefore
 * never actually enforced during a test, and a `$text` search failed outright.
 * Every query-shape assertion elsewhere was measuring a schema no deployed
 * environment has.
 */

useTestDatabase();

async function indexNames(model: mongoose.Model<unknown>): Promise<string[]> {
  const indexes = await model.collection.indexes();
  return indexes.map((index) => index.name!);
}

describe('index topology', () => {
  it('builds every declared index, not just _id', async () => {
    for (const model of Object.values(mongoose.models)) {
      const names = await indexNames(model as mongoose.Model<unknown>);
      const declared = model.schema.indexes().length;
      // +1 for the implicit _id index, plus any field-level `unique: true`,
      // which does not appear in schema.indexes(). So this is a lower bound.
      if (declared > 0) {
        expect(names.length, `${model.modelName} has no indexes beyond _id`).toBeGreaterThan(1);
      }
    }
  });

  it('has the text index the catalogue search depends on', async () => {
    const indexes = await Product.collection.indexes();
    const text = indexes.find((index) => Object.values(index.key).includes('text'));
    expect(text, 'products has no text index — $text search would throw').toBeDefined();
  });

  it('enforces unique emails at the database, not only in the service', async () => {
    await makeUser({ email: 'duplicate@example.com' });

    // Bypasses every service-level check, so only the index can stop this.
    await expect(
      User.collection.insertOne({
        name: 'Impostor',
        email: 'duplicate@example.com',
        passwordHash: 'x',
        role: 'customer',
        status: 'active',
      }),
    ).rejects.toThrow(/duplicate key/i);
  });

  it('enforces unique product slugs at the database', async () => {
    const product = await makeProduct({ name: `Unique Thing ${Date.now()}` });

    await expect(
      Product.collection.insertOne({ name: 'Clone', slug: product.slug, sku: 'CLONE-1' }),
    ).rejects.toThrow(/duplicate key/i);
  });

  it('serves a catalogue listing from an index rather than a collection scan', async () => {
    for (let i = 0; i < 12; i += 1) {
      await makeProduct({ name: `Explain Product ${i}`, price: 500 + i });
    }

    const explain = await Product.find({ status: 'active' })
      .sort({ createdAt: -1 })
      .limit(10)
      .explain('executionStats');

    // `explain()` is typed as the query's document type rather than an explain
    // plan, so the shape has to be asserted through `unknown`.
    const plan = explain as unknown as {
      executionStats: { executionStages: Record<string, unknown> };
    };
    const stages = JSON.stringify(plan.executionStats.executionStages);

    // A COLLSCAN here survives a seeded catalogue and collapses on a real one.
    expect(stages).toContain('IXSCAN');
    expect(stages).not.toContain('COLLSCAN');
  });
});
