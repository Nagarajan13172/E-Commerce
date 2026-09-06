import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';

/**
 * Runtime-editable store settings.
 *
 * The split from environment variables is deliberate: `.env` holds things that
 * are *infrastructure* (secrets, connection strings, provider keys) and must not
 * change without a deploy. This holds things that are *merchandising* — store
 * name, support email, free-shipping threshold — which an admin should be able
 * to change from the dashboard without one.
 *
 * `isPublic` marks values safe to expose on the storefront's public settings
 * endpoint, so an internal setting cannot leak by being added to this collection.
 */
export interface ISetting {
  _id: Types.ObjectId;
  key: string;
  value: unknown;
  group: 'store' | 'shipping' | 'tax' | 'payment' | 'email' | 'seo';
  label?: string;
  isPublic: boolean;
  updatedBy?: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export type SettingDocument = HydratedDocument<ISetting>;

const settingSchema = new Schema<ISetting, Model<ISetting>>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    value: { type: Schema.Types.Mixed, required: true },
    group: {
      type: String,
      enum: ['store', 'shipping', 'tax', 'payment', 'email', 'seo'],
      default: 'store',
    },
    label: { type: String, maxlength: 120 },
    isPublic: { type: Boolean, default: false },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

settingSchema.index({ group: 1, key: 1 });
settingSchema.index({ isPublic: 1 });

export const Setting = model<ISetting>('Setting', settingSchema);
