import { describe, expect, it } from 'vitest'
import { buildPlatformStats, type PaidOrder } from '../../src/modules/admin/platform-stats'

const now = new Date('2026-11-15T12:00:00Z')
const order = (price: number, currency: string, category: string, day: string, sellerId: string, buyerId: string): PaidOrder => ({
  price,
  currency,
  category,
  paidAt: new Date(`${day}T10:00:00Z`),
  sellerId,
  buyerId,
})

describe('buildPlatformStats', () => {
  const stats = buildPlatformStats(
    {
      paidOrders: [
        order(100, 'CHF', 'Electronics', '2026-11-15', 'anna', 'luca'),
        order(50.5, 'CHF', 'Electronics', '2026-11-14', 'anna', 'mia'),
        order(20, 'CHF', 'Fashion', '2026-11-14', 'luca', 'mia'),
        order(999, 'EUR', 'Vehicles', '2026-11-14', 'mia', 'anna'),
        order(5, 'CHF', 'Fashion', '2026-01-01', 'luca', 'anna'),
      ],
      newUsers: [new Date('2026-11-15T01:00:00Z'), new Date('2026-11-15T23:00:00Z')],
      newListings: [new Date('2026-10-17T00:00:00Z'), new Date('2026-10-16T23:59:59Z')],
    },
    now,
  )

  it('lists revenue per currency and picks the most used one', () => {
    expect(stats.revenue).toEqual([
      { currency: 'CHF', count: 4, amount: 175.5 },
      { currency: 'EUR', count: 1, amount: 999 },
    ])
    expect(stats.mainCurrency).toBe('CHF')
  })

  it('charts the last 30 days, including empty ones', () => {
    expect(stats.daily).toHaveLength(30)
    expect(stats.daily[0]?.date).toBe('2026-10-17')
    expect(stats.daily.at(-1)).toEqual({ date: '2026-11-15', orders: 1, revenue: 100, users: 2, listings: 0 })
    // Orders in other currencies are counted, but their amounts stay out of the revenue line.
    expect(stats.daily.at(-2)).toMatchObject({ orders: 3, revenue: 70.5 })
    // The first charted day is included, the day before it is not.
    expect(stats.daily[0]?.listings).toBe(1)
  })

  it('ranks categories, sellers and buyers by number of deals', () => {
    expect(stats.categories).toEqual([
      { name: 'Electronics', count: 2, revenue: 150.5 },
      { name: 'Fashion', count: 2, revenue: 25 },
      { name: 'Vehicles', count: 1, revenue: 0 },
    ])
    expect(stats.topSellers[0]).toEqual({ key: 'anna', count: 2, revenue: 150.5 })
    expect(stats.topBuyers.map((buyer) => buyer.key)).toEqual(['mia', 'anna', 'luca'])
  })

  it('copes with an empty marketplace', () => {
    const empty = buildPlatformStats({ paidOrders: [], newUsers: [], newListings: [] }, now)
    expect(empty.mainCurrency).toBeNull()
    expect(empty.revenue).toEqual([])
    expect(empty.daily.every((day) => day.orders === 0)).toBe(true)
  })
})
