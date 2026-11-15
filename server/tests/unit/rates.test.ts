import { describe, expect, it } from 'vitest'
import { convert, pickRates } from '../../src/modules/rates/rates.service'

const rates = { CHF: 1, EUR: 1.1, USD: 1.25, UAH: 50 }

describe('convert', () => {
  it('goes through the base currency', () => {
    expect(convert(100, 'CHF', 'UAH', rates)).toBe(5000)
    expect(convert(5000, 'UAH', 'CHF', rates)).toBe(100)
    expect(convert(110, 'EUR', 'USD', rates)).toBe(125)
  })

  it('leaves an amount in its own currency untouched', () => {
    expect(convert(19.99, 'EUR', 'EUR', rates)).toBe(19.99)
  })

  it('rounds to cents', () => {
    expect(convert(10, 'USD', 'EUR', rates)).toBe(8.8)
    expect(convert(1, 'UAH', 'CHF', rates)).toBe(0.02)
  })
})

describe('pickRates', () => {
  it('keeps the supported currencies only', () => {
    expect(pickRates({ ...rates, JPY: 180, GBP: 0.9 })).toEqual(rates)
  })

  it('rejects incomplete or nonsensical tables', () => {
    expect(pickRates({ CHF: 1, EUR: 1.1, USD: 1.25 })).toBeNull()
    expect(pickRates({ ...rates, UAH: 0 })).toBeNull()
    expect(pickRates({ ...rates, EUR: '1.1' })).toBeNull()
    expect(pickRates(null)).toBeNull()
  })
})
