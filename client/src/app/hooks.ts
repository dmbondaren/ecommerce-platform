import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect, useMemo } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { listingApi } from '../api/endpoints'
import { useAuth } from './auth'
import { keys } from './queryClient'
import { toast } from './toast'

/** Only same-site paths are accepted as a return address, never a full URL. */
export const safeNext = (next: string | null) => (next && /^\/(?!\/)/.test(next) ? next : '/')

/** Wraps an action that needs an account: guests are sent to sign in and brought back. */
export function useRequireLogin() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  return useCallback(
    (action: () => void) => {
      if (user) action()
      else navigate(`/login?next=${encodeURIComponent(location.pathname + location.search)}`)
    },
    [user, navigate, location],
  )
}

/** The signed-in user's favourites and cart, with toggles that keep the cache in sync. */
export function useSavedListings() {
  const { user } = useAuth()
  const client = useQueryClient()
  const requireLogin = useRequireLogin()
  const enabled = Boolean(user)
  const favorites = useQuery({ queryKey: keys.favorites, queryFn: listingApi.favorites, enabled })
  const cart = useQuery({ queryKey: keys.cart, queryFn: listingApi.cart, enabled })

  const favoriteIds = useMemo(() => new Set(favorites.data?.map((item) => item.id)), [favorites.data])
  const cartIds = useMemo(() => new Set(cart.data?.map((item) => item.id)), [cart.data])

  const favoriteMutation = useMutation({
    mutationFn: (id: string) => listingApi.setFavorite(id, !favoriteIds.has(id)),
    onSettled: () => client.invalidateQueries({ queryKey: keys.favorites }),
  })
  const cartMutation = useMutation({
    mutationFn: (id: string) => listingApi.setInCart(id, !cartIds.has(id)),
    onSuccess: (_result, id) => toast.success(cartIds.has(id) ? 'Removed from your cart' : 'Added to your cart'),
    onSettled: () => client.invalidateQueries({ queryKey: keys.cart }),
  })

  return {
    favoriteIds,
    cartIds,
    cartCount: cart.data?.length ?? 0,
    toggleFavorite: (id: string) => requireLogin(() => favoriteMutation.mutate(id)),
    toggleCart: (id: string) => requireLogin(() => cartMutation.mutate(id)),
    cartBusy: cartMutation.isPending,
  }
}

export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    document.title = title ? `${title} · Marketplace` : 'Marketplace'
  }, [title])
}
