import { useSyncExternalStore } from 'react'

export interface Toast {
  id: number
  kind: 'success' | 'error' | 'info'
  message: string
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

function show(kind: Toast['kind'], message: string) {
  const id = nextId++
  // The same message twice in a row is noise (e.g. several failed requests while offline).
  if (toasts.some((item) => item.message === message)) return
  publish([...toasts.slice(-3), { id, kind, message }])
  setTimeout(() => dismissToast(id), kind === 'error' ? 7000 : 4000)
}

export const dismissToast = (id: number) => publish(toasts.filter((item) => item.id !== id))

export const toast = {
  success: (message: string) => show('success', message),
  error: (message: string) => show('error', message),
  info: (message: string) => show('info', message),
}

export const useToasts = () =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => toasts,
  )
