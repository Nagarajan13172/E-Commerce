import { Schema, model, type Model, type Types } from 'mongoose';

/**
 * Atomic sequence generator, used for human-readable order numbers.
 *
 * Order numbers are read aloud to support agents and typed into search boxes, so
 * they must be short and sequential — not a UUID. Sequential also means a random
 * suffix cannot be relied on for uniqueness.
 *
 * `findOneAndUpdate` with `$inc` and `upsert` is a single atomic operation, so
 * concurrent checkouts cannot receive the same number. Counting existing orders
 * instead would race, and would also get slower as the collection grows.
 */
export interface ICounter {
  _id: string;
  seq: number;
}

const counterSchema = new Schema<ICounter, Model<ICounter>>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false },
);

export const Counter = model<ICounter>('Counter', counterSchema);

/** Next value in a named sequence. Atomic and safe under concurrency. */
export async function nextSequence(
  name: string,
  session?: Types.ObjectId extends never ? never : Parameters<typeof Counter.findByIdAndUpdate>[2],
): Promise<number> {
  const doc = await Counter.findByIdAndUpdate(
    name,
    { $inc: { seq: 1 } },
    { returnDocument: 'after', upsert: true, ...(session ?? {}) },
  ).lean();
  return doc?.seq ?? 1;
}
