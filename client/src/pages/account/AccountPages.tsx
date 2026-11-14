import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, NavLink, Outlet } from 'react-router-dom'
import { accountApi, listingApi, orderApi } from '../../api/endpoints'
import type { Listing, Order, Purchase } from '../../api/types'
import { useDocumentTitle, useSavedListings } from '../../app/hooks'
import { keys } from '../../app/queryClient'
import { toast } from '../../app/toast'
import { ConfirmDialog } from '../../components/dialogs'
import { ListingGrid, ListingImage } from '../../components/ListingCard'
import { isAwaitingPayment, PaymentDetailsDialog, useNow, usePaymentActions } from '../../components/PaymentBanner'
import { Button, EmptyState, Field, FormError, Modal, QueryView, Stars, UserLink, fieldErrors } from '../../components/ui'
import {
  formatCountdown,
  formatDate,
  formatMonth,
  formatPrice,
  ORDER_STATUS_LABELS,
  STATUS_LABELS,
  timeAgo,
} from '../../lib/format'

const SECTIONS = [
  ['/account', 'Profile'],
  ['/account/listings', 'My listings'],
  ['/account/purchases', 'Purchases'],
  ['/account/sales', 'Sales'],
  ['/account/favorites', 'Favourites'],
  ['/account/history', 'Recently viewed'],
  ['/account/notifications', 'Notifications'],
] as const

