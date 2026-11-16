import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import { refreshSession, setAccessToken, setSessionLostHandler } from '../api/client'
import { authApi } from '../api/endpoints'
import type { Account, Session } from '../api/types'
import { queryClient } from './queryClient'
import { toast } from './toast'
import { t } from './i18n'

interface AuthState {
  /** `undefined` while the saved session is being restored. */
  user: Account | null | undefined
  isStaff: boolean
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  setUser: (user: Account) => void
}

const AuthContext = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<Account | null | undefined>(undefined)

  const applySession = useCallback((session: Session | null) => {
    setAccessToken(session?.accessToken ?? null)
    setUser(session?.user ?? null)
    // Cached answers belong to whoever was signed in before.
    queryClient.clear()
  }, [])

  useEffect(() => {
    let cancelled = false
    refreshSession()
      // Without the server nobody can be signed in; the page still opens for browsing.
      .catch(() => null)
      .then((session) => {
        if (!cancelled) setUser(session?.user ?? null)
      })
    setSessionLostHandler((message) => {
      applySession(null)
      if (message) toast.error(message)
      else toast.info(t('Your session has ended. Please sign in again.'))
    })
    return () => {
      cancelled = true
      setSessionLostHandler(null)
    }
  }, [applySession])

  const value = useMemo<AuthState>(
    () => ({
      user,
      isStaff: user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN',
      login: async (email, password) => applySession(await authApi.login(email, password)),
      register: async (email, password) => applySession(await authApi.register(email, password)),
      logout: async () => {
        // Signing out locally must work even when the server cannot be reached.
        await authApi.logout().catch(() => undefined)
        applySession(null)
      },
      setUser,
    }),
    [user, applySession],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthState {
  const context = useContext(AuthContext)
  if (!context) throw new Error(t('useAuth must be used inside <AuthProvider>'))
  return context
}
