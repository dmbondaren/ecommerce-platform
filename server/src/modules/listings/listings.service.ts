import type { Prisma } from '@prisma/client'
import { badRequest, conflict, notFound } from '../../lib/errors'
import { paginated } from '../../lib/http'
import { logger } from '../../lib/logger'
import { prisma } from '../../lib/prisma'
import { isAdminRole, type AuthContext } from '../../middleware/auth'
import { hub } from '../../realtime/hub'
import { notificationService } from '../notifications/notifications.service'
import { listingInclude, toListing } from './listing.dto'
import type { ListingInput, ListingQuery } from './listing.schemas'
import { screenListing } from './moderation'

// `id` is the tie-breaker that keeps pages stable when the first key is equal.
const ORDER_BY: Record<ListingQuery['sort'], Prisma.ListingOrderByWithRelationInput[]> = {
  newest: [{ createdAt: 'desc' }, { id: 'desc' }],
  oldest: [{ createdAt: 'asc' }, { id: 'asc' }],
  price_asc: [{ price: 'asc' }, { id: 'asc' }],
  price_desc: [{ price: 'desc' }, { id: 'desc' }],
  popular: [{ viewCount: 'desc' }, { id: 'desc' }],
}

async function findOwned(ownerId: string, id: string) {
  const listing = await prisma.listing.findUnique({ where: { id } })
  // 404 rather than 403: do not confirm that somebody else's listing exists.
  if (!listing || listing.ownerId !== ownerId) throw notFound('Listing')
  return listing
}

async function assertCategoryExists(categoryId: number) {
  const category = await prisma.category.findUnique({ where: { id: categoryId }, select: { id: true } })
  if (!category) throw badRequest('Unknown category')
}

function trackSearch(rawQuery: string) {
  const query = rawQuery.toLowerCase()
  if (query.length < 2) return
  prisma.searchStat
    .upsert({
      where: { query },
      create: { query },
      update: { count: { increment: 1 }, lastSearchedAt: new Date() },
    })
    .catch((err: unknown) => logger.warn({ err }, 'Failed to record search statistics'))
}

/** Splits validated input into database columns. */
function toColumns(input: ListingInput) {
  const { imageUrls, coordinates, ...fields } = input
  return {
    imageUrls,
    fields: { ...fields, latitude: coordinates?.lat ?? null, longitude: coordinates?.lng ?? null },
  }
}

function notifyHeldForReview(ownerId: string, listingId: string, title: string, reason: string) {
  notificationService.notifyInBackground(
    ownerId,
    `"${title}" is waiting for a moderator because it ${reason}. It will be published once approved.`,
    `/listings/${listingId}`,
  )
}

const announce = (listingId: string, status: string) =>
  hub.broadcast({ type: 'listing.changed', listingId, status })

