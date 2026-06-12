import { getCategoryTotal, getPositiveCategoryEntries, getTimelinePoint } from '../utils/profile-stats'

describe('profile statistics helpers', () => {
  it('filters empty category values before rendering pie charts', () => {
    expect(getPositiveCategoryEntries({ Техніка: 2, Робота: 0, Доставка: 1 })).toEqual([
      ['Техніка', 2],
      ['Доставка', 1]
    ])
  })

  it('keeps the pie chart denominator safe when there are no categories', () => {
    expect(getCategoryTotal({})).toBe(1)
    expect(getCategoryTotal({ Техніка: 2, Робота: 3 })).toBe(5)
  })

  it('calculates stable timeline coordinates for price and date', () => {
    const point = getTimelinePoint(
      { price: 50, date: '2026-05-15T12:00:00.000Z' },
      {
        minPrice: 0,
        maxPrice: 100,
        minDate: new Date('2026-05-15T00:00:00.000Z').getTime(),
        maxDate: new Date('2026-05-16T00:00:00.000Z').getTime()
      }
    )

    expect(point.x).toBeCloseTo(159)
    expect(point.y).toBeCloseTo(110)
  })
})
