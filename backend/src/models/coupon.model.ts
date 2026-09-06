import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import { COUPON_TYPES, type CouponType } from '@ecom/shared';

export interface ICoupon {
  _id: Types.ObjectId;
  code: string;
  description?: string;
  type: CouponType;
  /** Percent (0-100) for `percentage`; a currency amount for `fixed`. */
  value: number;
  minOrderValue: number;
  /** Ceiling on a percentage discount, so "50% off" cannot cost more than X. */
  maxDiscount?: number;

  /** Total redemptions allowed across all users. Null means unlimited. */
  usageLimit?: number;
  /** Redemptions allowed per user. */
  perUserLimit: number;
  /**
   * Denormalized counter, incremented under a `$lt: usageLimit` guard inside the
   * order transaction. The authoritative record is the CouponRedemption
   * collection — this field exists so the guard can be a single atomic update
   * rather than a count-then-write race.
   */
  usedCount: number;

  startsAt: Date;
  expiresAt: Date;

  /** Empty array means "applies to everything". */
  appliesTo: {
    products: Types.ObjectId[];
    categories: Types.ObjectId[];
    brands: Types.ObjectId[];
    users: Types.ObjectId[];
  };
  excludes: {
    products: Types.ObjectId[];
    categories: Types.ObjectId[];
  };

  /** Whether this can combine with other automatic discounts. */
  stackable: boolean;
  /** Restrict to a customer's very first order. */
  firstOrderOnly: boolean;
  isActive: boolean;
  createdBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type CouponDocument = HydratedDocument<ICoupon>;

const objectIdArray = (ref: string) => ({
  type: [{ type: Schema.Types.ObjectId, ref }],
  default: [],
});

const couponSchema = new Schema<ICoupon, Model<ICoupon>>(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      maxlength: 32,
    },
    description: { type: String, maxlength: 300 },
    type: { type: String, enum: COUPON_TYPES, required: true },
    value: { type: Number, required: true, min: 0 },
    minOrderValue: { type: Number, default: 0, min: 0 },
    maxDiscount: { type: Number, min: 0 },

    usageLimit: { type: Number, min: 1 },
    perUserLimit: { type: Number, default: 1, min: 1 },
    usedCount: { type: Number, default: 0, min: 0 },

    startsAt: { type: Date, required: true, default: Date.now },
    expiresAt: { type: Date, required: true },

    appliesTo: {
      products: objectIdArray('Product'),
      categories: objectIdArray('Category'),
      brands: objectIdArray('Brand'),
      users: objectIdArray('User'),
    },
    excludes: {
      products: objectIdArray('Product'),
      categories: objectIdArray('Category'),
    },

    stackable: { type: Boolean, default: false },
    firstOrderOnly: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

// Listing currently-valid coupons (the "Offers" page).
couponSchema.index({ isActive: 1, startsAt: 1, expiresAt: 1 });

export const Coupon = model<ICoupon>('Coupon', couponSchema);
