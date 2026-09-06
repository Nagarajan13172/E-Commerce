import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import { REVIEW_STATUSES, REVIEW_LIMITS, type ReviewStatus } from '@ecom/shared';

/**
 * Product reviews, restricted to verified purchases.
 *
 * A review must reference the specific `order` it came from. That is what makes
 * "verified purchase" a fact rather than a claim, and the unique index on
 * `{ user, product, order }` is what stops a customer from reviewing the same
 * purchase repeatedly to inflate a rating.
 */
export interface IReview {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  product: Types.ObjectId;
  /** The order that entitles this review to exist. */
  order: Types.ObjectId;
  variantId?: Types.ObjectId;

  rating: number;
  title?: string;
  comment: string;
  images: string[];

  isVerifiedPurchase: boolean;
  status: ReviewStatus;

  adminResponse?: { text: string; by: Types.ObjectId; at: Date };
  moderatedBy?: Types.ObjectId;
  moderatedAt?: Date;
  rejectionReason?: string;

  helpfulCount: number;
  reportedCount: number;

  createdAt: Date;
  updatedAt: Date;
}

export type ReviewDocument = HydratedDocument<IReview>;

const reviewSchema = new Schema<IReview, Model<IReview>>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    order: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
    variantId: { type: Schema.Types.ObjectId },

    rating: {
      type: Number,
      required: true,
      min: REVIEW_LIMITS.MIN_RATING,
      max: REVIEW_LIMITS.MAX_RATING,
    },
    title: { type: String, maxlength: 120, trim: true },
    comment: {
      type: String,
      required: true,
      maxlength: REVIEW_LIMITS.MAX_COMMENT_LENGTH,
      trim: true,
    },
    images: { type: [String], default: [] },

    isVerifiedPurchase: { type: Boolean, default: true },
    status: { type: String, enum: REVIEW_STATUSES, default: 'pending' },

    adminResponse: {
      type: {
        _id: false,
        text: { type: String, required: true, maxlength: 1000 },
        by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
        at: { type: Date, default: Date.now },
      },
      default: undefined,
    },
    moderatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    moderatedAt: { type: Date },
    rejectionReason: { type: String, maxlength: 500 },

    helpfulCount: { type: Number, default: 0, min: 0 },
    reportedCount: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

// One review per purchased line — the constraint that keeps ratings honest.
reviewSchema.index({ user: 1, product: 1, order: 1 }, { unique: true });
// The product page: approved reviews, newest first.
reviewSchema.index({ product: 1, status: 1, createdAt: -1 });
// The admin moderation queue.
reviewSchema.index({ status: 1, createdAt: -1 });
// Reported reviews surface first for moderators.
reviewSchema.index({ reportedCount: -1, status: 1 });
reviewSchema.index({ user: 1, createdAt: -1 });

export const Review = model<IReview>('Review', reviewSchema);
