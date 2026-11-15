import { describe, expect, it } from 'vitest'
import { mainCurrency, topSlices } from './ProfileCharts'

const deal = (currency: string) => ({
  id: 'o1',
  listingId: null,
  description: '',
  imageUrls: [],
  title: 'x',
  price: 1,
  currency,
  category: 'c',
  date: '2026-01-01',
})

describe('topSlices', () => {
  const counts = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((name, index) => ({ name, count: 8 - index }))

  it('keeps short lists as they are', () => {
    expect(topSlices(counts.slice(0, 6))).toHaveLength(6)
  })

  it('folds the tail into "Other"', () => {
    const slices = topSlices(counts)
    expect(slices).toHaveLength(6)
    expect(slices[5]).toEqual({ name: 'Other', count: 3 + 2 + 1 })
  })
})

describe('mainCurrency', () => {
  it('picks the most frequent currency', () => {
    expect(mainCurrency([deal('EUR'), deal('CHF'), deal('CHF')])).toBe('CHF')
    expect(mainCurrency([])).toBeNull()
  })
})
