import { useQuery } from '@tanstack/react-query'
import { useSyncExternalStore } from 'react'
import { api } from '../api/client'
import { formatPrice } from '../lib/format'

export const CURRENCIES = ['CHF', 'EUR', 'USD', 'UAH'] as const
type Rates = Record<string, number>

const STORAGE_KEY = 'displayCurrency'
const listeners = new Set<() => void>()

function read(): string {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY) ?? ''
    return (CURRENCIES as readonly string[]).includes(saved) ? saved : ''
  } catch {
    return ''
  }
}

// '' means "as listed": every price in the currency its seller chose.
let displayCurrency = typeof window === 'undefined' ? '' : read()

export function setDisplayCurrency(currency: string) {
  displayCurrency = currency
  try {
    window.localStorage.setItem(STORAGE_KEY, currency)
  } catch {
    // The choice still applies for this visit.
  }
  for (const listener of listeners) listener()
}

export const useDisplayCurrency = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => displayCurrency,
  )

/** Converts through the base currency of the table; `null` when a rate is missing. */
export function convertPrice(amount: number, from: string, to: string, rates: Rates): number | null {
  if (from === to) return amount
  const fromRate = rates[from]
  const toRate = rates[to]
  if (!fromRate || !toRate) return null
  return Math.round((amount / fromRate) * toRate * 100) / 100
}

export interface ShownPrice {
  /** What to display, e.g. "≈ EUR 93" or "CHF 100". */
  text: string
  /** The price as listed, when `text` is a conversion. */
  original: string | null
}

/**
 * Formats prices in the currency the visitor picked. Without a choice, or
 * until the rates have loaded, prices are shown exactly as listed.
 */
export function usePrices() {
  const target = useDisplayCurrency()
  const rates = useQuery({
    queryKey: ['rates'],
    queryFn: () => api<{ rates: Rates; live: boolean }>('/rates'),
    enabled: target !== '',
    staleTime: 60 * 60 * 1000,
  })
  const show = (price: number, currency: string): ShownPrice => {
    const original = formatPrice(price, currency)
    if (!target || target === currency || price === 0 || !rates.data) return { text: original, original: null }
    const converted = convertPrice(price, currency, target, rates.data.rates)
    return converted === null ? { text: original, original: null } : { text: `≈ ${formatPrice(converted, target)}`, original }
  }
  return { show, target, converting: target !== '' && Boolean(rates.data), live: rates.data?.live ?? true }
}
