import { z } from 'zod'
import { SUPPORTED_CURRENCIES } from '../../lib/constants'
import { conflict, notFound } from '../../lib/errors'
import { prisma } from '../../lib/prisma'
import { phoneSchema, uploadUrlSchema } from '../listings/listing.schemas'
import { publicUserSelect, toAccount, toPublicUser } from './user.dto'

export const accountPatchSchema = z.object({
  nickname: z
    .string()
    .trim()
    .regex(/^[A-Za-z0-9_.-]{3,24}$/, 'Use 3-24 letters, digits, dots, dashes or underscores')
    .optional(),
  phone: phoneSchema.nullable().optional(),
  preferredCurrency: z.enum(SUPPORTED_CURRENCIES).optional(),
  avatarUrl: uploadUrlSchema.nullable().optional(),
})

export type AccountPatch = z.infer<typeof accountPatchSchema>

export const userService = {
  async account(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) throw notFound('User')
    return toAccount(user)
  },

  async updateAccount(userId: string, patch: AccountPatch) {
    if (patch.nickname) {
      // "Anna" and "anna" would be indistinguishable in a chat, so the check ignores case.
      const taken = await prisma.user.findFirst({
        where: { nickname: { equals: patch.nickname, mode: 'insensitive' }, id: { not: userId } },
        select: { id: true },
      })
      if (taken) throw conflict('This nickname is already taken')
    }
    return toAccount(await prisma.user.update({ where: { id: userId }, data: patch }))
  },

  async publicProfile(id: string) {
    const user = await prisma.user.findUnique({ where: { id }, select: publicUserSelect })
    if (!user) throw notFound('User')
    const [reviews, activeListings, sales] = await Promise.all([
      prisma.review.aggregate({ where: { sellerId: id }, _avg: { rating: true }, _count: { _all: true } }),
      prisma.listing.count({ where: { ownerId: id, status: 'ACTIVE' } }),
      prisma.order.count({ where: { sellerId: id } }),
    ])
    return {
      ...toPublicUser(user),
      stats: {
        rating: reviews._avg.rating,
        reviewCount: reviews._count._all,
        activeListings,
        sales,
      },
    }
  },
}
