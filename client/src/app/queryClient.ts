import { MutationCache, QueryClient } from '@tanstack/react-query'
import { ApiError, errorMessage } from '../api/client'
import { toast } from './toast'

/** Only failures that may go away by themselves are retried: no network, or a server error. */
const isTransient = (error: unknown) => error instanceof ApiError && (error.status === 0 || error.status >= 500)

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failures, error) => isTransient(error) && failures < 2,
      refetchOnWindowFocus: false,
    },
  },
  // Every failed action tells the user what went wrong, unless the form that
  // started it shows the error itself.
  mutationCache: new MutationCache({
    onError: (error, _variables, _context, mutation) => {
      if (mutation.meta?.silent) return
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
  conversations: ['conversations'] as const,
  messages: (id: string) => ['conversations', id, 'messages'] as const,
  unread: ['conversations', 'unread'] as const,
  notifications: ['me', 'notifications'] as const,
}
