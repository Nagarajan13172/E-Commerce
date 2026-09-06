import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

/**
 * The authoritative record of coupon usage.
 *
 * `Coupon.usedCount` is a fast counter for the atomic limit guard; this
 * collection is the ledger that survives it. Two unique indexes do real work:
 *
 * - `{ coupon, order }` makes double-counting structurally impossible. If a
 *   payment webhook is redelivered and somehow reaches the redemption step
 *   twice, the second insert fails with a duplicate key instead of silently
 *   consuming another use.
 * - `{ coupon, user, order }` backs per-user limit checks.
 */
export interface ICouponRedemption {
  _id: Types.ObjectId;
  coupon: Types.ObjectId;
  code: string;
  user?: Types.ObjectId;
  order: Types.ObjectId;
  discountAmount: number;
  createdAt: Date;
}

export type CouponRedemptionDocument = HydratedDocument<ICouponRedemption>;

const couponRedemptionSchema = new Schema<ICouponRedemption, Model<ICouponRedemption>>(
  {
    coupon: { type: Schema.Types.ObjectId, ref: 'Coupon', required: true },
    code: { type: String, required: true, uppercase: true },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    discountAmount: { type: Number, required: true, min: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

couponRedemptionSchema.index({ coupon: 1, order: 1 }, { unique: true });
couponRedemptionSchema.index({ coupon: 1, user: 1 });

export const CouponRedemption = model<ICouponRedemption>(
  'CouponRedemption',
  couponRedemptionSchema,
);
