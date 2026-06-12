import { createArchivedListing } from '../utils/archived-listing'

describe('archived listing fallback', () => {
  it('creates a full sold listing from a sales timeline snapshot', () => {
    const listing = createArchivedListing({
      listingId: '42',
      title: 'Проданий ноутбук',
      description: 'Архівний опис',
      price: 15000,
      currency: 'UAH',
      imageUrl: '/uploads/notebook.jpg',
      category: 'Техніка',
      soldAt: '2026-05-15T10:00:00.000Z'
    })

    expect(listing._id).toBe('42')
    expect(listing.title).toBe('Проданий ноутбук')
    expect(listing.status).toBe('sold')
    expect(listing.imageUrls).toEqual(['/uploads/notebook.jpg'])
  })

  it('supports review snapshot field names when the original listing no longer exists', () => {
    const listing = createArchivedListing({
      listing_title: 'Товар з відгуку',
      listing_image_url: '/uploads/review.jpg',
      listing_price: 5,
      created_at: '2026-05-16T08:00:00.000Z'
    }, '7')

    expect(listing._id).toBe('7')
    expect(listing.price).toBe(5)
    expect(listing.imageUrl).toBe('/uploads/review.jpg')
    expect(listing.currency).toBe('UAH')
  })
})
