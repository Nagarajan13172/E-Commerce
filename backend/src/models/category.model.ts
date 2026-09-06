import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import { CONTENT_STATUSES, type ContentStatus, type Seo } from '@ecom/shared';

/**
 * Nested categories via **materialized path + ancestor array**.
 *
 * The alternative — following `parent` pointers recursively — needs one query
 * per level to answer "show me everything under Electronics", which is the single
 * most common catalog query there is. Storing the full ancestor list instead
 * turns that into one indexed `$in`, and products additionally denormalize their
 * own ancestor path so category filtering never needs a join at all.
 *
 * The cost is that moving a category must rewrite its descendants' paths and the
 * affected products' `categoryPath`. That is a rare, admin-triggered operation,
 * and it is worth paying to keep every read cheap.
 */
export interface ICategory {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  image?: string;
  parent?: Types.ObjectId | null;
  /** Every ancestor, root first. Empty for a top-level category. */
  ancestors: Types.ObjectId[];
  /** Human-readable path, e.g. "electronics/audio/headphones". */
  path: string;
  /** Depth; 0 for a root category. */
  level: number;
  /** Display order among siblings. */
  order: number;
  status: ContentStatus;
  isFeatured: boolean;
  /** Denormalized count of active products, refreshed by ProductService. */
  productCount: number;
  seo?: Seo;
  createdAt: Date;
  updatedAt: Date;
}

export type CategoryDocument = HydratedDocument<ICategory>;

const seoSubSchema = {
  title: { type: String, maxlength: 70 },
  description: { type: String, maxlength: 180 },
  keywords: { type: [String], default: undefined },
  canonicalUrl: { type: String },
  ogImage: { type: String },
};

const categorySchema = new Schema<ICategory, Model<ICategory>>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, maxlength: 2000 },
    image: { type: String },

    parent: { type: Schema.Types.ObjectId, ref: 'Category', default: null },
    ancestors: { type: [{ type: Schema.Types.ObjectId, ref: 'Category' }], default: [] },
    path: { type: String, required: true, index: true },
    level: { type: Number, default: 0, min: 0, max: 4 },
    order: { type: Number, default: 0 },

    status: { type: String, enum: CONTENT_STATUSES, default: 'active' },
    isFeatured: { type: Boolean, default: false },
    productCount: { type: Number, default: 0, min: 0 },
    seo: { type: seoSubSchema, default: undefined },
  },
  { timestamps: true, toJSON: { virtuals: true } },
);

// Rendering a level of the tree in display order.
categorySchema.index({ parent: 1, order: 1 });
// "All descendants of X" — the query the ancestor array exists to serve.
categorySchema.index({ ancestors: 1 });
categorySchema.index({ status: 1, isFeatured: 1, order: 1 });

/** Children, for assembling the tree without a second round trip. */
categorySchema.virtual('children', {
  ref: 'Category',
  localField: '_id',
  foreignField: 'parent',
});

export const Category = model<ICategory>('Category', categorySchema);
