import { z } from 'zod'
import { SUPPORTED_CURRENCIES, UPLOAD_URL_PATTERN } from '../../lib/constants'

export const uploadUrlSchema = z.string().regex(UPLOAD_URL_PATTERN, 'Must be a file returned by the upload endpoint')

/** Keeps a leading "+" and digits only, e.g. "+41 44 123 45 67" -> "+41441234567". */
export const phoneSchema = z
  .string()
  .trim()
  .max(40)
  .transform((value) => value.replace(/(?!^)\+/g, '').replace(/[^\d+]/g, ''))
  .refine((value) => value === '' || /^\+?\d{6,15}$/.test(value), 'Enter a valid phone number')
  .transform((value) => value || null)

const price = z.coerce
  .number()
  .finite()
  .min(0, 'Price cannot be negative')
  .max(9_999_999_999.99)
  // Compared with a tolerance: 19.99 * 100 is 1998.9999999999998 in floating point.
  .refine((value) => Math.abs(Math.round(value * 100) - value * 100) < 1e-6, {
    message: 'Price can have at most two decimals',
  })
  .transform((value) => Math.round(value * 100) / 100)

export const listingInputSchema = z.object({
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(5000),
  price,
  currency: z.enum(SUPPORTED_CURRENCIES),
  categoryId: z.coerce.number().int().positive(),
  location: z.string().trim().max(120).nullish().transform((value) => value || null),
  phone: phoneSchema.nullish().transform((value) => value ?? null),
  imageUrls: z.array(uploadUrlSchema).min(1, 'Add at least one photo').max(10),
  /** Where the buyer should transfer the money, e.g. an IBAN. Never part of the public listing. */
  paymentAccount: z
    .string({ required_error: 'Enter the account buyers should pay to' })
    .trim()
    .min(5, 'Enter the account buyers should pay to')
    .max(64)
    .regex(/^[A-Za-z0-9 +-]*$/, 'Use letters, digits and spaces only'),
  /** Where the item changes hands. Like the payment account, only a buyer who reserved the item sees it. */
  meetingPlace: z
    .string({ required_error: 'Say where the buyer gets the item' })
    .trim()
    .min(3, 'Say where the buyer gets the item')
    .max(200),
  /** Optional pin on the map. */
  coordinates: z
    .object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) })
    .nullish()
    .transform((value) => value ?? null),
})

export type ListingInput = z.infer<typeof listingInputSchema>

/**
 * What a moderator may send when correcting someone else's listing. The two
 * private fields are not shown to moderators, so they are neither required
 * nor changed.
 */
export const staffListingInputSchema = listingInputSchema.omit({ paymentAccount: true, meetingPlace: true })
export type StaffListingInput = z.infer<typeof staffListingInputSchema>

export const LISTING_SORTS = ['newest', 'oldest', 'price_asc', 'price_desc', 'popular'] as const

/** Query strings arrive as text; empty values mean "no filter". */
const optionalNumber = z.preprocess(
  (value) => (value === '' || value === undefined ? undefined : value),
  z.coerce.number().finite().min(0).optional(),
)

export const listingQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.string().trim().max(64).optional(),
  minPrice: optionalNumber,
  maxPrice: optionalNumber,
  currency: z.preprocess((value) => (value === '' ? undefined : value), z.enum(SUPPORTED_CURRENCIES).optional()),
  /** Only listings with a map position at most this far from the signed-in user's home. */
  radiusKm: z.preprocess(
    (value) => (value === '' || value === undefined ? undefined : value),
    z.coerce.number().min(0.1).max(100).optional(),
  ),
  /** `available=1` leaves out listings that are reserved by a buyer. */
  available: z.preprocess((value) => value === '1' || value === 'true', z.boolean()),
  sort: z.enum(LISTING_SORTS).default('newest'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(24),
})

export type ListingQuery = z.infer<typeof listingQuerySchema>
