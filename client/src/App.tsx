import { lazy, Suspense, type ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { useAuth } from './app/auth'
import { Layout } from './components/Layout'
import { EmptyState, Spinner } from './components/ui'
import { AccountLayout, Favorites, History, MyListings, Notifications, Purchases, Sales } from './pages/account/AccountPages'
import { Settings } from './pages/account/Settings'
import { ForgotPassword, Login, Register, ResetPassword, VerifyEmail } from './pages/AuthPages'
import { Cart } from './pages/Cart'
import { Catalog } from './pages/Catalog'
import { ListingDetail } from './pages/ListingDetail'
import { ListingEditor } from './pages/ListingEditor'
import { Messages } from './pages/Messages'
import { UserProfile } from './pages/UserProfile'

// Most visitors never open the admin area, so it is loaded on demand.
const Admin = lazy(() => import('./pages/admin/Admin'))

function RequireAuth({ children, staff = false }: { children: ReactNode; staff?: boolean }) {
  const { user, isStaff } = useAuth()
  const location = useLocation()
  if (user === undefined) return <Spinner />
  if (user === null) {
    return <Navigate to={`/login?next=${encodeURIComponent(location.pathname + location.search)}`} replace />
  }
  if (staff && !isStaff) return <EmptyState title="This area is for staff only" />
  return <>{children}</>
}

const NotFound = () => (
  <EmptyState title="Page not found">
    <p>
      The address may be mistyped, or the page has moved. <a href="/">Back to the listings</a>
    </p>
  </EmptyState>
)

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Catalog />} />
        <Route path="listings/:id" element={<ListingDetail />} />
        <Route path="users/:id" element={<UserProfile />} />
        <Route path="login" element={<Login />} />
        <Route path="register" element={<Register />} />
        <Route path="forgot-password" element={<ForgotPassword />} />
        <Route path="reset-password" element={<ResetPassword />} />
        <Route path="verify-email" element={<VerifyEmail />} />

        <Route path="sell" element={<RequireAuth><ListingEditor /></RequireAuth>} />
        <Route path="listings/:id/edit" element={<RequireAuth><ListingEditor /></RequireAuth>} />
        <Route path="cart" element={<RequireAuth><Cart /></RequireAuth>} />
        <Route path="messages" element={<RequireAuth><Messages /></RequireAuth>} />
        <Route path="messages/:id" element={<RequireAuth><Messages /></RequireAuth>} />

        <Route path="account" element={<RequireAuth><AccountLayout /></RequireAuth>}>
          <Route index element={<Settings />} />
          <Route path="listings" element={<MyListings />} />
          <Route path="favorites" element={<Favorites />} />
          <Route path="history" element={<History />} />
          <Route path="purchases" element={<Purchases />} />
          <Route path="sales" element={<Sales />} />
          <Route path="notifications" element={<Notifications />} />
        </Route>

        <Route
          path="admin/*"
          element={
            <RequireAuth staff>
              <Suspense fallback={<Spinner />}>
                <Admin />
              </Suspense>
            </RequireAuth>
          }
        />
        <Route path="*" element={<NotFound />} />
      </Route>
    </Routes>
  )
}
