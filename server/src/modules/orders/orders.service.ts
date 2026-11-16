import type { Prisma } from '@prisma/client'
import { env } from '../../config/env'
import { randomToken } from '../../lib/crypto'
import { conflict, notFound } from '../../lib/errors'
import { logger } from '../../lib/logger'
import { prisma } from '../../lib/prisma'
import { mailer } from '../../mail/mailer'
import { hub } from '../../realtime/hub'
import { listingInclude } from '../listings/listing.dto'
import { notificationService } from '../notifications/notifications.service'
import { publicUserSelect, toPublicUser } from '../users/user.dto'
import { summarizeSales } from './sales-summary'

const PAYMENT_WINDOW_MS = env.PAYMENT_WINDOW_MINUTES * 60_000

export const orderInclude = {
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
  status: order.status,
  expiresAt: order.expiresAt,
  paidAt: order.paidAt,
  buyer: order.buyer ? toPublicUser(order.buyer) : null,
  seller: order.seller ? toPublicUser(order.seller) : null,
  review: order.review,
  createdAt: order.createdAt,
})

/** What the buyer needs to make the transfer. Only ever sent to the buyer. */
const paymentDetails = (order: OrderRow) => ({
  // The seller's own account when they gave one, otherwise the demo account of the platform.
  recipient: order.paymentAccount ? (order.seller?.nickname ?? 'Seller') : env.PAYMENT_RECIPIENT,
  iban: order.paymentAccount ?? env.PAYMENT_IBAN,
  reference: order.paymentReference,
  amount: order.price.toNumber(),
  currency: order.currency,
})

/** The handover place is private to the two people in the deal, and only while the deal stands. */
const meetingPlaceOf = (order: OrderRow) =>
  order.status === 'PENDING_PAYMENT' || order.status === 'PAID' ? order.meetingPlace : null

const toSale = (order: OrderRow) => ({ ...toOrder(order), meetingPlace: meetingPlaceOf(order) })

const toPurchase = (order: OrderRow) => ({
  ...toSale(order),
  payment: order.status === 'PENDING_PAYMENT' ? paymentDetails(order) : null,
  reviewSkipped: order.reviewSkippedAt !== null,
})

/** Short and unambiguous to type into a banking app, e.g. "MP-7K3F9QXA". */
const newPaymentReference = () =>
  `MP-${randomToken()
    .replace(/[^A-Za-z0-9]/g, '')
    .slice(0, 8)
    .toUpperCase()}`

/** Uploads are stored as site-relative paths; an e-mail needs the full address. */
const absoluteUrl = (path: string) => (path.startsWith('http') ? path : `${env.CLIENT_URL}${path}`)

const amountOf = (order: OrderRow) => `${order.price.toFixed(2)} ${order.currency}`

async function emailOf(userId: string | null) {
  if (!userId) return null
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } })
  return user?.email ?? null
}

/** E-mails are a side effect: failing to send one must not fail the order. */
const inBackground = (what: string, task: () => Promise<void>) => {
  task().catch((err: unknown) => logger.warn({ err }, `Failed to ${what}`))
}

function announce(order: Pick<OrderRow, 'id' | 'buyerId' | 'sellerId' | 'listingId'>, status: string, listingStatus: string) {
  hub.toUsers([order.buyerId, order.sellerId], { type: 'order.updated', orderId: order.id, status })
  if (order.listingId) hub.broadcast({ type: 'listing.changed', listingId: order.listingId, status: listingStatus })
}

function sendPaymentInstructions(buyerId: string, orders: OrderRow[]) {
  inBackground('send payment instructions', async () => {
    const to = await emailOf(buyerId)
    if (!to) return
    for (const order of orders) {
      await mailer.send({
        to,
        subject: `Pay within ${env.PAYMENT_WINDOW_MINUTES} minutes: ${order.titleSnapshot}`,
        heading: 'Your item is reserved',
        body: `"${order.titleSnapshot}" is reserved for you for ${env.PAYMENT_WINDOW_MINUTES} minutes. Transfer the amount using the details below, then confirm the payment on the website. If the time runs out, the reservation is released and the item goes back on sale.`,
        details: [
          ['Amount', amountOf(order)],
          ['Recipient', paymentDetails(order).recipient],
          ['Account', paymentDetails(order).iban],
          ['Reference', order.paymentReference ?? order.id],
          ...handoverLine(order),
        ],
        action: { label: 'I have paid', url: `${env.CLIENT_URL}/account/purchases` },
      })
    }
  })
}

const handoverLine = (order: OrderRow): [string, string][] =>
  order.meetingPlace ? [['Handover', order.meetingPlace]] : []

