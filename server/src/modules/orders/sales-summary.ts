export interface SaleRecord {
  price: number
  currency: string
  paidAt: Date
}

export interface SalesSummary {
  /** One entry per currency: amounts in different currencies are never added up. */
  totals: { currency: string; revenue: number; count: number }[]
  /** The last `months` calendar months, oldest first, including months without sales. */
  monthly: { month: string; revenue: number; count: number }[]
  /** Currency the monthly figures are in: the one with the most sales. */
  monthlyCurrency: string | null
  averageOrderValue: number | null
}

const round = (value: number) => Math.round(value * 100) / 100
const monthKey = (date: Date) => `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`

export function summarizeSales(sales: SaleRecord[], now = new Date(), months = 6): SalesSummary {
  const byCurrency = new Map<string, { revenue: number; count: number }>()
  for (const sale of sales) {
    const entry = byCurrency.get(sale.currency) ?? { revenue: 0, count: 0 }
    entry.revenue += sale.price
    entry.count += 1
    byCurrency.set(sale.currency, entry)
  }
  const totals = [...byCurrency]
    .map(([currency, entry]) => ({ currency, revenue: round(entry.revenue), count: entry.count }))
    .sort((a, b) => b.count - a.count || a.currency.localeCompare(b.currency))

  const main = totals[0] ?? null
  const monthly = Array.from({ length: months }, (_, index) => {
    const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - (months - 1 - index), 1))
    return { month: monthKey(date), revenue: 0, count: 0 }
  })
  const byMonth = new Map(monthly.map((entry) => [entry.month, entry]))
  for (const sale of sales) {
    if (sale.currency !== main?.currency) continue
    const entry = byMonth.get(monthKey(sale.paidAt))
    if (!entry) continue
    entry.revenue = round(entry.revenue + sale.price)
    entry.count += 1
  }

  return {
    totals,
    monthly,
    monthlyCurrency: main?.currency ?? null,
    averageOrderValue: main ? round(main.revenue / main.count) : null,
  }
}
