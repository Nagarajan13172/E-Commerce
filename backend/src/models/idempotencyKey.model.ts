import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

/**
 * Client-side request deduplication.
 *
 * The webhook table protects against the *provider* sending twice; this
 * protects against the *client* sending twice — a double-clicked pay button, an
 * impatient retry, a flaky mobile connection replaying a request whose response
 * was lost. Any of those could otherwise create two orders and reserve stock
 * twice.
 *
 * `requestHash` guards against a subtler bug: a client reusing one key for a
 * genuinely different payload. Returning the first response in that case would
 * silently give the wrong answer, so a mismatch is an error instead.
 */
export interface IIdempotencyKey {
  _id: Types.ObjectId;
  key: string;
  user?: Types.ObjectId;
  endpoint: string;
  requestHash: string;
  status: 'in_progress' | 'completed' | 'failed';
  responseStatus?: number;
  responseBody?: unknown;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type IdempotencyKeyDocument = HydratedDocument<IIdempotencyKey>;

const idempotencyKeySchema = new Schema<IIdempotencyKey, Model<IIdempotencyKey>>(
  {
    key: { type: String, required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    endpoint: { type: String, required: true },
    requestHash: { type: String, required: true },
    status: {
      type: String,
      enum: ['in_progress', 'completed', 'failed'],
      default: 'in_progress',
    },
    responseStatus: { type: Number },
    responseBody: { type: Schema.Types.Mixed },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true },
);

// Scoped per endpoint so the same key on two different operations cannot collide.
idempotencyKeySchema.index({ key: 1, endpoint: 1 }, { unique: true });
idempotencyKeySchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const IdempotencyKey = model<IIdempotencyKey>('IdempotencyKey', idempotencyKeySchema);
