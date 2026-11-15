import { SUPPORTED_CURRENCIES, type Currency } from '../../lib/constants'
import { logger } from '../../lib/logger'

export type Rates = Record<Currency, number>

/** Rounded values, only used until the first successful download or while the provider is down. */
const FALLBACK: Rates = { CHF: 1, EUR: 1.07, USD: 1.25, UAH: 52 }
const SOURCE_URL = 'https://open.er-api.com/v6/latest/CHF'
/** The provider updates once a day; asking more often only risks its rate limit. */
const FRESH_MS = 12 * 60 * 60 * 1000
const RETRY_MS = 10 * 60 * 1000

interface Snapshot {
  rates: Rates
  /** `false` when the rates are the built-in approximations. */
  live: boolean
  updatedAt: Date
  checkedAt: number
}

let snapshot: Snapshot | null = null
let pending: Promise<Snapshot> | null = null

/** Picks the supported currencies out of a provider answer; `null` when one is missing or not a positive number. */
export function pickRates(input: unknown): Rates | null {
  if (typeof input !== 'object' || input === null) return null
  const source = input as Record<string, unknown>
  const rates = {} as Rates
  for (const currency of SUPPORTED_CURRENCIES) {
    const value = source[currency]
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null
    rates[currency] = value
  }
  return rates
}

/** Converts between two currencies of a table that is quoted against one base. */
export function convert(amount: number, from: Currency, to: Currency, rates: Rates): number {
  if (from === to) return amount
  return Math.round((amount / rates[from]) * rates[to] * 100) / 100
}

async function download(): Promise<Snapshot> {
  try {
    const response = await fetch(SOURCE_URL, { signal: AbortSignal.timeout(5000) })
    const body = (await response.json()) as { result?: string; rates?: unknown }
    const rates = response.ok && body.result === 'success' ? pickRates(body.rates) : null
    if (!rates) throw new Error(`Unexpected answer from the exchange rate provider (${response.status})`)
    return { rates, live: true, updatedAt: new Date(), checkedAt: Date.now() }
  } catch (err) {
    logger.warn({ err }, 'Could not download exchange rates')
    // Keep the last good table if there is one; otherwise fall back to the approximations.
    return snapshot?.live
      ? { ...snapshot, checkedAt: Date.now() - FRESH_MS + RETRY_MS }
      : { rates: FALLBACK, live: false, updatedAt: new Date(), checkedAt: Date.now() - FRESH_MS + RETRY_MS }
  }
}

export const rateService = {
  /** Exchange rates per 1 CHF, cached in memory. Never throws: prices must render even when the provider is down. */
  async current() {
    if (!snapshot || Date.now() - snapshot.checkedAt > FRESH_MS) {
      // Concurrent callers share one download.
      pending ??= download().finally(() => {
        pending = null
      })
      snapshot = await pending
    }
    return { base: 'CHF' as const, rates: snapshot.rates, live: snapshot.live, updatedAt: snapshot.updatedAt }
  },
}
