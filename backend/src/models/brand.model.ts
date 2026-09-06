import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import { CONTENT_STATUSES, type ContentStatus, type Seo } from '@ecom/shared';

export interface IBrand {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  description?: string;
  logo?: string;
  website?: string;
  status: ContentStatus;
  isFeatured: boolean;
  productCount: number;
  seo?: Seo;
  createdAt: Date;
  updatedAt: Date;
}

export type BrandDocument = HydratedDocument<IBrand>;

const brandSchema = new Schema<IBrand, Model<IBrand>>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    description: { type: String, maxlength: 2000 },
    logo: { type: String },
    website: { type: String },
    status: { type: String, enum: CONTENT_STATUSES, default: 'active' },
    isFeatured: { type: Boolean, default: false },
    productCount: { type: Number, default: 0, min: 0 },
    seo: {
      type: {
        title: { type: String, maxlength: 70 },
        description: { type: String, maxlength: 180 },
        keywords: { type: [String], default: undefined },
        canonicalUrl: { type: String },
        ogImage: { type: String },
      },
      default: undefined,
    },
  },
  { timestamps: true },
);

brandSchema.index({ status: 1, name: 1 });
brandSchema.index({ status: 1, isFeatured: 1 });

export const Brand = model<IBrand>('Brand', brandSchema);
