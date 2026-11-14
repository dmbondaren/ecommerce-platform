import type { Prisma } from '@prisma/client'
import { env } from '../../config/env'
import { conflict } from '../../lib/errors'
import { logger } from '../../lib/logger'
import { prisma } from '../../lib/prisma'
import { mailer } from '../../mail/mailer'
import { hub } from '../../realtime/hub'
import { listingInclude } from '../listings/listing.dto'
import { notificationService } from '../notifications/notifications.service'
import { publicUserSelect, toPublicUser } from '../users/user.dto'

const orderInclude = {
  buyer: { select: publicUserSelect },
  seller: { select: publicUserSelect },
  review: { select: { id: true, rating: true } },
} satisfies Prisma.OrderInclude

type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderInclude }>

export const toOrder = (order: OrderRow) => ({
  id: order.id,
  listingId: order.listingId,
  title: order.titleSnapshot,
  description: order.descriptionSnapshot,
  category: order.categorySnapshot,
  imageUrls: order.imageUrlsSnapshot,
  price: order.price.toNumber(),
  currency: order.currency,
  buyer: order.buyer ? toPublicUser(order.buyer) : null,
  seller: order.seller ? toPublicUser(order.seller) : null,
  review: order.review,
  createdAt: order.createdAt,
})

function sendReceipts(buyerId: string, orders: OrderRow[]) {
  const send = async () => {
    const ids = [buyerId, ...orders.map((order) => order.sellerId)].filter((id): id is string => id !== null)
    const users = await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true } })
    const emailOf = new Map(users.map((user) => [user.id, user.email]))
    const buyerEmail = emailOf.get(buyerId)
    for (const order of orders) {
      const amount = `${order.price.toFixed(2)} ${order.currency}`
      if (buyerEmail) {
        await mailer.send({
          to: buyerEmail,
          subject: `Your purchase: ${order.titleSnapshot}`,
          heading: 'Purchase confirmed',
          body: `You bought "${order.titleSnapshot}" for ${amount}. Contact the seller in the chat to arrange the handover.`,
          action: { label: 'View my purchases', url: `${env.CLIENT_URL}/account/purchases` },
        })
      }
      const sellerEmail = order.sellerId ? emailOf.get(order.sellerId) : undefined
      if (sellerEmail) {
        await mailer.send({
          to: sellerEmail,
          subject: `Sold: ${order.titleSnapshot}`,
          heading: 'Your listing was sold',
          body: `"${order.titleSnapshot}" was bought for ${amount}. The buyer may contact you in the chat.`,
          action: { label: 'View my sales', url: `${env.CLIENT_URL}/account/sales` },
        })
      }
    }
  }
  send().catch((err: unknown) => logger.warn({ err }, 'Failed to send order e-mails'))
}

export const orderService = {
  /**
   * Buys every listing in one transaction: either all of them are sold to
   * this buyer or none is. The conditional update acts as the lock, so when
   * two people buy the same item at the same moment exactly one succeeds.
   */
  async checkout(buyerId: string, listingIds: string[]) {
    const ids = [...new Set(listingIds)]
    const orderIds = await prisma.$transaction(async (tx) => {
      const created: string[] = []
      for (const id of ids) {
        const claimed = await tx.listing.updateMany({
          where: { id, status: 'ACTIVE', ownerId: { not: buyerId } },
          data: { status: 'SOLD' },
        })
        if (claimed.count === 0) throw conflict('One of the listings is no longer available')

        const listing = await tx.listing.findUniqueOrThrow({ where: { id }, include: listingInclude })
        const order = await tx.order.create({
          data: {
            buyerId,
            sellerId: listing.ownerId,
            listingId: listing.id,
            price: listing.price,
            currency: listing.currency,
            titleSnapshot: listing.title,
            descriptionSnapshot: listing.description,
            categorySnapshot: listing.category.name,
            imageUrlsSnapshot: listing.images.map((image) => image.url),
          },
        })
        // The item is gone, so it leaves every cart, not only the buyer's.
        await tx.cartItem.deleteMany({ where: { listingId: id } })
        created.push(order.id)
      }
      return created
    })

    const orders = await prisma.order.findMany({ where: { id: { in: orderIds } }, include: orderInclude })
    for (const order of orders) {
      if (order.listingId) hub.broadcast({ type: 'listing.changed', listingId: order.listingId, status: 'SOLD' })
      if (order.sellerId) {
        notificationService.notifyInBackground(
          order.sellerId,
          `"${order.titleSnapshot}" was sold for ${order.price.toFixed(2)} ${order.currency}`,
          '/account/sales',
        )
      }
    }
    sendReceipts(buyerId, orders)
    return orders.map(toOrder)
  },

  async purchases(userId: string) {
    const rows = await prisma.order.findMany({
      where: { buyerId: userId },
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
    })
    return rows.map(toOrder)
  },

  async sales(userId: string) {
    const rows = await prisma.order.findMany({
      where: { sellerId: userId },
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
    })
    return rows.map(toOrder)
  },
}
