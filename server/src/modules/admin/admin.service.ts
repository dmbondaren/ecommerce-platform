import type { Prisma, User } from '@prisma/client'
import { z } from 'zod'
import { env } from '../../config/env'
import { AppError, conflict, forbidden, notFound } from '../../lib/errors'
import { paginated } from '../../lib/http'
import { prisma } from '../../lib/prisma'
import { mailer, mailTransport, parseSender } from '../../mail/mailer'
import { isAdminRole, type AuthContext } from '../../middleware/auth'
import { hub } from '../../realtime/hub'
import { listingInclude, toListing } from '../listings/listing.dto'
import { listingService } from '../listings/listings.service'
import { notificationService } from '../notifications/notifications.service'
import { publicUserSelect, toAdminUser, toPublicUser } from '../users/user.dto'
import { recordAudit } from './audit'

const reason = z.string().trim().min(3, 'Give a reason of at least 3 characters').max(500)

export const reasonSchema = z.object({ reason })
export const banSchema = z.object({
  reason,
  /** Length of the suspension; leave out for a permanent ban. */
  days: z.coerce.number().int().min(1).max(3650).nullish(),
})
export const roleSchema = z.object({ role: z.enum(['USER', 'ADMIN']) })
export const userSearchSchema = z.object({ q: z.string().trim().max(100).optional() })

async function findUser(id: string): Promise<User> {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) throw notFound('User')
  return user
}

/** Admins moderate regular users; only a super admin may act on other staff. */
function assertCanModerate(actor: AuthContext, target: User) {
  if (target.id === actor.userId) throw forbidden('You cannot do this to your own account')
  if (target.role === 'SUPER_ADMIN') throw forbidden('A super administrator cannot be moderated')
  if (isAdminRole(target.role) && actor.role !== 'SUPER_ADMIN') {
    throw forbidden('Only a super administrator can moderate staff accounts')
  }
}

async function findListing(id: string) {
  const listing = await prisma.listing.findUnique({ where: { id } })
  if (!listing) throw notFound('Listing')
  return listing
}

