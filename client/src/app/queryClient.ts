import { MutationCache, QueryClient } from '@tanstack/react-query'
import { ApiError, errorMessage, SESSION_ENDED } from '../api/client'
import { toast } from './toast'

/**
 * Only failures that may go away by themselves are retried: no network, or a
 * gateway that is restarting. A plain 500 is a bug and will fail again, so
 * retrying it would only make the user wait longer for the error message.
 */
const isTransient = (error: unknown) => error instanceof ApiError && [0, 502, 503, 504].includes(error.status)

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failures, error) => isTransient(error) && failures < 1,
      retryDelay: 600,
      refetchOnWindowFocus: false,
    },
  },
  // Every failed action tells the user what went wrong, unless the form that
  // started it shows the error itself.
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.silent) return
      // The end of a session is announced once, by the session itself.
      if (error instanceof ApiError && error.code === SESSION_ENDED) return
      toast.error(errorMessage(error))
    },
  }),
})

/** Cache keys in one place, so invalidation cannot drift from the queries. */
export const keys = {
  categories: ['categories'] as const,
  listings: ['listings'] as const,
  listing: (id: string) => ['listings', 'detail', id] as const,
  favorites: ['me', 'favorites'] as const,
  cart: ['me', 'cart'] as const,
  purchases: ['me', 'purchases'] as const,
  sales: ['me', 'sales'] as const,
  conversations: ['conversations'] as const,
  messages: (id: string) => ['conversations', id, 'messages'] as const,
  unread: ['conversations', 'unread'] as const,
  notifications: ['me', 'notifications'] as const,
}
