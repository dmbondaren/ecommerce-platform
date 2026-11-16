import type { Session } from './types'
import { t } from '../app/i18n'

const BASE = '/api/v1'

/** An error answer from the API, or a failure to reach it (`status` 0). */
export class ApiError extends Error {
  readonly status: number
  readonly code: string
  /** Per-field validation messages, when the server rejected the input. */
  readonly details?: Record<string, string[]>

  constructor(status: number, code: string, message: string, details?: Record<string, string[]>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export const errorMessage = (error: unknown) =>
  error instanceof Error ? error.message : t('Something went wrong. Please try again.')

// The access token lives in memory only: it is short-lived and a script
// injected into the page could read anything kept in localStorage. The
// long-lived refresh token is an HttpOnly cookie that JavaScript cannot see.
let accessToken: string | null = null
let onSessionLost: ((message?: string) => void) | null = null
let refreshInFlight: Promise<Session | null> | null = null

export const getAccessToken = () => accessToken
export const setAccessToken = (token: string | null) => {
  accessToken = token
}
export const setSessionLostHandler = (handler: ((message?: string) => void) | null) => {
  onSessionLost = handler
}

/** Thrown when the session is over; the handler above has already told the user. */
export const SESSION_ENDED = 'SESSION_ENDED'

/**
 * Tabs of one browser share the refresh cookie, and a refresh token works
 * only once. The lock makes them take turns, so that two tabs never present
 * the same token at the same moment and sign each other out.
 */
const acrossTabs = <T>(task: () => Promise<T>): Promise<T> =>
  typeof navigator !== 'undefined' && 'locks' in navigator
    ? (navigator.locks.request('session-refresh', task) as Promise<T>)
    : task()

/**
 * Exchanges the refresh cookie for a new session. Concurrent callers share
 * one request. Resolves to `null` only when the server says the session is
 * over; a server that cannot be reached is an error, not a sign-out.
 */
export function refreshSession(): Promise<Session | null> {
  refreshInFlight ??= acrossTabs(async () => {
    let response: Response
    try {
      response = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
    } catch {
      throw new ApiError(0, 'NETWORK', t('Cannot reach the server. Check your connection and try again.'))
    }
    if (response.ok) {
      const session = (await response.json()) as Session
      accessToken = session.accessToken
      return session
    }
    if (response.status === 401 || response.status === 403) {
      accessToken = null
      return null
    }
    throw new ApiError(response.status, 'UNAVAILABLE', t('The server is not responding. Please try again in a moment.'))
  }).finally(() => {
    refreshInFlight = null
  })
  return refreshInFlight
}

type QueryValue = string | number | boolean | null | undefined

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  query?: Record<string, QueryValue>
  /** A plain object is sent as JSON, `FormData` as a multipart upload. */
  body?: unknown
}

function buildUrl(path: string, query?: Record<string, QueryValue>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query ?? {})) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const search = params.toString()
  return `${BASE}${path}${search ? `?${search}` : ''}`
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {}
  let body: BodyInit | undefined
  if (options.body instanceof FormData) {
    body = options.body
  } else if (options.body !== undefined) {
    headers['Content-Type'] = 'application/json'
    body = JSON.stringify(options.body)
  }
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`
  try {
    return await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body,
      credentials: 'include',
    })
  } catch {
    throw new ApiError(0, 'NETWORK', t('Cannot reach the server. Check your connection and try again.'))
  }
}

interface ErrorBody {
  error?: { code?: string; message?: string; details?: Record<string, string[]> }
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  let response = await send(path, options)

  // An expired access token is renewed once, transparently, and the request repeated.
  if (response.status === 401 && accessToken && !path.startsWith('/auth/')) {
    if (await refreshSession()) {
      response = await send(path, options)
    } else {
      onSessionLost?.()
      throw new ApiError(401, SESSION_ENDED, t('Your session has ended. Please sign in again.'))
    }
  }

  if (response.status === 204) return undefined as T
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = (data as ErrorBody | null)?.error
    if (error?.code === 'ACCOUNT_SUSPENDED' && accessToken) {
      accessToken = null
      onSessionLost?.(error.message)
      throw new ApiError(403, SESSION_ENDED, error.message ?? '')
    }
    throw new ApiError(
      response.status,
      error?.code ?? 'ERROR',
      // The server's wording for a missing sign-in is meant for developers.
      response.status === 401 && error?.code === 'UNAUTHORIZED' && !path.startsWith('/auth/')
        ? t('Please sign in to continue.')
        : (error?.message ?? `The request failed (${response.status})`),
      error?.details,
    )
  }
  return data as T
}
