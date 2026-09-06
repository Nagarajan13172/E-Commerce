import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import { RESERVATION_STATUSES, type ReservationStatus } from '@ecom/shared';

/**
 * Stock held for an in-flight checkout.
 *
 * Between "customer clicked pay" and "provider confirmed payment" there is a
 * window of seconds to minutes. Decrementing stock only on confirmation lets two
 * customers both pay for the last unit; decrementing at add-to-cart lets an
 * abandoned cart hold inventory hostage. Reserving at checkout-start with an
 * expiry is the middle path, and it is what the industry does.
 *
 * **Why a sweeper job and not just a TTL index:** a TTL index would delete this
 * row on expiry, but deleting it cannot move `available` and `reserved` back on
 * the product. The counters would silently drift and stock would leak away. The
 * job therefore queries expired rows, restores the counters, and only then marks
 * them released.
 */
export interface IReservationLine {
  product: Types.ObjectId;
  variantId?: Types.ObjectId;
  quantity: number;
}

export interface IStockReservation {
  _id: Types.ObjectId;
  order: Types.ObjectId;
  user?: Types.ObjectId;
  lines: IReservationLine[];
  status: ReservationStatus;
  expiresAt: Date;
  releasedAt?: Date;
  committedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type StockReservationDocument = HydratedDocument<IStockReservation>;

const stockReservationSchema = new Schema<IStockReservation, Model<IStockReservation>>(
  {
    // One live reservation per order; a retry reuses or replaces it.
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    lines: {
      type: [
        {
          _id: false,
          product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
          variantId: { type: Schema.Types.ObjectId },
          quantity: { type: Number, required: true, min: 1 },
        },
      ],
      required: true,
    },
    status: { type: String, enum: RESERVATION_STATUSES, default: 'held' },
    expiresAt: { type: Date, required: true },
    releasedAt: { type: Date },
    committedAt: { type: Date },
  },
  { timestamps: true },
);

// The sweeper's query: everything still held past its expiry.
stockReservationSchema.index({ status: 1, expiresAt: 1 });

export const StockReservation = model<IStockReservation>(
  'StockReservation',
  stockReservationSchema,
);
