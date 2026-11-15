import { describe, expect, it } from 'vitest'
import { convertPrice } from './currency'

const rates = { CHF: 1, EUR: 1.1, USD: 1.25, UAH: 50 }

describe('convertPrice', () => {
  it('converts through the base currency and rounds to cents', () => {
    expect(convertPrice(100, 'CHF', 'UAH', rates)).toBe(5000)
    expect(convertPrice(110, 'EUR', 'USD', rates)).toBe(125)
    expect(convertPrice(10, 'USD', 'EUR', rates)).toBe(8.8)
  })

  it('keeps an amount that is already in the target currency', () => {
    expect(convertPrice(19.99, 'EUR', 'EUR', rates)).toBe(19.99)
  })

  it('reports a missing rate instead of inventing a number', () => {
    expect(convertPrice(10, 'GBP', 'CHF', rates)).toBeNull()
    expect(convertPrice(10, 'CHF', 'GBP', rates)).toBeNull()
  })
})
