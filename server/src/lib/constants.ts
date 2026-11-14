export const SUPPORTED_CURRENCIES = ['CHF', 'EUR', 'USD', 'UAH'] as const
export type Currency = (typeof SUPPORTED_CURRENCIES)[number]

/** Files are only ever referenced by the path the upload endpoint returned. */
export const UPLOAD_URL_PATTERN = /^\/uploads\/[A-Za-z0-9._-]+$/

export const DEFAULT_CATEGORIES = [
  { slug: 'electronics', name: 'Electronics' },
  { slug: 'home-garden', name: 'Home & Garden' },
  { slug: 'fashion', name: 'Fashion' },
  { slug: 'vehicles', name: 'Vehicles' },
  { slug: 'sports-hobbies', name: 'Sports & Hobbies' },
  { slug: 'services', name: 'Services' },
  { slug: 'jobs', name: 'Jobs' },
  { slug: 'other', name: 'Other' },
] as const
