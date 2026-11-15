import { useEffect } from 'react'
import { getAccessToken, refreshSession } from '../api/client'
import type { ServerEvent } from '../api/types'
import { useAuth } from './auth'
import { keys, queryClient } from './queryClient'
import { toast } from './toast'
import { t } from './i18n'

const MAX_DELAY_MS = 30_000

function handle(event: ServerEvent, logout: () => Promise<void>) {
  switch (event.type) {
    case 'message.created':
    case 'message.updated':
    case 'conversation.read':
      // `conversations` is a prefix of the message and unread keys too.
      void queryClient.invalidateQueries({ queryKey: keys.conversations })
      break
    case 'order.updated':
    case 'listing.changed':
      void queryClient.invalidateQueries({ queryKey: keys.listings })
      void queryClient.invalidateQueries({ queryKey: ['me'] })
      break
    case 'notification.created':
      void queryClient.invalidateQueries({ queryKey: keys.notifications })
      toast.info(event.notification.message)
      break
    case 'account.suspended':
      toast.error(t('Your account has been suspended.'))
      void logout()
      break
  }
}

/**
 * Keeps one WebSocket open and turns server events into cache invalidations,
 * so every screen updates without knowing about the socket. Reconnects with
 * exponential backoff, and refetches on reconnect to cover what was missed.
 */
export function useRealtime() {
  const { user, logout } = useAuth()
  const userId = user?.id

  useEffect(() => {
    if (user === undefined) return
    let socket: WebSocket | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let attempts = 0
    let closed = false

    const connect = async () => {
      // The token is only checked during the handshake, so make sure it is fresh.
      if (userId && attempts > 0) await refreshSession()
      if (closed) return
      const token = userId ? getAccessToken() : null
      const origin = window.location.origin.replace(/^http/, 'ws')
      socket = new WebSocket(`${origin}/ws${token ? `?token=${encodeURIComponent(token)}` : ''}`)

      socket.onopen = () => {
        if (attempts > 0) void queryClient.invalidateQueries()
        attempts = 0
      }
      socket.onmessage = (message) => {
        try {
          handle(JSON.parse(String(message.data)) as ServerEvent, logout)
        } catch {
          // A malformed frame is not worth breaking the page for.
        }
      }
      socket.onclose = () => {
        if (closed) return
        attempts += 1
        timer = setTimeout(() => void connect(), Math.min(MAX_DELAY_MS, 1000 * 2 ** attempts))
      }
    }
    void connect()

    return () => {
      closed = true
      clearTimeout(timer)
      socket?.close()
    }
    // Reconnect when the signed-in user changes, not on every profile edit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, user === undefined])
}
