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
let onSessionLost: (() => void) | null = null
let refreshInFlight: Promise<Session | null> | null = null

export const getAccessToken = () => accessToken
export const setAccessToken = (token: string | null) => {
  accessToken = token
}
export const setSessionLostHandler = (handler: (() => void) | null) => {
  onSessionLost = handler
}

/** Exchanges the refresh cookie for a new session. Concurrent callers share one request. */
export function refreshSession(): Promise<Session | null> {
  refreshInFlight ??= (async () => {
    try {
      const response = await fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
      if (!response.ok) {
        accessToken = null
        return null
      }
      const session = (await response.json()) as Session
      accessToken = session.accessToken
      return session
    } catch {
      return null
    } finally {
      refreshInFlight = null
    }
  })()
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
    if (await refreshSession()) response = await send(path, options)
    else onSessionLost?.()
  }

  if (response.status === 204) return undefined as T
  const data: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const error = (data as ErrorBody | null)?.error
    throw new ApiError(
      response.status,
      error?.code ?? 'ERROR',
      error?.message ?? `The request failed (${response.status})`,
      error?.details,
    )
  }
  return data as T
}
