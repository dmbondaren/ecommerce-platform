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
})

export type ListingInput = z.infer<typeof listingInputSchema>

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
  sort: z.enum(LISTING_SORTS).default('newest'),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(48).default(24),
})

export type ListingQuery = z.infer<typeof listingQuerySchema>
