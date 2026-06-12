export function getPositiveCategoryEntries(stats: Record<string, number> = {}) {
  return Object.entries(stats).filter(([, count]) => Number(count || 0) > 0)
}

export function getCategoryTotal(stats: Record<string, number> = {}) {
  return Math.max(1, Object.values(stats).reduce((sum, count) => sum + Number(count || 0), 0))
}

export function getTimelinePoint(
  item: { price?: number | string; date: string },
  bounds: { minPrice: number; maxPrice: number; minDate: number; maxDate: number },
  box = { left: 48, bottom: 174, width: 222, height: 128 }
) {
  return {
    x: box.left + ((Number(item.price || 0) - bounds.minPrice) / Math.max(1, bounds.maxPrice - bounds.minPrice)) * box.width,
    y: box.bottom - ((new Date(item.date).getTime() - bounds.minDate) / Math.max(1, bounds.maxDate - bounds.minDate)) * box.height
  }
}

