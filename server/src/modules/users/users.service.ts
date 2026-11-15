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
  homeAddress: z.string().trim().max(160).nullable().optional(),
  homeCoordinates: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .nullable()
    .optional(),
})

export type AccountPatch = z.infer<typeof accountPatchSchema>

const dealSelect = {
  titleSnapshot: true,
  price: true,
  currency: true,
  categorySnapshot: true,
  paidAt: true,
  createdAt: true,
} as const

interface DealRow {
  titleSnapshot: string
  price: { toNumber(): number }
  currency: string
  categorySnapshot: string
  paidAt: Date | null
  createdAt: Date
}

const toDeal = (order: DealRow) => ({
  title: order.titleSnapshot,
  price: order.price.toNumber(),
  currency: order.currency,
  category: order.categorySnapshot,
  date: order.paidAt ?? order.createdAt,
})

/** [{ name, count }] by descending count; ties in alphabetical order so the result is stable. */
export function countByName(names: string[]): { name: string; count: number }[] {
  const counts = new Map<string, number>()
  for (const name of names) counts.set(name, (counts.get(name) ?? 0) + 1)
  return [...counts]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

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
    const { homeCoordinates, homeAddress, ...fields } = patch
    return toAccount(
      await prisma.user.update({
        where: { id: userId },
        data: {
          ...fields,
          homeAddress: homeAddress === undefined ? undefined : homeAddress || null,
          // `undefined` leaves the position alone, `null` removes it.
          ...(homeCoordinates === undefined
            ? {}
            : { homeLatitude: homeCoordinates?.lat ?? null, homeLongitude: homeCoordinates?.lng ?? null }),
        },
      }),
    )
  },

  /** Completed deals and category breakdowns for the charts on a public profile. */
  async activity(id: string) {
    const user = await prisma.user.findUnique({ where: { id }, select: { id: true } })
    if (!user) throw notFound('User')
    const recent = { select: dealSelect, orderBy: { createdAt: 'desc' as const }, take: 50 }
    const [sales, purchases, listings] = await Promise.all([
      prisma.order.findMany({ where: { sellerId: id, status: 'PAID' }, ...recent }),
      prisma.order.findMany({ where: { buyerId: id, status: 'PAID' }, ...recent }),
      prisma.listing.findMany({
        where: { ownerId: id, status: { in: ['ACTIVE', 'RESERVED', 'SOLD'] } },
        select: { category: { select: { name: true } } },
      }),
    ])
    return {
      // Oldest first, the order a chart is read in.
      sales: sales.map(toDeal).reverse(),
      purchases: purchases.map(toDeal).reverse(),
      listingCategories: countByName(listings.map((listing) => listing.category.name)),
      saleCategories: countByName(sales.map((order) => order.categorySnapshot)),
      purchaseCategories: countByName(purchases.map((order) => order.categorySnapshot)),
    }
  },

  /** `signedIn` visitors also get the phone number, as they do on the user's listings. */
  async publicProfile(id: string, signedIn = false) {
    const user = await prisma.user.findUnique({ where: { id }, select: { ...publicUserSelect, phone: true } })
    if (!user) throw notFound('User')
    const [reviews, activeListings, sales, places] = await Promise.all([
      prisma.review.aggregate({ where: { sellerId: id }, _avg: { rating: true }, _count: { _all: true } }),
      prisma.listing.count({ where: { ownerId: id, status: { in: ['ACTIVE', 'RESERVED'] } } }),
      prisma.order.count({ where: { sellerId: id, status: 'PAID' } }),
      prisma.listing.findMany({
        where: { ownerId: id, status: { in: ['ACTIVE', 'RESERVED', 'SOLD'] }, location: { not: null } },
        select: { location: true },
        take: 200,
      }),
    ])
    // The home address is private; the area shown is where the user's listings are.
    const area = countByName(places.flatMap((place) => (place.location ? [place.location] : [])))[0]?.name ?? null
    return {
      ...toPublicUser(user),
      phone: signedIn ? user.phone : null,
      area,
      stats: {
        rating: reviews._avg.rating,
        reviewCount: reviews._count._all,
        activeListings,
        sales,
      },
    }
  },
}