export const adminService = {
  async users(query: { q?: string; page: number; pageSize: number }) {
    const where: Prisma.UserWhereInput = query.q
      ? {
          OR: [
            { email: { contains: query.q, mode: 'insensitive' } },
            { nickname: { contains: query.q, mode: 'insensitive' } },
          ],
        }
      : {}
    const [rows, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.user.count({ where }),
    ])
    return paginated(rows.map(toAdminUser), total, query.page, query.pageSize)
  },

  async user(id: string) {
    const user = await findUser(id)
    const [listings, purchases, sales, reportsFiled, reportsReceived] = await Promise.all([
      prisma.listing.count({ where: { ownerId: id, status: { not: 'ARCHIVED' } } }),
      prisma.order.count({ where: { buyerId: id } }),
      prisma.order.count({ where: { sellerId: id } }),
      prisma.report.count({ where: { reporterId: id } }),
      prisma.report.count({ where: { listing: { ownerId: id } } }),
    ])
    return { ...toAdminUser(user), stats: { listings, purchases, sales, reportsFiled, reportsReceived } }
  },

  async ban(actor: AuthContext, userId: string, input: z.infer<typeof banSchema>) {
    const target = await findUser(userId)
    assertCanModerate(actor, target)
    const bannedUntil = input.days ? new Date(Date.now() + input.days * 24 * 60 * 60 * 1000) : null
    const [updated] = await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { bannedUntil, bannedPermanently: bannedUntil === null, banReason: input.reason },
      }),
      // Signs the user out everywhere; access tokens stop working at once
      // because the ban is checked on every request.
      prisma.refreshToken.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ])
    await recordAudit({
      actorId: actor.userId,
      action: 'USER_BANNED',
      targetType: 'user',
      targetId: userId,
      reason: input.reason,
    })
    hub.toUsers([userId], { type: 'account.suspended' })
    hub.disconnectUser(userId)
    return toAdminUser(updated)
  },

  async unban(actor: AuthContext, userId: string) {
    const target = await findUser(userId)
    assertCanModerate(actor, target)
    const updated = await prisma.user.update({
      where: { id: userId },
      data: { bannedUntil: null, bannedPermanently: false, banReason: null },
    })
    await recordAudit({ actorId: actor.userId, action: 'USER_UNBANNED', targetType: 'user', targetId: userId })
    return toAdminUser(updated)
  },

  async setRole(actor: AuthContext, userId: string, role: 'USER' | 'ADMIN') {
    const target = await findUser(userId)
    assertCanModerate(actor, target)
    const updated = await prisma.user.update({ where: { id: userId }, data: { role } })
    await recordAudit({
      actorId: actor.userId,
      action: 'ROLE_CHANGED',
      targetType: 'user',
      targetId: userId,
      reason: `${target.role} -> ${role}`,
    })
    return toAdminUser(updated)
  },

  /** Removes the account and, through cascading foreign keys, everything it owns. */
  async deleteUser(actor: AuthContext, userId: string, why: string) {
    const target = await findUser(userId)
    assertCanModerate(actor, target)
    await prisma.user.delete({ where: { id: userId } })
    await recordAudit({
      actorId: actor.userId,
      action: 'USER_DELETED',
      targetType: 'user',
      targetId: userId,
      reason: `${target.email}: ${why}`,
    })
    hub.disconnectUser(userId)
  },

  /** Listings waiting for a decision: taken down, or edited after being taken down. */
  async moderationQueue() {
    const rows = await prisma.listing.findMany({
      where: { status: { in: ['PENDING_REVIEW', 'DEACTIVATED'] } },
      include: listingInclude,
      orderBy: { updatedAt: 'desc' },
      take: 200,
    })
    return rows.map(toListing)
  },

  async deactivateListing(actor: AuthContext, id: string, why: string) {
    const listing = await findListing(id)
    if (listing.status !== 'ACTIVE' && listing.status !== 'PENDING_REVIEW') {
      throw conflict('Only an active or pending listing can be deactivated')
    }
    const updated = await prisma.listing.update({
      where: { id },
      data: { status: 'DEACTIVATED', moderationReason: why },
      include: listingInclude,
    })
    await recordAudit({
      actorId: actor.userId,
      action: 'LISTING_DEACTIVATED',
      targetType: 'listing',
      targetId: id,
      reason: why,
    })
    hub.broadcast({ type: 'listing.changed', listingId: id, status: updated.status })
    notificationService.notifyInBackground(
      listing.ownerId,
      `Your listing "${listing.title}" was taken down by a moderator: ${why}`,
      `/listings/${id}`,
    )
    return toListing(updated)
  },

  async activateListing(actor: AuthContext, id: string) {
    const listing = await findListing(id)
    if (listing.status !== 'DEACTIVATED' && listing.status !== 'PENDING_REVIEW') {
      throw conflict('This listing is not waiting for moderation')
    }
    const updated = await prisma.listing.update({
      where: { id },
      data: { status: 'ACTIVE', moderationReason: null },
      include: listingInclude,
    })
    await recordAudit({ actorId: actor.userId, action: 'LISTING_ACTIVATED', targetType: 'listing', targetId: id })
    hub.broadcast({ type: 'listing.changed', listingId: id, status: updated.status })
    notificationService.notifyInBackground(
      listing.ownerId,
      `Your listing "${listing.title}" is visible again`,
      `/listings/${id}`,
    )
    return toListing(updated)
  },

  async removeListing(actor: AuthContext, id: string, why: string) {
    const listing = await findListing(id)
    await listingService.removeOrArchive(id, why)
    await recordAudit({
      actorId: actor.userId,
      action: 'LISTING_REMOVED',
      targetType: 'listing',
      targetId: id,
      reason: `${listing.title}: ${why}`,
    })
    notificationService.notifyInBackground(
      listing.ownerId,
      `Your listing "${listing.title}" was removed by a moderator: ${why}`,
    )
  },

  /** How this deployment is set up, without revealing any secret. */
  system() {
    return {
      mail: { transport: mailTransport(), sender: parseSender(env.MAIL_FROM).email },
      autoVerifyEmail: env.AUTO_VERIFY_EMAIL,
      storage: env.STORAGE_DRIVER,
      paymentWindowMinutes: env.PAYMENT_WINDOW_MINUTES,
    }
  },

  /**
   * Sends a message to the administrator's own address and, unlike the
   * e-mails the application sends in the background, reports the provider's
   * answer, so a wrong key or an unverified sender can be seen at once.
   */
  async sendTestEmail(actor: AuthContext) {
    if (mailTransport() === 'log') {
      throw new AppError(409, 'MAIL_NOT_CONFIGURED', 'No e-mail provider is configured: set BREVO_API_KEY (or SMTP_HOST)')
    }
    const user = await findUser(actor.userId)
    try {
      await mailer.send({
        to: user.email,
        subject: 'Marketplace test e-mail',
        heading: 'It works',
        body: 'This message confirms that the marketplace can send e-mail.',
      })
    } catch (err) {
      throw new AppError(502, 'MAIL_FAILED', err instanceof Error ? err.message : 'The e-mail provider refused the message')
    }
    return { sentTo: user.email }
  },

  async auditLog(page: number, pageSize: number) {
    const [rows, total] = await Promise.all([
      prisma.auditLog.findMany({
        include: { actor: { select: publicUserSelect } },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      prisma.auditLog.count(),
    ])
    const items = rows.map(({ actor, ...entry }) => ({
      ...entry,
      actor: actor ? toPublicUser(actor) : null,
    }))
    return paginated(items, total, page, pageSize)
  },
}
