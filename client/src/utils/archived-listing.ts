import { IListing } from '../models/IListing'

export function createArchivedListing(item: any, id?: string | null): IListing {
  const imageUrl = item.imageUrl || item.listing_image_url || ''
  return {
    _id: String(id || item.listingId || ''),
    title: item.title || item.listing_title || 'Оголошення з архіву',
    description: item.description || 'Архівна картка збережена після угоди.',
    price: Number(item.price || item.listing_price || 0),
    currency: item.currency || 'UAH',
    imageUrl,
    imageUrls: [imageUrl].filter(Boolean),
    category: item.category || '',
    createdAt: item.soldAt || item.purchasedAt || item.created_at || new Date().toISOString(),
    status: 'sold',
    moderationReason: 'Архівна картка після покупки/продажу'
  }
}
