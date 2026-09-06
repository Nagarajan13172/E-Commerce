import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import { NOTIFICATION_TYPES, type NotificationType } from '@ecom/shared';

/** In-app notifications shown in the header bell, alongside transactional email. */
export interface INotification {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  /** Where clicking the notification should take the user. */
  link?: string;
  readAt?: Date;
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

export type NotificationDocument = HydratedDocument<INotification>;

const notificationSchema = new Schema<INotification, Model<INotification>>(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 1000 },
    link: { type: String },
    readAt: { type: Date },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

// The bell: this user's notifications, newest first.
notificationSchema.index({ user: 1, createdAt: -1 });
// Unread badge count.
notificationSchema.index({ user: 1, readAt: 1 });
// Notifications are ephemeral; 90 days is plenty.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 90 });

export const Notification = model<INotification>('Notification', notificationSchema);
