import type { Prisma } from '@prisma/client'
import { publicUserSelect, toPublicUser } from '../users/user.dto'

export const listingInclude = {
  images: { orderBy: { position: 'asc' } },
  owner: { select: publicUserSelect },
  category: true,
} satisfies Prisma.ListingInclude

export type ListingRow = Prisma.ListingGetPayload<{ include: typeof listingInclude }>

export const toListing = (listing: ListingRow) => ({
  id: listing.id,
  title: listing.title,
  description: listing.description,
  // Prices have two decimals and stay far below 2^53, so a JSON number is exact.
  price: listing.price.toNumber(),
  currency: listing.currency,
  location: listing.location,
  coordinates:
    listing.latitude !== null && listing.longitude !== null
      ? { lat: listing.latitude, lng: listing.longitude }
      : null,
  phone: listing.phone,
  category: { id: listing.category.id, slug: listing.category.slug, name: listing.category.name },
  status: listing.status,
  moderationReason: listing.moderationReason,
  viewCount: listing.viewCount,
  imageUrls: listing.images.map((image) => image.url),
  owner: toPublicUser(listing.owner),
  createdAt: listing.createdAt,
  updatedAt: listing.updatedAt,
})

export type ListingDto = ReturnType<typeof toListing>