export const listingService = {
  categories() {
    return prisma.category.findMany({ orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] })
  },

  async search(query: ListingQuery) {
    const where: Prisma.ListingWhereInput = {
      status: query.available ? 'ACTIVE' : { in: ['ACTIVE', 'RESERVED'] },
    }
    if (query.q) {
      where.OR = [
        { title: { contains: query.q, mode: 'insensitive' } },
        { description: { contains: query.q, mode: 'insensitive' } },
      ]
    }
    if (query.category) where.category = { slug: query.category }
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      where.price = { gte: query.minPrice, lte: query.maxPrice }
    }

    const [rows, total] = await Promise.all([
      prisma.listing.findMany({
        where,
        include: listingInclude,
        orderBy: ORDER_BY[query.sort],
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
      prisma.listing.count({ where }),
    ])
    if (query.q && query.page === 1) trackSearch(query.q)
    return paginated(rows.map(toListing), total, query.page, query.pageSize)
  },

  async topSearches(limit = 6) {
    const rows = await prisma.searchStat.findMany({ orderBy: { count: 'desc' }, take: limit })
    return rows.map((row) => row.query)
  },

  /** Active, reserved and sold listings are public; everything else only to the owner and staff. */
  async getById(id: string, viewer?: AuthContext) {
    const listing = await prisma.listing.findUnique({ where: { id }, include: listingInclude })
    if (!listing) throw notFound('Listing')
    const isPublic = ['ACTIVE', 'RESERVED', 'SOLD'].includes(listing.status)
    const isPrivileged = viewer !== undefined && (viewer.userId === listing.ownerId || isAdminRole(viewer.role))
    if (!isPublic && !isPrivileged) throw notFound('Listing')
    return toListing(listing)
  },

  async byOwner(ownerId: string, options = { onlyActive: false }) {
    const rows = await prisma.listing.findMany({
      where: { ownerId, status: options.onlyActive ? { in: ['ACTIVE', 'RESERVED'] } : { not: 'ARCHIVED' } },
      include: listingInclude,
      orderBy: ORDER_BY.newest,
    })
    return rows.map(toListing)
  },

  async create(ownerId: string, input: ListingInput) {
    await assertCategoryExists(input.categoryId)
    const { imageUrls, fields } = toColumns(input)
    const flag = screenListing(input.title, input.description)
    const listing = await prisma.listing.create({
      data: {
        ...fields,
        ownerId,
        ...(flag ? { status: 'PENDING_REVIEW' as const, moderationReason: `Automatic check: ${flag}` } : {}),
        images: { create: imageUrls.map((url, position) => ({ url, position })) },
      },
      include: listingInclude,
    })
    if (flag) notifyHeldForReview(ownerId, listing.id, listing.title, flag)
    announce(listing.id, listing.status)
    return toListing(listing)
  },

  async update(ownerId: string, id: string, input: ListingInput) {
    const current = await findOwned(ownerId, id)
    if (current.status === 'SOLD' || current.status === 'ARCHIVED') {
      throw conflict('A sold listing cannot be edited')
    }
    if (current.status === 'RESERVED') {
      throw conflict('This listing is reserved by a buyer and cannot be edited until the payment is settled')
    }
    await assertCategoryExists(input.categoryId)
    const { imageUrls, fields } = toColumns(input)
    const flag = screenListing(input.title, input.description)
    const held = flag !== null || current.status === 'DEACTIVATED' || current.status === 'PENDING_REVIEW'
    const updated = await prisma.listing.update({
      where: { id },
      data: {
        ...fields,
        // An edited listing that moderators took down, or that the automatic
        // check flags, goes to the moderators before it is shown again.
        status: held ? 'PENDING_REVIEW' : current.status,
        ...(flag ? { moderationReason: `Automatic check: ${flag}` } : {}),
        images: { deleteMany: {}, create: imageUrls.map((url, position) => ({ url, position })) },
      },
      include: listingInclude,
    })
    if (flag) notifyHeldForReview(ownerId, id, updated.title, flag)
    announce(updated.id, updated.status)

    const priceDropped =
      updated.status === 'ACTIVE' && updated.currency === current.currency && updated.price.lessThan(current.price)
    if (priceDropped) {
      const watchers = await prisma.favorite.findMany({
        where: { listingId: id, userId: { not: ownerId } },
        select: { userId: true },
        take: 500,
      })
      for (const { userId } of watchers) {
        notificationService.notifyInBackground(
          userId,
          `Price drop: "${updated.title}" now costs ${updated.price.toFixed(2)} ${updated.currency}`,
          `/listings/${id}`,
        )
      }
    }
    return toListing(updated)
  },

  /** Listings that were sold are archived instead of deleted so reports and chats keep their context. */
  async remove(ownerId: string, id: string) {
    const current = await findOwned(ownerId, id)
    if (current.status === 'RESERVED') {
      throw conflict('This listing is reserved by a buyer and cannot be deleted until the payment is settled')
    }
    await this.removeOrArchive(id)
  },

  async removeOrArchive(id: string, moderationReason?: string) {
    const orders = await prisma.order.count({ where: { listingId: id } })
    if (orders > 0) {
      await prisma.listing.update({ where: { id }, data: { status: 'ARCHIVED', moderationReason } })
    } else {
      await prisma.listing.delete({ where: { id } })
    }
    announce(id, 'REMOVED')
  },

  async relist(ownerId: string, id: string) {
    const current = await findOwned(ownerId, id)
    if (current.status !== 'SOLD') throw conflict('Only a sold listing can be listed again')
    const updated = await prisma.listing.update({
      where: { id },
      data: { status: 'ACTIVE', moderationReason: null },
      include: listingInclude,
    })
    announce(id, updated.status)
    return toListing(updated)
  },

  /** Counts one view per signed-in user, and keeps the user's browsing history. */
  async recordView(userId: string, listingId: string) {
    const listing = await prisma.listing.findUnique({ where: { id: listingId }, select: { ownerId: true } })
    if (!listing) throw notFound('Listing')
    if (listing.ownerId === userId) return
    const key = { userId_listingId: { userId, listingId } }
    const seen = await prisma.listingView.findUnique({ where: key })
    if (seen) {
      await prisma.listingView.update({ where: key, data: { viewedAt: new Date() } })
      return
    }
    try {
      await prisma.$transaction([
        prisma.listingView.create({ data: { userId, listingId } }),
        prisma.listing.update({ where: { id: listingId }, data: { viewCount: { increment: 1 } } }),
      ])
    } catch (err) {
      // Two tabs opening the page at once: the other request already counted the view.
      logger.debug({ err }, 'Duplicate listing view ignored')
    }
  },

  async history(userId: string) {
    const rows = await prisma.listingView.findMany({
      where: { userId, listing: { status: { not: 'ARCHIVED' } } },
      orderBy: { viewedAt: 'desc' },
      take: 60,
      include: { listing: { include: listingInclude } },
    })
    return rows.map((row) => toListing(row.listing))
  },

  async favorites(userId: string) {
    const rows = await prisma.favorite.findMany({
      where: { userId, listing: { status: { not: 'ARCHIVED' } } },
      orderBy: { createdAt: 'desc' },
      include: { listing: { include: listingInclude } },
    })
    return rows.map((row) => toListing(row.listing))
  },

  async cart(userId: string) {
    const rows = await prisma.cartItem.findMany({
      where: { userId, listing: { status: 'ACTIVE' } },
      orderBy: { createdAt: 'desc' },
      include: { listing: { include: listingInclude } },
    })
    return rows.map((row) => toListing(row.listing))
  },

  async setFavorite(userId: string, listingId: string, enabled: boolean) {
    if (!enabled) {
      await prisma.favorite.deleteMany({ where: { userId, listingId } })
      return
    }
    const listing = await prisma.listing.findUnique({ where: { id: listingId }, select: { id: true } })
    if (!listing) throw notFound('Listing')
    await prisma.favorite.upsert({
      where: { userId_listingId: { userId, listingId } },
      create: { userId, listingId },
      update: {},
    })
  },

  async setInCart(userId: string, listingId: string, enabled: boolean) {
    if (!enabled) {
      await prisma.cartItem.deleteMany({ where: { userId, listingId } })
      return
    }
    const listing = await prisma.listing.findUnique({
      where: { id: listingId },
      select: { ownerId: true, status: true },
    })
    if (!listing) throw notFound('Listing')
    if (listing.ownerId === userId) throw conflict('You cannot buy your own listing')
    if (listing.status !== 'ACTIVE') throw conflict('This listing is no longer available')
    await prisma.cartItem.upsert({
      where: { userId_listingId: { userId, listingId } },
      create: { userId, listingId },
      update: {},
    })
  },
}
