import { describe, expect, it } from 'vitest'
import { summarizeSales } from '../../src/modules/orders/sales-summary'

const now = new Date('2026-11-14T12:00:00Z')
const sale = (price: number, currency: string, paidAt: string) => ({ price, currency, paidAt: new Date(paidAt) })

describe('summarizeSales', () => {
  it('returns empty months when nothing was sold', () => {
    const summary = summarizeSales([], now)
    expect(summary.totals).toEqual([])
    expect(summary.monthlyCurrency).toBeNull()
    expect(summary.averageOrderValue).toBeNull()
    expect(summary.monthly.map((entry) => entry.month)).toEqual([
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ])
  })

  it('keeps currencies apart and charts the most used one', () => {
    const summary = summarizeSales(
      [
        sale(100, 'CHF', '2026-11-02T10:00:00Z'),
        sale(19.99, 'CHF', '2026-11-03T10:00:00Z'),
        sale(50, 'CHF', '2026-09-20T10:00:00Z'),
        sale(999, 'EUR', '2026-11-05T10:00:00Z'),
        sale(10, 'CHF', '2025-01-01T10:00:00Z'),
      ],
      now,
    )
    expect(summary.totals).toEqual([
      { currency: 'CHF', revenue: 179.99, count: 4 },
      { currency: 'EUR', revenue: 999, count: 1 },
    ])
    expect(summary.monthlyCurrency).toBe('CHF')
    expect(summary.averageOrderValue).toBe(45)
    expect(summary.monthly.at(-1)).toEqual({ month: '2026-11', revenue: 119.99, count: 2 })
    expect(summary.monthly.find((entry) => entry.month === '2026-09')).toEqual({ month: '2026-09', revenue: 50, count: 1 })
  })

  it('spans a year boundary', () => {
    const summary = summarizeSales([], new Date('2026-02-10T00:00:00Z'), 3)
    expect(summary.monthly.map((entry) => entry.month)).toEqual(['2025-12', '2026-01', '2026-02'])
  })
})
