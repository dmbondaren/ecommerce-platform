import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { Link, NavLink, Route, Routes, useNavigate } from 'react-router-dom'
import { adminApi, chatApi } from '../../api/endpoints'
import type { AdminUser, Listing } from '../../api/types'
import { useAuth } from '../../app/auth'
import { useDocumentTitle } from '../../app/hooks'
import { toast } from '../../app/toast'
import { ConfirmDialog, ReasonDialog } from '../../components/dialogs'
import { ListingImage } from '../../components/ListingCard'
import { Button, EmptyState, Pagination, QueryView, UserLink } from '../../components/ui'
import { formatDate, formatPrice, STATUS_LABELS, timeAgo } from '../../lib/format'

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
                  <span className="inline">
                    <span className="muted">Reported by</span> <UserLink user={report.reporter} />
                  </span>
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

export default function Admin() {
  useDocumentTitle('Administration')
  return (
    <>
      <h1>Administration</h1>
      <nav className="tabs" aria-label="Administration sections">
        <NavLink to="/admin" end>
          Moderation
        </NavLink>
        <NavLink to="/admin/reports">Reports</NavLink>
        <NavLink to="/admin/users">Users</NavLink>
        <NavLink to="/admin/audit">Audit log</NavLink>
      </nav>
      <div className="stack">
        <Routes>
          <Route index element={<Moderation />} />
          <Route path="reports" element={<Reports />} />
          <Route path="users" element={<Users />} />
          <Route path="audit" element={<AuditLog />} />
        </Routes>
      </div>
    </>
  )
}
