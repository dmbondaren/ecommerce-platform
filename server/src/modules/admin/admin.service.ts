import type { Prisma, User } from '@prisma/client'
import { z } from 'zod'
import { env } from '../../config/env'
import { AppError, conflict, forbidden, notFound } from '../../lib/errors'
import { paginated } from '../../lib/http'
import { prisma } from '../../lib/prisma'
import { lastMailFailure, mailer, mailTransport, parseSender } from '../../mail/mailer'
import { isAdminRole, type AuthContext } from '../../middleware/auth'
import { hub } from '../../realtime/hub'
import { listingInclude, toListing } from '../listings/listing.dto'
import type { StaffListingInput } from '../listings/listing.schemas'
import { listingService } from '../listings/listings.service'
import { notificationService } from '../notifications/notifications.service'
import { publicUserSelect, toAdminUser, toPublicUser } from '../users/user.dto'
import { orderInclude, toOrder } from '../orders/orders.service'
import { recordAudit } from './audit'
import { buildPlatformStats } from './platform-stats'

const reason = z.string().trim().min(3, 'Give a reason of at least 3 characters').max(500)

export const reasonSchema = z.object({ reason })
const MAX_BAN_MINUTES = 10 * 365 * 24 * 60

/**
 * A suspension lasts a number of minutes or until a given moment; with
 * neither it is permanent.
 */
export const banSchema = z
  .object({
    reason,
    minutes: z.coerce.number().int().min(1).max(MAX_BAN_MINUTES).nullish(),
    until: z.coerce.date().nullish(),
  })
  .refine((value) => !(value.minutes && value.until), {
    message: 'Give either a duration or an end date, not both',
    path: ['until'],
  })
  .refine((value) => !value.until || value.until.getTime() > Date.now() + 30_000, {
    message: 'The end of the suspension must be in the future',
    path: ['until'],
  })

/** When a suspension ends; `null` means never. */
export const banEnd = (input: { minutes?: number | null; until?: Date | null }, now = new Date()) =>
  input.until ?? (input.minutes ? new Date(now.getTime() + input.minutes * 60_000) : null)
export const roleSchema = z.object({ role: z.enum(['USER', 'ADMIN']) })
export const orderSearchSchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.enum(['PENDING_PAYMENT', 'PAID', 'CANCELLED', 'EXPIRED']).optional(),
  ),
})
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
    const bannedUntil = banEnd(input)
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

  /** A moderator corrects a user's listing; the owner is told and the change is logged. */
  async editListing(actor: AuthContext, id: string, input: StaffListingInput) {
    const updated = await listingService.updateAsStaff(id, input)
    await recordAudit({ actorId: actor.userId, action: 'LISTING_EDITED', targetType: 'listing', targetId: id, reason: updated.title })
    if (updated.owner.id !== actor.userId) {
      notificationService.notifyInBackground(
        updated.owner.id,
        `A moderator edited your listing "${updated.title}". Please check that everything is still correct.`,
        `/listings/${id}`,
      )
    }
    return updated
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

  /**
   * Every order ever placed, newest first. Orders keep a snapshot of the
   * listing, so this is also the archive of what was sold, even when the
   * listing or its owner no longer exists.
   */
  async orders(query: { q?: string; status?: 'PENDING_PAYMENT' | 'PAID' | 'CANCELLED' | 'EXPIRED'; page: number; pageSize: number }) {
    const where: Prisma.OrderWhereInput = {}
    if (query.status) where.status = query.status
    if (query.q) {
      where.OR = [
        { titleSnapshot: { contains: query.q, mode: 'insensitive' } },
        { buyer: { nickname: { contains: query.q, mode: 'insensitive' } } },
        { seller: { nickname: { contains: query.q, mode: 'insensitive' } } },
        { paymentReference: { contains: query.q, mode: 'insensitive' } },
      ]
    }
    const [rows, total] = await Promise.all([
      prisma.order.findMany({
        where,
        include: orderInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.order.count({ where }),
    ])
    const items = rows.map((row) => ({ ...toOrder(row), paymentReference: row.paymentReference }))
    return paginated(items, total, query.page, query.pageSize)
  },

  /** Figures for the statistics page: totals, the last 30 days, and rankings. */
  async stats() {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const [users, bannedUsers, listingGroups, orderGroups, paid, newUsers, newListings, openReports] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { OR: [{ bannedPermanently: true }, { bannedUntil: { gt: new Date() } }] } }),
      prisma.listing.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.order.groupBy({ by: ['status'], _count: { _all: true } }),
      prisma.order.findMany({
        where: { status: 'PAID' },
        select: { price: true, currency: true, categorySnapshot: true, paidAt: true, createdAt: true, sellerId: true, buyerId: true },
      }),
      prisma.user.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
      prisma.listing.findMany({ where: { createdAt: { gte: since } }, select: { createdAt: true } }),
      prisma.report.count({ where: { status: 'OPEN' } }),
    ])
    const stats = buildPlatformStats({
      paidOrders: paid.map((order) => ({
        price: order.price.toNumber(),
        currency: order.currency,
        category: order.categorySnapshot,
        paidAt: order.paidAt ?? order.createdAt,
        sellerId: order.sellerId,
        buyerId: order.buyerId,
      })),
      newUsers: newUsers.map((user) => user.createdAt),
      newListings: newListings.map((listing) => listing.createdAt),
    })

    const ids = [...new Set([...stats.topSellers, ...stats.topBuyers].map((entry) => entry.key))]
    const people = await prisma.user.findMany({ where: { id: { in: ids } }, select: publicUserSelect })
    const personOf = new Map(people.map((person) => [person.id, toPublicUser(person)]))
    const withUser = (entries: typeof stats.topSellers) =>
      entries.map((entry) => ({ user: personOf.get(entry.key) ?? null, count: entry.count, revenue: entry.revenue }))

    return {
      totals: {
        users,
        bannedUsers,
        openReports,
        listings: Object.fromEntries(listingGroups.map((group) => [group.status, group._count._all])),
        orders: Object.fromEntries(orderGroups.map((group) => [group.status, group._count._all])),
      },
      mainCurrency: stats.mainCurrency,
      revenue: stats.revenue,
      daily: stats.daily,
      categories: stats.categories,
      topSellers: withUser(stats.topSellers),
      topBuyers: withUser(stats.topBuyers),
    }
  },

  /** How this deployment is set up, without revealing any secret. */
  system() {
    return {
      mail: {
        transport: mailTransport(),
        sender: parseSender(env.MAIL_FROM).email,
        lastFailure: lastMailFailure(),
      },
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
