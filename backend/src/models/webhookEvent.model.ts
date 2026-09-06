import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

/**
 * Webhook deduplication.
 *
 * Every payment provider guarantees *at-least-once* delivery, which means
 * duplicates are normal operation, not an edge case. Processing one twice would
 * decrement stock twice, consume a coupon twice, and potentially fulfil twice.
 *
 * The unique index on `{ provider, eventId }` is the whole mechanism: the
 * handler **inserts first**. If the insert succeeds, this delivery is new and
 * may be processed. If it fails with a duplicate-key error, the event has
 * already been seen and the handler returns 200 immediately without touching
 * anything. Check-then-act would leave a race window; insert-then-act does not.
 */
export interface IWebhookEvent {
  _id: Types.ObjectId;
  provider: string;
  eventId: string;
  eventType: string;
  status: 'received' | 'processed' | 'failed' | 'ignored';
  payloadHash: string;
  relatedOrder?: Types.ObjectId;
  error?: string;
  attempts: number;
  processedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type WebhookEventDocument = HydratedDocument<IWebhookEvent>;

const webhookEventSchema = new Schema<IWebhookEvent, Model<IWebhookEvent>>(
  {
    provider: { type: String, required: true },
    eventId: { type: String, required: true },
    eventType: { type: String, required: true },
    status: {
      type: String,
      enum: ['received', 'processed', 'failed', 'ignored'],
      default: 'received',
    },
    payloadHash: { type: String, required: true },
    relatedOrder: { type: Schema.Types.ObjectId, ref: 'Order' },
    error: { type: String, maxlength: 2000 },
    attempts: { type: Number, default: 1 },
    processedAt: { type: Date },
  },
  { timestamps: true },
);

// The deduplication constraint itself.
webhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
// Operational view: which deliveries failed and need replaying.
webhookEventSchema.index({ status: 1, createdAt: -1 });
// Keep 90 days for reconciliation, then discard.
webhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export const WebhookEvent = model<IWebhookEvent>('WebhookEvent', webhookEventSchema);
