import { useSyncExternalStore } from 'react'

export interface Toast {
  id: number
  kind: 'success' | 'error' | 'info' | 'alert'
  message: string
  /** Where a click on the toast leads, e.g. the conversation a new message belongs to. */
  link?: string
}

// A tiny store outside React, so that non-component code (the query client,
// the WebSocket handler) can raise a toast as well.
let toasts: Toast[] = []
let nextId = 1
const listeners = new Set<() => void>()

function publish(next: Toast[]) {
  toasts = next
  for (const listener of listeners) listener()
}

const DURATION_MS: Record<Toast['kind'], number> = { success: 4000, info: 4000, error: 7000, alert: 12_000 }

function show(kind: Toast['kind'], message: string, link?: string) {
  const id = nextId++
  // The same message twice in a row is noise (e.g. several failed requests while offline).
  if (toasts.some((item) => item.message === message)) return
  publish([...toasts.slice(-3), { id, kind, message, link }])
  setTimeout(() => dismissToast(id), DURATION_MS[kind])
}

export const dismissToast = (id: number) => publish(toasts.filter((item) => item.id !== id))

export const toast = {
  success: (message: string) => show('success', message),
  error: (message: string) => show('error', message),
  info: (message: string) => show('info', message),
  /** For things the user must not miss: a message or a notice from another person. Stays longer and stands out. */
  alert: (message: string, link?: string) => show('alert', message, link),
}

export const useToasts = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => toasts,
  )
