import { describe, expect, it } from 'vitest'
import { formatPrice, isSameDay, pageWindow, timeAgo } from './format'

describe('formatPrice', () => {
  it('drops the decimals of whole amounts and keeps real ones', () => {
    expect(formatPrice(890, 'CHF')).toMatch(/890$/)
    expect(formatPrice(19.5, 'CHF')).toMatch(/19\.50$/)
  })

  it('names a zero price', () => {
    expect(formatPrice(0, 'CHF')).toBe('Free')
  })
})

describe('timeAgo', () => {
  const now = new Date('2026-06-10T12:00:00Z')

  it('uses the largest fitting unit', () => {
    expect(timeAgo('2026-06-10T11:59:40Z', now)).toBe('just now')
    expect(timeAgo('2026-06-10T11:15:00Z', now)).toBe('45 minutes ago')
    expect(timeAgo('2026-06-10T09:00:00Z', now)).toBe('3 hours ago')
    expect(timeAgo('2026-06-09T12:00:00Z', now)).toBe('yesterday')
    expect(timeAgo('2026-05-01T12:00:00Z', now)).toBe('last month')
  })

  it('does not report future dates as negative time', () => {
    expect(timeAgo('2026-06-10T12:05:00Z', now)).toBe('just now')
  })
})

describe('pageWindow', () => {
  it('lists every page when there are few', () => {
    expect(pageWindow(2, 4)).toEqual([1, 2, 3, 4])
  })

  it('collapses distant pages into gaps', () => {
    expect(pageWindow(1, 10)).toEqual([1, 2, null, 10])
    expect(pageWindow(5, 10)).toEqual([1, null, 4, 5, 6, null, 10])
    expect(pageWindow(10, 10)).toEqual([1, null, 9, 10])
  })
})

describe('isSameDay', () => {
  it('compares calendar days, not 24-hour distance', () => {
    expect(isSameDay('2026-06-10T10:00:00', '2026-06-10T22:00:00')).toBe(true)
    expect(isSameDay('2026-06-10T22:00:00', '2026-06-11T02:00:00')).toBe(false)
  })
})
