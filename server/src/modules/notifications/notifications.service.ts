import { logger } from '../../lib/logger'
import { prisma } from '../../lib/prisma'
import { hub } from '../../realtime/hub'

export const notificationService = {
  /** Stores a notification and pushes it to the user's open tabs. */
  async notify(userId: string, message: string, link?: string) {
    const notification = await prisma.notification.create({ data: { userId, message, link } })
    hub.toUsers([userId], { type: 'notification.created', notification })
    return notification
  },

  /** For side effects of a request: a failed notification must not fail the request. */
  notifyInBackground(userId: string, message: string, link?: string) {
    this.notify(userId, message, link).catch((err: unknown) =>
      logger.warn({ err, userId }, 'Failed to create notification'),
    )
  },

  async list(userId: string) {
    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({ where: { userId }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.notification.count({ where: { userId, readAt: null } }),
    ])
    return { items, unreadCount }
  },

  async markAllRead(userId: string) {
    await prisma.notification.updateMany({ where: { userId, readAt: null }, data: { readAt: new Date() } })
  },
}
