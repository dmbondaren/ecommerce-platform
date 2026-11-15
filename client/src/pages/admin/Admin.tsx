import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, NavLink, Route, Routes, useNavigate, useSearchParams } from 'react-router-dom'
import { errorMessage } from '../../api/client'
import { adminApi, chatApi } from '../../api/endpoints'
import type { AdminOrder, AdminUser, Listing, PlatformStats } from '../../api/types'
import { useAuth } from '../../app/auth'
import { useDocumentTitle } from '../../app/hooks'
import { toast } from '../../app/toast'
import { BarList, TrendChart } from '../../components/charts'
import { ConfirmDialog, ReasonDialog } from '../../components/dialogs'
import { ListingImage } from '../../components/ListingCard'
import { Button, EmptyState, Modal, Pagination, QueryView, UserLink } from '../../components/ui'
import { formatDate, formatPrice, formatTime, ORDER_STATUS_LABELS, STATUS_LABELS, timeAgo } from '../../lib/format'

const adminKey = ['admin'] as const

function Moderation() {
  const client = useQueryClient()
  const query = useQuery({ queryKey: [...adminKey, 'listings'], queryFn: adminApi.moderationQueue })
  const [removing, setRemoving] = useState<Listing | null>(null)
  const refresh = () => client.invalidateQueries({ queryKey: adminKey })
  const approve = useMutation({ mutationFn: adminApi.activateListing, onSuccess: refresh })

  return (
    <>
      <p className="muted">Listings that were taken down, and those their owners edited afterwards and want reviewed.</p>
      <QueryView query={query} empty={<EmptyState title="Nothing is waiting for moderation" />}>
        {(items) => (
          <ul className="rows card">
            {items.map((item) => (
              <li key={item.id} className="row-item">
                <Link to={`/listings/${item.id}`} className="thumb">
                  <ListingImage src={item.imageUrls[0]} alt="" />
                </Link>
                <div className="row-main">
                  <Link to={`/listings/${item.id}`}>{item.title}</Link>
                  <span className="inline">
                    <UserLink user={item.owner} />
                    <span className="muted">· {formatPrice(item.price, item.currency)} · updated {timeAgo(item.updatedAt)}</span>
                  </span>
                  {item.moderationReason && <span className="muted">Reason: {item.moderationReason}</span>}
                </div>
                <span className={`badge status-${item.status.toLowerCase()}`}>{STATUS_LABELS[item.status]}</span>
                <div className="row">
                  <Button size="sm" busy={approve.isPending && approve.variables === item.id} onClick={() => approve.mutate(item.id)}>
                    Approve
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => setRemoving(item)}>
                    Remove
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </QueryView>
      {removing && (
        <ReasonDialog
          title={`Remove “${removing.title}”`}
          hint="The seller is told why. This cannot be undone."
          confirmLabel="Remove listing"
          danger
          onClose={() => setRemoving(null)}
          onSubmit={async (reason) => {
            await adminApi.removeListing(removing.id, reason)
            await refresh()
          }}
        />
      )}
    </>
  )
}

function Reports() {
  const client = useQueryClient()
  const [status, setStatus] = useState<'OPEN' | 'RESOLVED'>('OPEN')
  const query = useQuery({ queryKey: [...adminKey, 'reports', status], queryFn: () => adminApi.reports(status) })
  const resolve = useMutation({
    mutationFn: adminApi.resolveReport,
    onSuccess: () => client.invalidateQueries({ queryKey: adminKey }),
  })

  return (
    <>
      <div className="chips" role="group" aria-label="Report status">
        {(['OPEN', 'RESOLVED'] as const).map((value) => (
          <button key={value} type="button" className={status === value ? 'chip active' : 'chip'} aria-pressed={status === value} onClick={() => setStatus(value)}>
            {value === 'OPEN' ? 'Open' : 'Resolved'}
          </button>
        ))}
      </div>
      <QueryView query={query} empty={<EmptyState title={status === 'OPEN' ? 'No open reports' : 'No resolved reports'} />}>
        {(items) => (
          <ul className="stack">
            {items.map((report) => (
              <li key={report.id} className="card report">
                <header className="row">
                  <Link to={`/listings/${report.listing.id}`}>
                    <strong>{report.listing.title}</strong>
                  </Link>
                  <span className={`badge status-${report.listing.status.toLowerCase()}`}>{STATUS_LABELS[report.listing.status]}</span>
                  <span className="muted">{timeAgo(report.createdAt)}</span>
                </header>
                <p className="prose">{report.message}</p>
                <footer className="row">
                  {report.reporter ? (
                    <span className="inline">
                      <span className="muted">Reported by</span> <UserLink user={report.reporter} />
                    </span>
                  ) : (
                    <span className="badge">Automatic check</span>
                  )}
                  {report.status === 'OPEN' ? (
                    <Button size="sm" busy={resolve.isPending && resolve.variables === report.id} onClick={() => resolve.mutate(report.id)}>
                      Mark as resolved
                    </Button>
                  ) : (
                    report.resolvedAt && <span className="muted">Resolved {formatDate(report.resolvedAt)}</span>
                  )}
                </footer>
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </>
  )
}

type UserAction = { kind: 'ban' | 'delete' | 'promote' | 'demote'; user: AdminUser }

const banLabel = (user: AdminUser) => {
  if (user.bannedPermanently) return 'Suspended permanently'
  if (user.bannedUntil && new Date(user.bannedUntil) > new Date()) return `Suspended until ${formatDate(user.bannedUntil)}`
  return null
}

function Users() {
  const { user: me } = useAuth()
  const navigate = useNavigate()
  const client = useQueryClient()
  const [search, setSearch] = useState({ draft: '', q: '', page: 1 })
  const [action, setAction] = useState<UserAction | null>(null)
  const query = useQuery({
    queryKey: [...adminKey, 'users', search.q, search.page],
    queryFn: () => adminApi.users(search.q, search.page),
    placeholderData: keepPreviousData,
  })
  const refresh = () => client.invalidateQueries({ queryKey: adminKey })
  const unban = useMutation({ mutationFn: adminApi.unban, onSuccess: refresh })
  const isSuperAdmin = me?.role === 'SUPER_ADMIN'

  const submit = (event: FormEvent) => {
    event.preventDefault()
    setSearch((current) => ({ ...current, q: current.draft.trim(), page: 1 }))
  }
  const openSupport = async (userId: string) => {
    try {
      const conversation = await chatApi.openSupport(userId)
      navigate(`/messages/${conversation.id}`)
    } catch {
      toast.error('The conversation could not be opened.')
    }
  }
  /** Admins act on regular users; staff accounts are left to the super administrator. */
  const canModerate = (user: AdminUser) =>
    user.id !== me?.id && user.role !== 'SUPER_ADMIN' && (user.role === 'USER' || isSuperAdmin)

  return (
    <>
      <form className="toolbar" role="search" onSubmit={submit}>
        <input
          type="search"
          placeholder="Search by e-mail or nickname"
          aria-label="Search users"
          value={search.draft}
          onChange={(event) => setSearch({ ...search, draft: event.target.value })}
        />
        <Button type="submit">Search</Button>
      </form>
      <QueryView query={query}>
        {(page) =>
          page.items.length === 0 ? (
            <EmptyState title="No users match" />
          ) : (
            <>
              <div className="table-wrap card">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">User</th>
                      <th scope="col">E-mail</th>
                      <th scope="col">Role</th>
                      <th scope="col">Joined</th>
                      <th scope="col">Status</th>
                      <th scope="col">
                        <span className="sr-only">Actions</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.items.map((user) => {
                      const banned = banLabel(user)
                      return (
                        <tr key={user.id}>
                          <td>
                            <UserLink user={user} />
                          </td>
                          <td>{user.email}</td>
                          <td>{user.role === 'USER' ? 'User' : user.role === 'ADMIN' ? 'Admin' : 'Super admin'}</td>
                          <td>{formatDate(user.memberSince)}</td>
                          <td>
                            {banned ? (
                              <span className="badge status-deactivated" title={user.banReason ?? undefined}>
                                {banned}
                              </span>
                            ) : (
                              <span className="muted">Active</span>
                            )}
                          </td>
                          <td>
                            <div className="row row-end">
                              <Button size="sm" variant="ghost" onClick={() => void openSupport(user.id)}>
                                Message
                              </Button>
                              {canModerate(user) &&
                                (banned ? (
                                  <Button size="sm" busy={unban.isPending && unban.variables === user.id} onClick={() => unban.mutate(user.id)}>
                                    Lift suspension
                                  </Button>
                                ) : (
                                  <Button size="sm" onClick={() => setAction({ kind: 'ban', user })}>
                                    Suspend
                                  </Button>
                                ))}
                              {isSuperAdmin && canModerate(user) && (
                                <>
                                  <Button size="sm" onClick={() => setAction({ kind: user.role === 'ADMIN' ? 'demote' : 'promote', user })}>
                                    {user.role === 'ADMIN' ? 'Remove admin' : 'Make admin'}
                                  </Button>
                                  <Button size="sm" variant="danger" onClick={() => setAction({ kind: 'delete', user })}>
                                    Delete
                                  </Button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
              <Pagination page={page.page} totalPages={page.totalPages} onChange={(next) => setSearch({ ...search, page: next })} />
            </>
          )
        }
      </QueryView>

      {action?.kind === 'ban' && (
        <ReasonDialog
          title={`Suspend ${action.user.nickname}`}
          hint="The user is signed out at once and sees this reason when trying to sign in."
          confirmLabel="Suspend account"
          danger
          withDays
          onClose={() => setAction(null)}
          onSubmit={async (reason, days) => {
            await adminApi.ban(action.user.id, reason, days)
            await refresh()
          }}
        />
      )}
      {action?.kind === 'delete' && (
        <ReasonDialog
          title={`Delete ${action.user.nickname}`}
          hint="Removes the account with its listings, messages and reviews. This cannot be undone."
          confirmLabel="Delete account"
          danger
          onClose={() => setAction(null)}
          onSubmit={async (reason) => {
            await adminApi.deleteUser(action.user.id, reason)
            await refresh()
          }}
        />
      )}
      {(action?.kind === 'promote' || action?.kind === 'demote') && (
        <ConfirmDialog
          title={action.kind === 'promote' ? `Make ${action.user.nickname} an administrator?` : `Remove admin rights from ${action.user.nickname}?`}
          confirmLabel={action.kind === 'promote' ? 'Make admin' : 'Remove admin'}
          onClose={() => setAction(null)}
          onConfirm={async () => {
            await adminApi.setRole(action.user.id, action.kind === 'promote' ? 'ADMIN' : 'USER')
            await refresh()
          }}
        >
          <p>
            {action.kind === 'promote'
              ? 'Administrators can moderate listings, answer support requests and suspend users.'
              : 'The account goes back to being a regular user.'}
          </p>
        </ConfirmDialog>
      )}
    </>
  )
}

const ACTION_LABELS: Record<string, string> = {
  LISTING_ACTIVATED: 'Approved a listing',
  LISTING_DEACTIVATED: 'Took a listing down',
  LISTING_REMOVED: 'Removed a listing',
  USER_BANNED: 'Suspended a user',
  USER_UNBANNED: 'Lifted a suspension',
  USER_DELETED: 'Deleted a user',
  ROLE_CHANGED: 'Changed a role',
  REPORT_RESOLVED: 'Resolved a report',
}

function AuditLog() {
  const [page, setPage] = useState(1)
  const query = useQuery({
    queryKey: [...adminKey, 'audit', page],
    queryFn: () => adminApi.auditLog(page),
    placeholderData: keepPreviousData,
  })
  return (
    <QueryView query={query}>
      {(data) =>
        data.items.length === 0 ? (
          <EmptyState title="No moderation actions yet" />
        ) : (
          <>
            <div className="table-wrap card">
              <table>
                <thead>
                  <tr>
                    <th scope="col">When</th>
                    <th scope="col">Who</th>
                    <th scope="col">Action</th>
                    <th scope="col">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        {formatDate(entry.createdAt)} <span className="muted">{timeAgo(entry.createdAt)}</span>
                      </td>
                      <td>
                        <UserLink user={entry.actor} />
                      </td>
                      <td>{ACTION_LABELS[entry.action] ?? entry.action}</td>
                      <td>{entry.reason ?? <span className="muted">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={data.page} totalPages={data.totalPages} onChange={setPage} />
          </>
        )
      }
    </QueryView>
  )
}

function Tile({ label, value, note, to }: { label: string; value: string | number; note?: string; to?: string }) {
  const body = (
    <>
      <span className="tile-label">{label}</span>
      <strong className="tile-value">{value}</strong>
      {note && <span className="muted">{note}</span>}
    </>
  )
  // A tile that leads somewhere is a link, so the detail behind a number is one click away.
  return to ? (
    <Link className="card tile tile-link" to={to}>
      {body}
    </Link>
  ) : (
    <div className="card tile">{body}</div>
  )
}

function RankTable({ title, rows, currency }: { title: string; rows: PlatformStats['topSellers']; currency: string }) {
  return (
    <section className="card stat-card">
      <header>
        <h3>{title}</h3>
      </header>
      {rows.length === 0 ? (
        <p className="muted">Nothing yet</p>
      ) : (
        <ol className="rank-list">
          {rows.map((row, index) => (
            <li key={row.user?.id ?? index}>
              <span className="rank">{index + 1}</span>
              <UserLink user={row.user} />
              <span className="muted">
                {row.count} {row.count === 1 ? 'deal' : 'deals'}
              </span>
              <strong>{formatPrice(row.revenue, currency)}</strong>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

/** The whole marketplace at a glance; every block links to the list behind it. */
function Statistics() {
  const query = useQuery({ queryKey: [...adminKey, 'stats'], queryFn: adminApi.stats })
  return (
    <QueryView query={query}>
      {(stats) => {
        const currency = stats.mainCurrency ?? 'CHF'
        const paid = stats.totals.orders.PAID ?? 0
        const sum = (key: 'orders' | 'users' | 'listings') => stats.daily.reduce((total, day) => total + day[key], 0)
        const trend = (key: 'orders' | 'revenue' | 'users' | 'listings') =>
          stats.daily.map((day) => ({ date: day.date, value: day[key] }))
        return (
          <>
            <div className="tiles">
              <Tile label="Users" value={stats.totals.users} note={`${stats.totals.bannedUsers} suspended`} to="/admin/users" />
              <Tile
                label="Active listings"
                value={stats.totals.listings.ACTIVE ?? 0}
                note={`${stats.totals.listings.RESERVED ?? 0} reserved · ${stats.totals.listings.SOLD ?? 0} sold`}
                to="/"
              />
              <Tile
                label="Completed sales"
                value={paid}
                note={`${stats.totals.orders.PENDING_PAYMENT ?? 0} awaiting payment`}
                to="/admin/orders?status=PAID"
              />
              {stats.revenue.map((entry) => (
                <Tile
                  key={entry.currency}
                  label={`Turnover, ${entry.currency}`}
                  value={formatPrice(entry.amount, entry.currency)}
                  note={`${entry.count} ${entry.count === 1 ? 'sale' : 'sales'}`}
                />
              ))}
              <Tile label="Open reports" value={stats.totals.openReports} to="/admin/reports" />
            </div>

            <h2>Last 30 days</h2>
            <div className="stat-grid">
              <section className="card stat-card">
                <header>
                  <h3>Sales per day</h3>
                  <span className="badge">{sum('orders')}</span>
                </header>
                <TrendChart points={trend('orders')} />
              </section>
              <section className="card stat-card">
                <header>
                  <h3>Turnover per day, {currency}</h3>
                </header>
                <TrendChart points={trend('revenue')} format={(value) => formatPrice(value, currency)} />
              </section>
              <section className="card stat-card">
                <header>
                  <h3>New listings per day</h3>
                  <span className="badge">{sum('listings')}</span>
                </header>
                <TrendChart points={trend('listings')} />
              </section>
              <section className="card stat-card">
                <header>
                  <h3>New users per day</h3>
                  <span className="badge">{sum('users')}</span>
                </header>
                <TrendChart points={trend('users')} />
              </section>
            </div>

            <h2>What sells</h2>
            <div className="stat-grid">
              <section className="card stat-card">
                <header>
                  <h3>Sales by category</h3>
                </header>
                {stats.categories.length === 0 ? (
                  <p className="muted">Nothing yet</p>
                ) : (
                  <BarList
                    rows={stats.categories.map((category) => ({
                      label: category.name,
                      value: category.count,
                      note: formatPrice(category.revenue, currency),
                    }))}
                  />
                )}
              </section>
              <RankTable title="Top sellers" rows={stats.topSellers} currency={currency} />
              <RankTable title="Top buyers" rows={stats.topBuyers} currency={currency} />
            </div>
            <p className="muted">
              Amounts in the charts and rankings are in {currency}, the currency with the most sales; other currencies
              are listed separately above. Every single sale, with buyer, seller and the listing as it was sold, is under{' '}
              <Link className="link" to="/admin/orders">
                Orders
              </Link>
              .
            </p>
          </>
        )
      }}
    </QueryView>
  )
}

function OrderDetails({ order, onClose }: { order: AdminOrder; onClose: () => void }) {
  return (
    <Modal title={order.title} onClose={onClose}>
      <div className="modal-body">
        {order.imageUrls.length > 0 && (
          <div className="order-photos">
            {order.imageUrls.map((url) => (
              <a key={url} href={url} target="_blank" rel="noreferrer">
                <img src={url} alt="" loading="lazy" />
              </a>
            ))}
          </div>
        )}
        <dl className="definition">
          <div>
            <dt>Price</dt>
            <dd>{formatPrice(order.price, order.currency)}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>
              <span className={`badge order-${order.status.toLowerCase()}`}>{ORDER_STATUS_LABELS[order.status]}</span>
            </dd>
          </div>
          <div>
            <dt>Category</dt>
            <dd>{order.category}</dd>
          </div>
          <div>
            <dt>Seller</dt>
            <dd>
              <UserLink user={order.seller} />
            </dd>
          </div>
          <div>
            <dt>Buyer</dt>
            <dd>
              <UserLink user={order.buyer} />
            </dd>
          </div>
          <div>
            <dt>Ordered</dt>
            <dd>
              {formatDate(order.createdAt)}, {formatTime(order.createdAt)}
            </dd>
          </div>
          {order.paidAt && (
            <div>
              <dt>Paid</dt>
              <dd>
                {formatDate(order.paidAt)}, {formatTime(order.paidAt)}
              </dd>
            </div>
          )}
          {order.paymentReference && (
            <div>
              <dt>Payment reference</dt>
              <dd>{order.paymentReference}</dd>
            </div>
          )}
          {order.review && (
            <div>
              <dt>Review</dt>
              <dd>{order.review.rating} out of 5</dd>
            </div>
          )}
          <div>
            <dt>Description at the time of sale</dt>
            <dd className="prose">{order.description}</dd>
          </div>
        </dl>
      </div>
      <footer className="modal-footer">
        {order.listingId && (
          <Link className="btn btn-secondary btn-md" to={`/listings/${order.listingId}`}>
            Open the listing
          </Link>
        )}
        <Button onClick={onClose}>Close</Button>
      </footer>
    </Modal>
  )
}

const ORDER_FILTERS = [
  ['', 'All'],
  ['PAID', 'Paid'],
  ['PENDING_PAYMENT', 'Awaiting payment'],
  ['CANCELLED', 'Cancelled'],
  ['EXPIRED', 'Expired'],
] as const

/** Archive of every order: the listing as it was sold, who bought it from whom, and when. */
function Orders() {
  const [params, setParams] = useSearchParams()
  const status = params.get('status') ?? ''
  const [search, setSearch] = useState({ draft: '', q: '', page: 1 })
  const [selected, setSelected] = useState<AdminOrder | null>(null)
  const query = useQuery({
    queryKey: [...adminKey, 'orders', search.q, status, search.page],
    queryFn: () => adminApi.orders(search.q, status, search.page),
    placeholderData: keepPreviousData,
  })
  const submit = (event: FormEvent) => {
    event.preventDefault()
    setSearch((current) => ({ ...current, q: current.draft.trim(), page: 1 }))
  }

  return (
    <>
      <form className="toolbar" role="search" onSubmit={submit}>
        <input
          type="search"
          placeholder="Search by title, buyer, seller or payment reference"
          aria-label="Search orders"
          value={search.draft}
          onChange={(event) => setSearch({ ...search, draft: event.target.value })}
        />
        <Button type="submit">Search</Button>
      </form>
      <div className="chips" role="group" aria-label="Order status">
        {ORDER_FILTERS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={status === value ? 'chip active' : 'chip'}
            aria-pressed={status === value}
            onClick={() => {
              setParams(value ? { status: value } : {})
              setSearch((current) => ({ ...current, page: 1 }))
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <QueryView query={query}>
        {(page) =>
          page.items.length === 0 ? (
            <EmptyState title="No orders match" />
          ) : (
            <>
              <div className="table-wrap card">
                <table>
                  <thead>
                    <tr>
                      <th scope="col">Item</th>
                      <th scope="col">Price</th>
                      <th scope="col">Seller</th>
                      <th scope="col">Buyer</th>
                      <th scope="col">Date</th>
                      <th scope="col">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {page.items.map((order) => (
                      <tr key={order.id}>
                        <td>
                          <button type="button" className="row-button" onClick={() => setSelected(order)}>
                            <span className="thumb thumb-sm">
                              <ListingImage src={order.imageUrls[0]} alt="" />
                            </span>
                            <span>
                              <strong>{order.title}</strong>
                              <span className="muted">{order.category}</span>
                            </span>
                          </button>
                        </td>
                        <td>{formatPrice(order.price, order.currency)}</td>
                        <td>
                          <UserLink user={order.seller} />
                        </td>
                        <td>
                          <UserLink user={order.buyer} />
                        </td>
                        <td>{formatDate(order.paidAt ?? order.createdAt)}</td>
                        <td>
                          <span className={`badge order-${order.status.toLowerCase()}`}>
                            {ORDER_STATUS_LABELS[order.status]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="muted">{page.total} orders in total. Click an item to see it as it was sold.</p>
              <Pagination page={page.page} totalPages={page.totalPages} onChange={(next) => setSearch({ ...search, page: next })} />
            </>
          )
        }
      </QueryView>
      {selected && <OrderDetails order={selected} onClose={() => setSelected(null)} />}
    </>
  )
}

const TRANSPORT_LABELS = {
  brevo: 'Brevo (HTTPS API)',
  smtp: 'SMTP server',
  log: 'Not configured: messages are only written to the server log',
}

function System() {
  const query = useQuery({ queryKey: [...adminKey, 'system'], queryFn: adminApi.system })
  const test = useMutation({ mutationFn: adminApi.sendTestEmail, meta: { silent: true } })

  return (
    <QueryView query={query}>
      {(system) => (
        <div className="card form">
          <h2>E-mail</h2>
          <dl className="definition">
            <div>
              <dt>Delivery</dt>
              <dd>{TRANSPORT_LABELS[system.mail.transport]}</dd>
            </div>
            <div>
              <dt>Sender address</dt>
              <dd>{system.mail.sender}</dd>
            </div>
            <div>
              <dt>Last failed delivery</dt>
              <dd>
                {system.mail.lastFailure
                  ? `${timeAgo(system.mail.lastFailure.at)}: ${system.mail.lastFailure.message}`
                  : 'None since the server started'}
              </dd>
            </div>
            <div>
              <dt>Sign-up confirmation</dt>
              <dd>
                {system.autoVerifyEmail
                  ? 'Off: new accounts are confirmed automatically, so no confirmation e-mail is sent'
                  : 'On: new accounts get a confirmation e-mail'}
              </dd>
            </div>
          </dl>
          <div className="row">
            <Button variant="primary" busy={test.isPending} onClick={() => test.mutate()}>
              Send a test e-mail to myself
            </Button>
          </div>
          {test.isSuccess && (
            <p className="notice" role="status">
              The provider accepted a message for {test.data.sentTo}. Check the inbox and the spam folder.
            </p>
          )}
          {test.isError && (
            <p className="form-error" role="alert">
              {errorMessage(test.error)}
            </p>
          )}
        </div>
      )}
    </QueryView>
  )
}

export default function Admin() {
  useDocumentTitle('Administration')
  return (
    <>
      <h1>Administration</h1>
      <nav className="tabs" aria-label="Administration sections">
        <NavLink to="/admin" end>
          Statistics
        </NavLink>
        <NavLink to="/admin/orders">Orders</NavLink>
        <NavLink to="/admin/moderation">Moderation</NavLink>
        <NavLink to="/admin/reports">Reports</NavLink>
        <NavLink to="/admin/users">Users</NavLink>
        <NavLink to="/admin/audit">Audit log</NavLink>
        <NavLink to="/admin/system">System</NavLink>
      </nav>
      <div className="stack">
        <Routes>
          <Route index element={<Statistics />} />
          <Route path="orders" element={<Orders />} />
          <Route path="moderation" element={<Moderation />} />
          <Route path="reports" element={<Reports />} />
          <Route path="users" element={<Users />} />
          <Route path="audit" element={<AuditLog />} />
          <Route path="system" element={<System />} />
        </Routes>
      </div>
    </>
  )
}
