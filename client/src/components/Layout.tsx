import { useQuery } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, NavLink, Outlet, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { accountApi, authApi, chatApi } from '../api/endpoints'
import { useAuth } from '../app/auth'
import { useSavedListings } from '../app/hooks'
import { keys } from '../app/queryClient'
import { useRealtime } from '../app/realtime'
import { toast } from '../app/toast'
import { ErrorBoundary } from './ErrorBoundary'
import { Icon, type IconName } from './Icon'
import { Avatar, Button } from './ui'

function HeaderLink({ to, icon, label, count = 0 }: { to: string; icon: IconName; label: string; count?: number }) {
  return (
    <NavLink to={to} className="header-link" aria-label={count ? `${label} (${count} new)` : label} title={label}>
      <Icon name={icon} size={22} />
      {count > 0 && <span className="counter">{count > 99 ? '99+' : count}</span>}
    </NavLink>
  )
}

function SearchBox() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
  const current = location.pathname === '/' ? (params.get('q') ?? '') : ''
  const [draft, setDraft] = useState<{ source: string; value: string }>({ source: current, value: current })
  // Follows the URL (back button, cleared filters) without overwriting what is being typed.
  const value = draft.source === current ? draft.value : current

  const submit = (event: FormEvent) => {
    event.preventDefault()
    const next = new URLSearchParams(location.pathname === '/' ? params : undefined)
    if (value.trim()) next.set('q', value.trim())
    else next.delete('q')
    next.delete('page')
    navigate({ pathname: '/', search: next.toString() })
  }

  return (
    <form className="search" role="search" onSubmit={submit}>
      <Icon name="search" size={18} />
      <input
        type="search"
        placeholder="Search listings"
        aria-label="Search listings"
        maxLength={100}
        value={value}
        onChange={(event) => setDraft({ source: current, value: event.target.value })}
      />
    </form>
  )
}

function VerifyBanner() {
  const [sent, setSent] = useState(false)
  const resend = async () => {
    try {
      await authApi.resendVerification()
      setSent(true)
    } catch {
      toast.error('The e-mail could not be sent. Please try again later.')
    }
  }
  return (
    <div className="banner" role="status">
      <span>Confirm your e-mail address to publish listings. Check your inbox for the link.</span>
      {sent ? (
        <span className="muted">Sent.</span>
      ) : (
        <button type="button" className="link" onClick={() => void resend()}>
          Send it again
        </button>
      )}
    </div>
  )
}

export function Layout() {
  const { user, isStaff } = useAuth()
  const location = useLocation()
  const signedIn = Boolean(user)
  useRealtime()

  const { cartCount } = useSavedListings()
  const unread = useQuery({ queryKey: keys.unread, queryFn: chatApi.unreadCount, enabled: signedIn })
  const notifications = useQuery({ queryKey: keys.notifications, queryFn: accountApi.notifications, enabled: signedIn })

  return (
    <>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="site-header">
        <div className="container header-inner">
          <Link to="/" className="brand" aria-label="Marketplace, start page">
            <span className="brand-mark" aria-hidden="true">
              M
            </span>
            <span className="brand-name">Marketplace</span>
          </Link>
          <SearchBox />
          <nav className="header-nav" aria-label="Main">
            {user ? (
              <>
                {isStaff && <HeaderLink to="/admin" icon="shield" label="Administration" />}
                <HeaderLink to="/account/favorites" icon="heart" label="Favourites" />
                <HeaderLink to="/cart" icon="cart" label="Cart" count={cartCount} />
                <HeaderLink to="/messages" icon="chat" label="Messages" count={unread.data?.count} />
                <HeaderLink
                  to="/account/notifications"
                  icon="bell"
                  label="Notifications"
                  count={notifications.data?.unreadCount}
                />
                <NavLink to="/account" className="header-link" aria-label="My account" title="My account">
                  <Avatar user={user} size={30} />
                </NavLink>
              </>
            ) : (
              user === null && (
                <Link to="/login" className="btn btn-ghost btn-md">
                  Sign in
                </Link>
              )
            )}
            <Link to="/sell" className="btn btn-primary btn-md">
              <Icon name="plus" size={18} />
              Sell
            </Link>
          </nav>
        </div>
      </header>
      {user && !user.isVerified && <VerifyBanner />}
      <main id="main" className="container main">
        <ErrorBoundary resetKey={location.pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <footer className="site-footer">
        <div className="container footer-inner">
          <span>© {new Date().getFullYear()} Marketplace · a portfolio project by Dmytro Bondarenko</span>
          <SupportLink />
        </div>
      </footer>
    </>
  )
}

function SupportLink() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  if (!user) return null
  const open = async () => {
    setBusy(true)
    try {
      const conversation = await chatApi.openSupport()
      navigate(`/messages/${conversation.id}`)
    } catch {
      toast.error('The support chat could not be opened. Please try again.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button variant="ghost" size="sm" busy={busy} onClick={() => void open()}>
      Contact support
    </Button>
  )
}
