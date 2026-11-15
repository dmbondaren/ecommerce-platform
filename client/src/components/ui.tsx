import { useEffect, useId, useRef, type ButtonHTMLAttributes, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ApiError, errorMessage } from '../api/client'
import type { PublicUser } from '../api/types'
import { pageWindow } from '../lib/format'
import { Icon, type IconName } from './Icon'
import { t } from '../app/i18n'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  size?: 'sm' | 'md'
  busy?: boolean
  icon?: IconName
}

export function Button({ variant = 'secondary', size = 'md', busy, icon, children, className, ...rest }: ButtonProps) {
  return (
    <button
      type="button"
      {...rest}
      className={`btn btn-${variant} btn-${size} ${className ?? ''}`}
      disabled={rest.disabled || busy}
      aria-busy={busy || undefined}
    >
      {busy ? <span className="spinner spinner-sm" /> : icon ? <Icon name={icon} size={18} /> : null}
      {children}
    </button>
  )
}

export const Spinner = ({ label = 'Loading' }: { label?: string }) => (
  <div className="state" role="status">
    <span className="spinner" />
    <span className="sr-only">{label}</span>
  </div>
)

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="state">
      <h3>{title}</h3>
      {children && <div className="muted">{children}</div>}
    </div>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const notFound = error instanceof ApiError && error.status === 404
  return (
    <div className="state" role="alert">
      <h3>{notFound ? t('Not found') : t('This could not be loaded')}</h3>
      <p className="muted">{notFound ? t('It may have been removed, or the link is wrong.') : errorMessage(error)}</p>
      {onRetry && !notFound && <Button onClick={onRetry}>{t('Try again')}</Button>}
    </div>
  )
}

interface QueryLike<T> {
  data: T | undefined
  error: unknown
  isPending: boolean
  refetch: () => unknown
}

/** Renders the loading, error and empty states of a query, and the data otherwise. */
export function QueryView<T>({
  query,
  empty,
  children,
}: {
  query: QueryLike<T>
  empty?: ReactNode
  children: (data: T) => ReactNode
}) {
  if (query.data === undefined) {
    if (query.isPending) return <Spinner />
    return <ErrorState error={query.error} onRetry={() => void query.refetch()} />
  }
  if (empty && Array.isArray(query.data) && query.data.length === 0) return <>{empty}</>
  return <>{children(query.data)}</>
}

interface FieldProps {
  label: string
  /** Server-side validation messages for this field. */
  errors?: string[]
  hint?: string
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby': string | undefined }) => ReactNode
}

export function Field({ label, errors, hint, children }: FieldProps) {
  const id = useId()
  const invalid = Boolean(errors?.length)
  const noteId = invalid || hint ? `${id}-note` : undefined
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-invalid': invalid, 'aria-describedby': noteId })}
      {invalid ? (
        <p id={noteId} className="field-error">
          {errors?.join('. ')}
        </p>
      ) : (
        hint && (
          <p id={noteId} className="field-hint">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

/** Validation details of a failed request, keyed by field name. */
export const fieldErrors = (error: unknown): Record<string, string[]> =>
  error instanceof ApiError && error.details ? error.details : {}

export function FormError({ error }: { error: unknown }) {
  if (!error) return null
  return (
    <p className="form-error" role="alert">
      {errorMessage(error)}
    </p>
  )
}

export function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    ref.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
      previous?.focus()
    }
  }, [onClose])

  return (
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={ref}>
        <header className="modal-header">
          <h2>{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label={t('Close')}>
            <Icon name="x" />
          </button>
        </header>
        {children}
      </div>
    </div>
  )
}

export function Avatar({ user, size = 36 }: { user: Pick<PublicUser, 'nickname' | 'avatarUrl'> | null; size?: number }) {
  const style = { width: size, height: size, fontSize: size * 0.42 }
  if (user?.avatarUrl) return <img className="avatar" style={style} src={user.avatarUrl} alt="" />
  return (
    <span className="avatar" style={style} aria-hidden="true">
      {(user?.nickname ?? '?').charAt(0).toUpperCase()}
    </span>
  )
}

export function UserLink({ user }: { user: PublicUser | null }) {
  if (!user) return <span className="muted">{t('Deleted account')}</span>
  return (
    <Link to={`/users/${user.id}`} className="user-link">
      <Avatar user={user} size={24} />
      {user.nickname}
      {user.isStaff ? (
        <span className="badge badge-accent">{t('Staff')}</span>
      ) : (
        user.isVerified && <Icon name="check" size={14} className="verified" />
      )}
    </Link>
  )
}

export function Stars({ value, onChange }: { value: number; onChange?: (value: number) => void }) {
  const stars = [1, 2, 3, 4, 5]
  if (!onChange) {
    return (
      <span className="stars" role="img" aria-label={`${value} out of 5`}>
        {stars.map((star) => (
          <Icon key={star} name="star" size={16} filled={star <= Math.round(value)} />
        ))}
      </span>
    )
  }
  return (
    <span className="stars stars-input" role="radiogroup" aria-label={t('Rating')}>
      {stars.map((star) => (
        <button
          key={star}
          type="button"
          role="radio"
          aria-checked={star === value}
          aria-label={`${star} star${star > 1 ? 's' : ''}`}
          onClick={() => onChange(star)}
        >
          <Icon name="star" size={26} filled={star <= value} />
        </button>
      ))}
    </span>
  )
}

export function Pagination({ page, totalPages, onChange }: { page: number; totalPages: number; onChange: (page: number) => void }) {
  if (totalPages <= 1) return null
  return (
    <nav className="pagination" aria-label={t('Pages')}>
      <button type="button" className="icon-btn" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label={t('Previous page')}>
        <Icon name="left" />
      </button>
      {pageWindow(page, totalPages).map((item, index) =>
        item === null ? (
          <span key={`gap-${index}`} className="muted">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            className={item === page ? 'page current' : 'page'}
            aria-current={item === page ? 'page' : undefined}
            onClick={() => onChange(item)}
          >
            {item}
          </button>
        ),
      )}
      <button type="button" className="icon-btn" disabled={page >= totalPages} onClick={() => onChange(page + 1)} aria-label={t('Next page')}>
        <Icon name="right" />
      </button>
    </nav>
  )
}

export function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="page-header">
      <h1>{title}</h1>
      {children}
    </header>
  )
}