export function AccountLayout() {
  useDocumentTitle('My account')
  return (
    <div className="account">
      <nav className="side-nav" aria-label="Account">
        {SECTIONS.map(([to, label]) => (
          <NavLink key={to} to={to} end={to === '/account'}>
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="account-content stack">
        <Outlet />
      </div>
    </div>
  )
}

export function MyListings() {
  const client = useQueryClient()
  const query = useQuery({ queryKey: [...keys.listings, 'mine'], queryFn: listingApi.mine })
  const [deleting, setDeleting] = useState<Listing | null>(null)
  const refresh = () => client.invalidateQueries({ queryKey: keys.listings })
  const relist = useMutation({ mutationFn: listingApi.relist, onSuccess: refresh })

  return (
    <>
      <div className="page-header">
        <h1>My listings</h1>
        <Link to="/sell" className="btn btn-primary btn-md">
          New listing
        </Link>
      </div>
      <QueryView
        query={query}
        empty={
          <EmptyState title="You have not listed anything yet">
            <Link to="/sell">Sell your first item</Link>
          </EmptyState>
        }
      >
        {(items) => (
          <ul className="rows card">
            {items.map((item) => (
              <li key={item.id} className="row-item">
                <Link to={`/listings/${item.id}`} className="thumb">
                  <ListingImage src={item.imageUrls[0]} alt="" />
                </Link>
                <div className="row-main">
                  <Link to={`/listings/${item.id}`}>{item.title}</Link>
                  <span className="muted">
                    {formatPrice(item.price, item.currency)} · {item.viewCount} views · {timeAgo(item.createdAt)}
                  </span>
                  {item.moderationReason && <span className="field-error">Moderator: {item.moderationReason}</span>}
                </div>
                <span className={`badge status-${item.status.toLowerCase()}`}>{STATUS_LABELS[item.status]}</span>
                <div className="row">
                  {item.status === 'RESERVED' ? (
                    <span className="muted">Awaiting payment</span>
                  ) : item.status === 'SOLD' ? (
                    <Button size="sm" busy={relist.isPending && relist.variables === item.id} onClick={() => relist.mutate(item.id)}>
                      List again
                    </Button>
                  ) : (
                    <Link className="btn btn-secondary btn-sm" to={`/listings/${item.id}/edit`}>
                      Edit
                    </Link>
                  )}
                  {item.status !== 'RESERVED' && (
                    <Button size="sm" variant="ghost" icon="trash" onClick={() => setDeleting(item)} aria-label={`Delete ${item.title}`} />
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryView>
      {deleting && (
        <ConfirmDialog
          title="Delete this listing?"
          confirmLabel="Delete listing"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await listingApi.remove(deleting.id)
            await refresh()
            toast.success('Listing deleted')
          }}
        >
          <p>“{deleting.title}” will disappear from the marketplace. This cannot be undone.</p>
        </ConfirmDialog>
      )}
    </>
  )
}

function SavedGrid({ title, queryKey, queryFn, emptyTitle }: { title: string; queryKey: readonly string[]; queryFn: () => Promise<Listing[]>; emptyTitle: string }) {
  const query = useQuery({ queryKey, queryFn })
  const saved = useSavedListings()
  return (
    <>
      <h1>{title}</h1>
      <QueryView
        query={query}
        empty={
          <EmptyState title={emptyTitle}>
            <Link to="/">Browse the listings</Link>
          </EmptyState>
        }
      >
        {(items) => <ListingGrid listings={items} favoriteIds={saved.favoriteIds} onToggleFavorite={saved.toggleFavorite} />}
      </QueryView>
    </>
  )
}

export const Favorites = () => (
  <SavedGrid title="Favourites" queryKey={keys.favorites} queryFn={listingApi.favorites} emptyTitle="Nothing saved yet" />
)
export const History = () => (
  <SavedGrid title="Recently viewed" queryKey={['me', 'history']} queryFn={listingApi.history} emptyTitle="Nothing viewed yet" />
)

function ReviewDialog({ order, onClose }: { order: Order; onClose: () => void }) {
  const client = useQueryClient()
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [pros, setPros] = useState('')
  const [cons, setCons] = useState('')
  const review = useMutation({
    mutationFn: () => orderApi.review(order.id, { rating, comment, pros, cons }),
    meta: { silent: true },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: keys.purchases })
      toast.success('Thank you for your review')
      onClose()
    },
  })
  const errors = fieldErrors(review.error)
  const submit = (event: FormEvent) => {
    event.preventDefault()
    review.mutate()
  }

  return (
    <Modal title={`Review: ${order.title}`} onClose={onClose}>
      <form onSubmit={submit}>
        <div className="modal-body">
          <Stars value={rating} onChange={setRating} />
          <Field label="How did it go? (optional)" errors={errors.comment}>
            {(props) => <textarea {...props} rows={4} maxLength={2000} value={comment} onChange={(event) => setComment(event.target.value)} />}
          </Field>
          <Field label="What you liked (optional)" errors={errors.pros}>
            {(props) => <input {...props} maxLength={500} value={pros} onChange={(event) => setPros(event.target.value)} />}
          </Field>
          <Field label="What could be better (optional)" errors={errors.cons}>
            {(props) => <input {...props} maxLength={500} value={cons} onChange={(event) => setCons(event.target.value)} />}
          </Field>
          {Object.keys(errors).length === 0 && <FormError error={review.error} />}
        </div>
        <footer className="modal-footer">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant="primary" busy={review.isPending}>
            Publish review
          </Button>
        </footer>
      </form>
    </Modal>
  )
}

function OrderRow({ order, children }: { order: Order; children: ReactNode }) {
  return (
    <li className="row-item">
      <span className="thumb">
        <ListingImage src={order.imageUrls[0]} alt="" />
      </span>
      <div className="row-main">
        {order.listingId ? <Link to={`/listings/${order.listingId}`}>{order.title}</Link> : <span>{order.title}</span>}
        <span className="muted">
          {formatDate(order.createdAt)} · {order.category}
        </span>
        {children}
      </div>
      <strong>{formatPrice(order.price, order.currency)}</strong>
      <span className={`badge order-${order.status.toLowerCase()}`}>{ORDER_STATUS_LABELS[order.status]}</span>
    </li>
  )
}

export function Purchases() {
  const query = useQuery({ queryKey: keys.purchases, queryFn: orderApi.purchases })
  const now = useNow(query.data?.some((order) => order.status === 'PENDING_PAYMENT') ?? false)
  const { confirm, cancel } = usePaymentActions()
  const [reviewing, setReviewing] = useState<Purchase | null>(null)
  const [paying, setPaying] = useState<Purchase | null>(null)

  return (
    <>
      <h1>Purchases</h1>
      <QueryView query={query} empty={<EmptyState title="You have not bought anything yet" />}>
        {(orders) => (
          <ul className="rows card">
            {orders.map((order) => (
              <OrderRow key={order.id} order={order}>
                <span className="inline">
                  <span className="muted">Seller:</span>
                  <UserLink user={order.seller} />
                </span>
                {isAwaitingPayment(order, now) && order.expiresAt ? (
                  <div className="row">
                    <span className="countdown">
                      Pay within {formatCountdown(new Date(order.expiresAt).getTime() - now)}
                    </span>
                    <Button size="sm" onClick={() => setPaying(order)}>
                      Payment details
                    </Button>
                    <Button
                      size="sm"
                      variant="primary"
                      busy={confirm.isPending && confirm.variables === order.id}
                      onClick={() => confirm.mutate(order.id)}
                    >
                      I have paid
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      busy={cancel.isPending && cancel.variables === order.id}
                      onClick={() => cancel.mutate(order.id)}
                    >
                      Cancel
                    </Button>
                  </div>
                ) : order.status === 'PAID' ? (
                  order.review ? (
                    <Stars value={order.review.rating} />
                  ) : (
                    order.seller && (
                      <div className="row">
                        <Button size="sm" onClick={() => setReviewing(order)}>
                          Leave a review
                        </Button>
                      </div>
                    )
                  )
                ) : (
                  order.status !== 'PENDING_PAYMENT' && (
                    <span className="muted">The reservation ended without a payment.</span>
                  )
                )}
              </OrderRow>
            ))}
          </ul>
        )}
      </QueryView>
      {reviewing && <ReviewDialog order={reviewing} onClose={() => setReviewing(null)} />}
      {paying && <PaymentDetailsDialog order={paying} onClose={() => setPaying(null)} />}
    </>
  )
}

function SalesAnalytics() {
  const query = useQuery({ queryKey: [...keys.sales, 'summary'], queryFn: orderApi.salesSummary })
  const summary = query.data
  if (!summary || summary.totals.length === 0) return null
  const currency = summary.monthlyCurrency ?? ''
  const peak = Math.max(1, ...summary.monthly.map((entry) => entry.revenue))

  return (
    <section className="card analytics" aria-label="Sales analytics">
      <dl className="stats">
        {summary.totals.map((total) => (
          <div key={total.currency}>
            <dt>Revenue</dt>
            <dd>{formatPrice(total.revenue, total.currency)}</dd>
          </div>
        ))}
        <div>
          <dt>Items sold</dt>
          <dd>{summary.totals.reduce((sum, total) => sum + total.count, 0)}</dd>
        </div>
        {summary.averageOrderValue !== null && (
          <div>
            <dt>Average sale</dt>
            <dd>{formatPrice(summary.averageOrderValue, currency)}</dd>
          </div>
        )}
      </dl>
      <figure className="chart">
        <figcaption className="muted">Revenue per month, {currency}</figcaption>
        <ol>
          {summary.monthly.map((entry) => (
            <li key={entry.month} title={`${formatPrice(entry.revenue, currency)} · ${entry.count} sold`}>
              <span className="chart-value">{entry.revenue > 0 ? Math.round(entry.revenue) : ''}</span>
              <span className="chart-bar" style={{ height: `${(entry.revenue / peak) * 100}%` }} />
              <span className="chart-label">{formatMonth(entry.month)}</span>
              <span className="sr-only">
                : {formatPrice(entry.revenue, currency)}, {entry.count} sold
              </span>
            </li>
          ))}
        </ol>
      </figure>
    </section>
  )
}

export function Sales() {
  const query = useQuery({ queryKey: keys.sales, queryFn: orderApi.sales })
  return (
    <>
      <h1>Sales</h1>
      <SalesAnalytics />
      <QueryView query={query} empty={<EmptyState title="You have not sold anything yet" />}>
        {(orders) => (
          <ul className="rows card">
            {orders.map((order) => (
              <OrderRow key={order.id} order={order}>
                <span className="inline">
                  <span className="muted">Buyer:</span>
                  <UserLink user={order.buyer} />
                </span>
                {order.review && <Stars value={order.review.rating} />}
              </OrderRow>
            ))}
          </ul>
        )}
      </QueryView>
    </>
  )
}

export function Notifications() {
  const client = useQueryClient()
  const query = useQuery({ queryKey: keys.notifications, queryFn: accountApi.notifications })
  const unread = query.data?.unreadCount ?? 0

  // Opening the page is what marks them as read; the list keeps showing which ones were new.
  useEffect(() => {
    if (unread === 0) return
    accountApi
      .markNotificationsRead()
      .then(() =>
        client.setQueryData(keys.notifications, (current: typeof query.data) =>
          current ? { ...current, unreadCount: 0 } : current,
        ),
      )
      .catch(() => undefined)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unread, client])

  return (
    <>
      <h1>Notifications</h1>
      <QueryView query={query}>
        {(data) =>
          data.items.length === 0 ? (
            <EmptyState title="No notifications yet" />
          ) : (
            <ul className="rows card">
              {data.items.map((item) => (
                <li key={item.id} className={item.readAt ? 'row-item' : 'row-item unread'}>
                  <div className="row-main">
                    {item.link ? <Link to={item.link}>{item.message}</Link> : <span>{item.message}</span>}
                    <span className="muted">{timeAgo(item.createdAt)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )
        }
      </QueryView>
    </>
  )
}
