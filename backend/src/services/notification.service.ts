import type { Types } from 'mongoose';
import type { NotificationType } from '@ecom/shared';
import { Notification } from '../models/notification.model.js';
import { createLogger } from '../config/logger.js';

const log = createLogger('notifications');

/**
 * In-app notifications (the header bell), separate from transactional email.
 *
 * Writes are best-effort: a notification row is a convenience, and failing to
 * insert one must never fail the business operation that triggered it.
 */
export async function notify(params: {
  user: Types.ObjectId | string;
  type: NotificationType;
  title: string;
  body: string;
  link?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await Notification.create({
      user: params.user,
      type: params.type,
      title: params.title,
      body: params.body,
      link: params.link,
      metadata: params.metadata,
    });
  } catch (err) {
    log.error({ err, type: params.type }, 'Failed to record notification');
  }
}

export async function listForUser(
  userId: string,
  options: { limit?: number; unreadOnly?: boolean } = {},
) {
  const filter: Record<string, unknown> = { user: userId };
  if (options.unreadOnly) filter.readAt = { $exists: false };

  const [items, unreadCount] = await Promise.all([
    Notification.find(filter)
      .sort({ createdAt: -1 })
      .limit(options.limit ?? 20)
      .lean(),
    Notification.countDocuments({ user: userId, readAt: { $exists: false } }),
  ]);

  return { items, unreadCount };
}

export async function markRead(userId: string, notificationId?: string): Promise<void> {
  await Notification.updateMany(
    {
      user: userId,
      ...(notificationId ? { _id: notificationId } : {}),
      readAt: { $exists: false },
    },
    { $set: { readAt: new Date() } },
  );
}
