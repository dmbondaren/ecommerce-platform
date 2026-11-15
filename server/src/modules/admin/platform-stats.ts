export interface PaidOrder {
  price: number
  currency: string
  category: string
  paidAt: Date
  sellerId: string | null
  buyerId: string | null
}

export interface PlatformInput {
  paidOrders: PaidOrder[]
  /** Creation times of accounts and listings inside the charted period. */
  newUsers: Date[]
  newListings: Date[]
}

const round = (value: number) => Math.round(value * 100) / 100
const dayKey = (date: Date) => date.toISOString().slice(0, 10)

/** Adds `amount` to the entry of `key`, creating it on first use. */
function tally(map: Map<string, { count: number; revenue: number }>, key: string, amount: number) {
  const entry = map.get(key) ?? { count: 0, revenue: 0 }
  entry.count += 1
  entry.revenue += amount
  map.set(key, entry)
}

const ranked = (map: Map<string, { count: number; revenue: number }>) =>
  [...map]
    .map(([key, entry]) => ({ key, count: entry.count, revenue: round(entry.revenue) }))
    .sort((a, b) => b.count - a.count || b.revenue - a.revenue || a.key.localeCompare(b.key))

/**
 * Turns raw rows into the figures of the admin statistics page. Money is
 * never added across currencies: totals are listed per currency, and charts
 * and rankings use the currency with the most sales.
 */
export function buildPlatformStats(input: PlatformInput, now = new Date(), days = 30) {
  const byCurrency = new Map<string, { count: number; revenue: number }>()
  for (const order of input.paidOrders) tally(byCurrency, order.currency, order.price)
  const revenue = ranked(byCurrency).map(({ key, count, revenue: amount }) => ({ currency: key, count, amount }))
  const mainCurrency = revenue[0]?.currency ?? null

  const daily = Array.from({ length: days }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1 - index)))
    return { date: dayKey(date), orders: 0, revenue: 0, users: 0, listings: 0 }
  })
  const byDay = new Map(daily.map((entry) => [entry.date, entry]))
  for (const order of input.paidOrders) {
    const entry = byDay.get(dayKey(order.paidAt))
    if (!entry) continue
    entry.orders += 1
    if (order.currency === mainCurrency) entry.revenue = round(entry.revenue + order.price)
  }
  for (const date of input.newUsers) {
    const entry = byDay.get(dayKey(date))
    if (entry) entry.users += 1
  }
  for (const date of input.newListings) {
    const entry = byDay.get(dayKey(date))
    if (entry) entry.listings += 1
  }

  const categories = new Map<string, { count: number; revenue: number }>()
  const sellers = new Map<string, { count: number; revenue: number }>()
  const buyers = new Map<string, { count: number; revenue: number }>()
  for (const order of input.paidOrders) {
    const amount = order.currency === mainCurrency ? order.price : 0
    tally(categories, order.category, amount)
    if (order.sellerId) tally(sellers, order.sellerId, amount)
    if (order.buyerId) tally(buyers, order.buyerId, amount)
  }

  return {
    mainCurrency,
    revenue,
    daily,
    categories: ranked(categories).map(({ key, count, revenue: amount }) => ({ name: key, count, revenue: amount })),
    topSellers: ranked(sellers).slice(0, 10),
    topBuyers: ranked(buyers).slice(0, 10),
  }
}
