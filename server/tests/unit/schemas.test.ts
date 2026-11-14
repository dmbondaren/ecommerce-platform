import { describe, expect, it } from 'vitest'
import { listingInputSchema, listingQuerySchema, phoneSchema } from '../../src/modules/listings/listing.schemas'
import { messageInputSchema } from '../../src/modules/conversations/conversations.service'

const validListing = {
  title: 'Road bike',
  description: 'Aluminium frame, serviced this spring.',
  price: 19.99,
  currency: 'CHF',
  categoryId: 1,
  imageUrls: ['/uploads/3f0c9a52-6f0e-4c58-9a59-0b5f3c1b9a10.jpg'],
}

describe('listingInputSchema', () => {
  it('accepts prices that are not exact in binary floating point', () => {
    expect(listingInputSchema.parse(validListing).price).toBe(19.99)
    expect(listingInputSchema.parse({ ...validListing, price: '0.07' }).price).toBe(0.07)
  })

  it('rejects more than two decimals and negative prices', () => {
    expect(listingInputSchema.safeParse({ ...validListing, price: 1.999 }).success).toBe(false)
    expect(listingInputSchema.safeParse({ ...validListing, price: -1 }).success).toBe(false)
  })

  it('only accepts images that came from the upload endpoint', () => {
    for (const url of ['https://evil.example/x.png', '/uploads/../.env', 'javascript:alert(1)']) {
      expect(listingInputSchema.safeParse({ ...validListing, imageUrls: [url] }).success).toBe(false)
    }
  })

  it('requires a photo and a supported currency', () => {
    expect(listingInputSchema.safeParse({ ...validListing, imageUrls: [] }).success).toBe(false)
    expect(listingInputSchema.safeParse({ ...validListing, currency: 'BTC' }).success).toBe(false)
  })

  it('turns empty optional fields into null', () => {
    const parsed = listingInputSchema.parse({ ...validListing, location: '  ', phone: '' })
    expect(parsed.location).toBeNull()
    expect(parsed.phone).toBeNull()
  })
})

describe('phoneSchema', () => {
  it('normalises formatting', () => {
    expect(phoneSchema.parse('+41 44 123 45 67')).toBe('+41441234567')
    expect(phoneSchema.parse('(044) 123-45-67')).toBe('0441234567')
  })

  it('rejects values that are not phone numbers', () => {
    expect(phoneSchema.safeParse('abc 123').success).toBe(false)
    expect(phoneSchema.safeParse('12').success).toBe(false)
  })
})

describe('listingQuerySchema', () => {
  it('applies defaults and treats empty filters as absent', () => {
    expect(listingQuerySchema.parse({ minPrice: '', maxPrice: '' })).toEqual({
      available: false,
      sort: 'newest',
      page: 1,
      pageSize: 24,
    })
  })

  it('reads the "available only" flag from the query string', () => {
    expect(listingQuerySchema.parse({ available: '1' }).available).toBe(true)
    expect(listingQuerySchema.parse({ available: '0' }).available).toBe(false)
  })

  it('caps the page size', () => {
    expect(listingQuerySchema.safeParse({ pageSize: '500' }).success).toBe(false)
  })
})

describe('messageInputSchema', () => {
  it('needs text or an attachment', () => {
    expect(messageInputSchema.safeParse({ body: '   ' }).success).toBe(false)
    expect(messageInputSchema.safeParse({ body: 'Hello' }).success).toBe(true)
    expect(messageInputSchema.safeParse({ attachmentUrl: '/uploads/a.png' }).success).toBe(true)
  })
})
