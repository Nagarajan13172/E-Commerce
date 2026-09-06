import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import {
  PAYMENT_STATUSES,
  PAYMENT_METHODS,
  type PaymentStatus,
  type PaymentMethod,
} from '@ecom/shared';

/**
 * A payment attempt against an order.
 *
 * **No card data is ever stored here — not a PAN, not a CVV, not an expiry.**
 * Card details never touch this server: the provider's checkout collects them
 * directly. What we keep is the provider's own identifiers and a sanitized
 * subset of its response, which is all that is needed to reconcile, refund and
 * support a transaction.
 *
 * One order can have several payment rows (a failed attempt, then a successful
 * retry), which is why this is a separate collection rather than a subdocument.
 */
export interface IPayment {
  _id: Types.ObjectId;
  order: Types.ObjectId;
  user?: Types.ObjectId;

  provider: string;
  /** The provider's order/intent id, created before the customer pays. */
  providerOrderId: string;
  /** The provider's payment id, known only after a successful charge. */
  providerPaymentId?: string;
  providerRefundIds: string[];

  amount: number;
  amountRefunded: number;
  currency: string;
  status: PaymentStatus;
  method?: PaymentMethod;

  /** Sanitized provider metadata. Never raw instrument details. */
  providerMeta?: Record<string, unknown>;
  failureReason?: string;

  /** Whether a server-side signature check has passed for this payment. */
  verifiedAt?: Date;
  paidAt?: Date;

  createdAt: Date;
  updatedAt: Date;
}

export type PaymentDocument = HydratedDocument<IPayment>;

const paymentSchema = new Schema<IPayment, Model<IPayment>>(
  {
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: 'User' },

    provider: { type: String, required: true },
    providerOrderId: { type: String, required: true },
    providerPaymentId: { type: String },
    providerRefundIds: { type: [String], default: [] },

    amount: { type: Number, required: true, min: 0 },
    amountRefunded: { type: Number, default: 0, min: 0 },
    currency: { type: String, default: 'INR' },
    status: { type: String, enum: PAYMENT_STATUSES, default: 'created', index: true },
    method: { type: String, enum: PAYMENT_METHODS },

    providerMeta: { type: Schema.Types.Mixed },
    failureReason: { type: String, maxlength: 500 },

    verifiedAt: { type: Date },
    paidAt: { type: Date },
  },
  { timestamps: true },
);

// Webhooks arrive keyed by the provider's ids, so both must be fast lookups.
// Unique per provider: two providers could theoretically mint the same id.
paymentSchema.index({ provider: 1, providerOrderId: 1 }, { unique: true });
paymentSchema.index({ provider: 1, providerPaymentId: 1 }, { sparse: true });
paymentSchema.index({ status: 1, createdAt: -1 });

export const Payment = model<IPayment>('Payment', paymentSchema);
