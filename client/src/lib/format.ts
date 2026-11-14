const LOCALE = 'en-CH'

export function formatPrice(price: number, currency: string): string {
  if (price === 0) return 'Free'
  return new Intl.NumberFormat(LOCALE, {
    style: 'currency',
    currency,
    minimumFractionDigits: Number.isInteger(price) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(price)
}

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(iso))

export const formatTime = (iso: string) =>
  new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' }).format(new Date(iso))

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 3600],
  ['month', 30 * 24 * 3600],
  ['week', 7 * 24 * 3600],
  ['day', 24 * 3600],
  ['hour', 3600],
  ['minute', 60],
]

/** "3 hours ago", "yesterday", "just now". */
export function timeAgo(iso: string, now = new Date()): string {
  const seconds = Math.round((now.getTime() - new Date(iso).getTime()) / 1000)
  if (seconds < 60) return 'just now'
  const formatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  for (const [unit, size] of UNITS) {
    if (seconds >= size) return formatter.format(-Math.floor(seconds / size), unit)
  }
  return 'just now'
}

/** Whether two timestamps fall on the same calendar day in the user's time zone. */
export const isSameDay = (a: string, b: string) => new Date(a).toDateString() === new Date(b).toDateString()

export const STATUS_LABELS: Record<string, string> = {
  ACTIVE: 'Active',
  PENDING_REVIEW: 'In review',
  DEACTIVATED: 'Taken down',
  RESERVED: 'Reserved',
  SOLD: 'Sold',
  ARCHIVED: 'Archived',
}

export const ORDER_STATUS_LABELS: Record<string, string> = {
  PENDING_PAYMENT: 'Awaiting payment',
  PAID: 'Paid',
  CANCELLED: 'Cancelled',
  EXPIRED: 'Expired',
}

/** "14:05" for a countdown; never negative. */
export function formatCountdown(milliseconds: number): string {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000))
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** "2026-11" -> "Nov". */
export const formatMonth = (month: string) =>
  new Intl.DateTimeFormat(LOCALE, { month: 'short', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))

/** Page numbers to show around the current page; `null` stands for a gap. */
export function pageWindow(current: number, total: number, radius = 1): (number | null)[] {
  const pages: (number | null)[] = []
  for (let page = 1; page <= total; page += 1) {
    const near = Math.abs(page - current) <= radius
    if (page === 1 || page === total || near) pages.push(page)
    else if (pages[pages.length - 1] !== null) pages.push(null)
  }
  return pages
}
