import type { Prisma, VoteType } from '@prisma/client'
import { z } from 'zod'
import { conflict, forbidden, notFound } from '../../lib/errors'
import { prisma } from '../../lib/prisma'
import { notificationService } from '../notifications/notifications.service'
import { publicUserSelect, toPublicUser } from '../users/user.dto'

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullish()
    .transform((value) => value || null)

export const reviewInputSchema = z.object({
  rating: z.coerce.number().int().min(1).max(5),
  comment: optionalText(2000),
  pros: optionalText(500),
  cons: optionalText(500),
})
export type ReviewInput = z.infer<typeof reviewInputSchema>

export const voteSchema = z.object({ type: z.enum(['LIKE', 'DISLIKE']).nullable() })
export const replySchema = z.object({ body: z.string().trim().min(1).max(1000) })

const reviewInclude = {
  author: { select: publicUserSelect },
  order: { select: { titleSnapshot: true, imageUrlsSnapshot: true, price: true, currency: true } },
  votes: { select: { userId: true, type: true } },
  replies: { orderBy: { createdAt: 'asc' }, include: { user: { select: publicUserSelect } } },
} satisfies Prisma.ReviewInclude

type ReviewRow = Prisma.ReviewGetPayload<{ include: typeof reviewInclude }>

const countVotes = (votes: { userId: string; type: VoteType }[], viewerId?: string) => ({
  likes: votes.filter((vote) => vote.type === 'LIKE').length,
  dislikes: votes.filter((vote) => vote.type === 'DISLIKE').length,
  myVote: votes.find((vote) => vote.userId === viewerId)?.type ?? null,
})

const toReview = (review: ReviewRow, viewerId?: string) => ({
  id: review.id,
  rating: review.rating,
  comment: review.comment,
  pros: review.pros,
  cons: review.cons,
  author: toPublicUser(review.author),
  item: {
    title: review.order.titleSnapshot,
    imageUrl: review.order.imageUrlsSnapshot[0] ?? null,
    price: review.order.price.toNumber(),
    currency: review.order.currency,
  },
  ...countVotes(review.votes, viewerId),
  replies: review.replies.map((reply) => ({
    id: reply.id,
    body: reply.body,
    author: toPublicUser(reply.user),
    createdAt: reply.createdAt,
  })),
  createdAt: review.createdAt,
})

export const reviewService = {
  /** A review belongs to an order, so only a real buyer can write one, and only once. */
  async create(authorId: string, orderId: string, input: ReviewInput) {
    const order = await prisma.order.findUnique({ where: { id: orderId }, include: { review: { select: { id: true } } } })
    if (!order || order.buyerId !== authorId) throw notFound('Order')
    if (!order.sellerId) throw conflict('The seller of this item no longer has an account')
    if (order.review) throw conflict('You have already reviewed this purchase')

    const review = await prisma.review.create({
      data: { ...input, orderId, authorId, sellerId: order.sellerId },
      include: reviewInclude,
    })
    notificationService.notifyInBackground(
      order.sellerId,
      `You received a ${review.rating}-star review for "${order.titleSnapshot}"`,
      `/users/${order.sellerId}`,
    )
    return toReview(review, authorId)
  },

  async forSeller(sellerId: string, viewerId?: string) {
    const rows = await prisma.review.findMany({
      where: { sellerId },
      include: reviewInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return rows.map((row) => toReview(row, viewerId))
  },

  /** Voting the same way twice, or sending `null`, withdraws the vote. */
  async vote(userId: string, reviewId: string, type: VoteType | null) {
    const review = await prisma.review.findUnique({ where: { id: reviewId }, select: { authorId: true } })
    if (!review) throw notFound('Review')
    if (review.authorId === userId) throw forbidden('You cannot vote on your own review')

    const key = { reviewId_userId: { reviewId, userId } }
    const previous = await prisma.reviewVote.findUnique({ where: key })
    if (type === null || previous?.type === type) {
      await prisma.reviewVote.deleteMany({ where: { reviewId, userId } })
    } else {
      await prisma.reviewVote.upsert({ where: key, create: { reviewId, userId, type }, update: { type } })
    }
    const votes = await prisma.reviewVote.findMany({ where: { reviewId }, select: { userId: true, type: true } })
    return countVotes(votes, userId)
  },

  /** Only the two people the review is about can discuss it. */
  async reply(userId: string, reviewId: string, body: string) {
    const review = await prisma.review.findUnique({ where: { id: reviewId } })
    if (!review) throw notFound('Review')
    if (userId !== review.sellerId && userId !== review.authorId) {
      throw forbidden('Only the seller and the author can reply to this review')
    }
    const reply = await prisma.reviewReply.create({
      data: { reviewId, userId, body },
      include: { user: { select: publicUserSelect } },
    })
    const other = userId === review.sellerId ? review.authorId : review.sellerId
    notificationService.notifyInBackground(other, 'New reply to a review', `/users/${review.sellerId}`)
    return { id: reply.id, body: reply.body, author: toPublicUser(reply.user), createdAt: reply.createdAt }
  },
}