/** Puts a listing back on sale, unless something else happened to it in the meantime. */
const releaseListing = (tx: Prisma.TransactionClient, listingId: string | null) =>
  listingId
    ? tx.listing.updateMany({ where: { id: listingId, status: 'RESERVED' }, data: { status: 'ACTIVE' } })
    : Promise.resolve({ count: 0 })

export const orderService = {
  /**
   * Reserves every listing for the buyer in one transaction: either all of
   * them or none. The conditional update acts as the lock, so when two people
   * buy the same item at the same moment exactly one succeeds. The buyer then
   * has a limited time to pay; see `confirmPayment` and `expireOverdue`.
   */
  async checkout(buyerId: string, listingIds: string[]) {
    const ids = [...new Set(listingIds)]
    const expiresAt = new Date(Date.now() + PAYMENT_WINDOW_MS)
    const orderIds = await prisma.$transaction(async (tx) => {
      const created: string[] = []
      for (const id of ids) {
        const claimed = await tx.listing.updateMany({
          where: { id, status: 'ACTIVE', ownerId: { not: buyerId } },
          data: { status: 'RESERVED' },
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
            status: 'PENDING_PAYMENT',
            paymentReference: newPaymentReference(),
            paymentAccount: listing.paymentAccount,
            meetingPlace: listing.meetingPlace,
            expiresAt,
          },
        })
        // The item is spoken for, so it leaves every cart, not only the buyer's.
        await tx.cartItem.deleteMany({ where: { listingId: id } })
        created.push(order.id)
      }
      return created
    })

    const orders = await prisma.order.findMany({ where: { id: { in: orderIds } }, include: orderInclude })
    for (const order of orders) {
      announce(order, order.status, 'RESERVED')
      if (order.sellerId) {
        notificationService.notifyInBackground(
          order.sellerId,
          `"${order.titleSnapshot}" is reserved: the buyer has ${env.PAYMENT_WINDOW_MINUTES} minutes to pay`,
          '/account/sales',
        )
      }
    }
    sendPaymentInstructions(buyerId, orders)
    return orders.map(toPurchase)
  },

  /**
   * The buyer states that the transfer has been made, which completes the
   * sale. There is no payment provider behind this: it models the manual
   * confirmation step of a peer-to-peer trade.
   */
  async confirmPayment(buyerId: string, orderId: string) {
    const now = new Date()
    const order = await prisma.$transaction(async (tx) => {
      // The deadline is part of the condition, so a late click cannot win
      // against the job that expires reservations.
      const paid = await tx.order.updateMany({
        where: { id: orderId, buyerId, status: 'PENDING_PAYMENT', expiresAt: { gt: now } },
        data: { status: 'PAID', paidAt: now },
      })
      if (paid.count === 0) {
        const existing = await tx.order.findFirst({ where: { id: orderId, buyerId }, select: { status: true } })
        if (!existing) throw notFound('Order')
        throw conflict(
          existing.status === 'PAID'
            ? 'This order is already paid'
            : 'The reservation has ended, so this order can no longer be paid',
        )
      }
      const row = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude })
      if (row.listingId) {
        await tx.listing.updateMany({ where: { id: row.listingId, status: 'RESERVED' }, data: { status: 'SOLD' } })
      }
      return row
    })

    announce(order, order.status, 'SOLD')
    if (order.sellerId) {
      notificationService.notifyInBackground(
        order.sellerId,
        `"${order.titleSnapshot}" was paid: ${amountOf(order)}. Arrange the handover with the buyer.`,
        '/account/sales',
      )
    }
    inBackground('send order e-mails', async () => {
      const [buyerEmail, sellerEmail] = await Promise.all([emailOf(order.buyerId), emailOf(order.sellerId)])
      const cover = order.imageUrlsSnapshot[0]
      // A receipt: everything the buyer needs to know about what they bought.
      const receipt: [string, string][] = [
        ['Item', order.titleSnapshot],
        ['Price', amountOf(order)],
        ['Category', order.categorySnapshot],
        ['Seller', order.seller?.nickname ?? 'Deleted account'],
        ['Paid on', (order.paidAt ?? new Date()).toISOString().slice(0, 16).replace('T', ' ') + ' UTC'],
        ['Reference', order.paymentReference ?? order.id],
        ...handoverLine(order),
      ]
      if (buyerEmail) {
        await mailer.send({
          to: buyerEmail,
          subject: `Your purchase: ${order.titleSnapshot}`,
          heading: 'Thank you for your purchase',
          body: `You confirmed the payment for "${order.titleSnapshot}". Contact the seller in the chat to arrange the handover, and leave a review once you have the item.`,
          imageUrl: cover ? absoluteUrl(cover) : undefined,
          details: receipt,
          action: { label: 'View my purchases', url: `${env.CLIENT_URL}/account/purchases` },
        })
      }
      if (sellerEmail) {
        await mailer.send({
          to: sellerEmail,
          subject: `Sold: ${order.titleSnapshot}`,
          heading: 'Your listing was sold',
          body: `The buyer confirmed the payment of ${amountOf(order)} for "${order.titleSnapshot}" and may contact you in the chat.`,
          action: { label: 'View my sales', url: `${env.CLIENT_URL}/account/sales` },
        })
      }
    })
    return toPurchase(order)
  },

  /** The buyer does not want to review a purchase; this only ends the reminder. */
  async skipReview(buyerId: string, orderId: string) {
    const skipped = await prisma.order.updateMany({
      where: { id: orderId, buyerId, status: 'PAID' },
      data: { reviewSkippedAt: new Date() },
    })
    if (skipped.count === 0) throw notFound('Order')
  },

  /** The buyer gives the reservation up, and the listing goes back on sale. */
  async cancel(buyerId: string, orderId: string) {
    const order = await prisma.$transaction(async (tx) => {
      const cancelled = await tx.order.updateMany({
        where: { id: orderId, buyerId, status: 'PENDING_PAYMENT' },
        data: { status: 'CANCELLED' },
      })
      if (cancelled.count === 0) throw conflict('Only an unpaid reservation can be cancelled')
      const row = await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: orderInclude })
      await releaseListing(tx, row.listingId)
      return row
    })
    announce(order, order.status, 'ACTIVE')
    if (order.sellerId) {
      notificationService.notifyInBackground(
        order.sellerId,
        `The buyer cancelled the reservation of "${order.titleSnapshot}". It is on sale again.`,
        '/account/listings',
      )
    }
    return toPurchase(order)
  },

  /**
   * Ends reservations whose time is up. Runs periodically; each order is
   * expired with a conditional update, so running it twice, or at the same
   * moment as a payment confirmation, is harmless.
   */
  async expireOverdue(now = new Date()) {
    const overdue = await prisma.order.findMany({
      where: { status: 'PENDING_PAYMENT', expiresAt: { lte: now } },
      include: orderInclude,
      take: 200,
    })
    let expiredCount = 0
    for (const order of overdue) {
      const expired = await prisma.$transaction(async (tx) => {
        const result = await tx.order.updateMany({
          where: { id: order.id, status: 'PENDING_PAYMENT' },
          data: { status: 'EXPIRED' },
        })
        if (result.count === 0) return false
        await releaseListing(tx, order.listingId)
        return true
      })
      if (!expired) continue
      expiredCount += 1
      announce(order, 'EXPIRED', 'ACTIVE')
      if (order.buyerId) {
        notificationService.notifyInBackground(
          order.buyerId,
          `The reservation of "${order.titleSnapshot}" ended because it was not paid in time`,
          order.listingId ? `/listings/${order.listingId}` : undefined,
        )
      }
    }
    return expiredCount
  },

  async purchases(userId: string) {
    const rows = await prisma.order.findMany({
      where: { buyerId: userId },
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
    })
    return rows.map(toPurchase)
  },

  async sales(userId: string) {
    const rows = await prisma.order.findMany({
      // Reservations that fell through are noise for the seller.
      where: { sellerId: userId, status: { in: ['PENDING_PAYMENT', 'PAID'] } },
      include: orderInclude,
      orderBy: { createdAt: 'desc' },
    })
    return rows.map(toSale)
  },

  async salesSummary(userId: string) {
    const rows = await prisma.order.findMany({
      where: { sellerId: userId, status: 'PAID' },
      select: { price: true, currency: true, paidAt: true, createdAt: true },
    })
    return summarizeSales(
      rows.map((row) => ({ price: row.price.toNumber(), currency: row.currency, paidAt: row.paidAt ?? row.createdAt })),
    )
  },
}

/** Starts the background job that releases unpaid reservations. Returns a function that stops it. */
export function startReservationSweeper(intervalMs = 15_000) {
  const timer = setInterval(() => {
    orderService
      .expireOverdue()
      .then((count) => {
        if (count > 0) logger.info({ count }, 'Released unpaid reservations')
      })
      .catch((err: unknown) => logger.error({ err }, 'Failed to release unpaid reservations'))
  }, intervalMs)
  timer.unref()
  return () => clearInterval(timer)
}
