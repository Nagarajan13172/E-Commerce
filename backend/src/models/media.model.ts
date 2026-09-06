import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

export interface IMediaVariant {
  name: string;
  key: string;
  url: string;
  width: number;
  height: number;
  size: number;
}

/**
 * A record of an object in storage — never the bytes themselves.
 *
 * MongoDB stores only the key, URL and metadata. Images live in MinIO/S3, which
 * is what object storage is for: binaries in the database bloat the working set,
 * wreck replication and cannot be served by a CDN.
 */
export interface IMedia {
  _id: Types.ObjectId;
  key: string;
  bucket: string;
  url: string;
  mimeType: string;
  size: number;
  width?: number;
  height?: number;
  alt?: string;
  /** Tiny inline data URI shown while the real image loads. */
  blurDataUrl?: string;
  /** Responsive derivatives generated after upload. */
  variants: IMediaVariant[];
  /** What this asset belongs to, so orphans can be found and swept. */
  refType?: 'product' | 'category' | 'brand' | 'review' | 'avatar';
  refId?: Types.ObjectId;
  uploadedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type MediaDocument = HydratedDocument<IMedia>;

const mediaSchema = new Schema<IMedia, Model<IMedia>>(
  {
    key: { type: String, required: true, unique: true },
    bucket: { type: String, required: true },
    url: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true, min: 0 },
    width: { type: Number },
    height: { type: Number },
    alt: { type: String, maxlength: 200 },
    blurDataUrl: { type: String },
    variants: {
      type: [
        {
          _id: false,
          name: { type: String, required: true },
          key: { type: String, required: true },
          url: { type: String, required: true },
          width: { type: Number, required: true },
          height: { type: Number, required: true },
          size: { type: Number, required: true },
        },
      ],
      default: [],
    },
    refType: { type: String, enum: ['product', 'category', 'brand', 'review', 'avatar'] },
    refId: { type: Schema.Types.ObjectId },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

mediaSchema.index({ refType: 1, refId: 1 });
mediaSchema.index({ createdAt: -1 });

export const Media = model<IMedia>('Media', mediaSchema);
