import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { authApi } from '../api/endpoints'
import { useAuth } from '../app/auth'
import { safeNext, useDocumentTitle } from '../app/hooks'
import { Button, Field, FormError, Spinner, fieldErrors } from '../components/ui'

function AuthCard({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  useDocumentTitle(title)
  return (
    <div className="auth">
      <div className="card auth-card">
        <h1>{title}</h1>
        {children}
      </div>
      {footer && <p className="auth-footer">{footer}</p>}
    </div>
  )
}

/** Shared state of a small form: pending flag, the last error and a submit wrapper. */
function useSubmit(action: () => Promise<void>) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }
  return { busy, error, errors: fieldErrors(error), onSubmit: (event: FormEvent) => void submit(event) }
}

function CredentialsForm({ mode }: { mode: 'login' | 'register' }) {
  const { user, login, register } = useAuth()
  const [params] = useSearchParams()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const next = safeNext(params.get('next'))
  const form = useSubmit(() => (mode === 'login' ? login(email, password) : register(email, password)))

  // Covers both a successful submit and opening the page while already signed in.
  if (user) return <Navigate to={next} replace />
  const query = params.get('next') ? `?next=${encodeURIComponent(next)}` : ''

  return (
    <AuthCard
      title={mode === 'login' ? 'Sign in' : 'Create an account'}
      footer={
        mode === 'login' ? (
          <>
            New here? <Link to={`/register${query}`}>Create an account</Link>
          </>
        ) : (
          <>
            Already registered? <Link to={`/login${query}`}>Sign in</Link>
          </>
        )
      }
    >
      <form className="form" onSubmit={form.onSubmit}>
        {Object.keys(form.errors).length === 0 && <FormError error={form.error} />}
        <Field label="E-mail" errors={form.errors.email}>
          {(props) => (
            <input {...props} type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
          )}
        </Field>
        <Field
          label="Password"
          errors={form.errors.password}
          hint={mode === 'register' ? 'At least 8 characters.' : undefined}
        >
          {(props) => (
            <input
              {...props}
              type="password"
              required
              minLength={mode === 'register' ? 8 : 1}
              maxLength={72}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          )}
        </Field>
        <Button type="submit" variant="primary" busy={form.busy}>
          {mode === 'login' ? 'Sign in' : 'Create account'}
        </Button>
        {mode === 'login' && (
          <Link to="/forgot-password" className="link center">
            Forgot your password?
          </Link>
        )}
      </form>
    </AuthCard>
  )
}

export const Login = () => <CredentialsForm key="login" mode="login" />
export const Register = () => <CredentialsForm key="register" mode="register" />

export function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const form = useSubmit(async () => {
    await authApi.requestPasswordReset(email)
    setSent(true)
  })

  return (
    <AuthCard title="Reset your password" footer={<Link to="/login">Back to sign in</Link>}>
      {sent ? (
        <p role="status">
          If an account exists for <strong>{email}</strong>, a link to choose a new password is on its way. It is
          valid for one hour.
        </p>
      ) : (
        <form className="form" onSubmit={form.onSubmit}>
          <FormError error={form.error} />
          <Field label="E-mail" hint="We will send you a link to choose a new password.">
            {(props) => (
              <input {...props} type="email" required autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
            )}
          </Field>
          <Button type="submit" variant="primary" busy={form.busy}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthCard>
  )
}

export function ResetPassword() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const token = params.get('token') ?? ''
  const [password, setPassword] = useState('')
  const form = useSubmit(async () => {
    await authApi.resetPassword(token, password)
    navigate('/login', { replace: true })
  })

  return (
    <AuthCard title="Choose a new password" footer={<Link to="/login">Back to sign in</Link>}>
      {token ? (
        <form className="form" onSubmit={form.onSubmit}>
          {!form.errors.password && <FormError error={form.error} />}
          <Field label="New password" errors={form.errors.password} hint="At least 8 characters. You will be signed out on all devices.">
            {(props) => (
              <input
                {...props}
                type="password"
                required
                minLength={8}
                maxLength={72}
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
            )}
          </Field>
          <Button type="submit" variant="primary" busy={form.busy}>
            Save password
          </Button>
        </form>
      ) : (
        <p role="alert">This link is incomplete. Please use the link from the e-mail, or request a new one.</p>
      )}
    </AuthCard>
  )
}

export function VerifyEmail() {
  const [params] = useSearchParams()
  const token = params.get('token') ?? ''
  const [state, setState] = useState<'pending' | 'done' | 'failed'>(token ? 'pending' : 'failed')
  // The link is single-use, and React's strict mode runs effects twice in development.
  const started = useRef(false)

  useEffect(() => {
    if (!token || started.current) return
    started.current = true
    authApi
      .verifyEmail(token)
      .then(() => setState('done'))
      .catch(() => setState('failed'))
  }, [token])

  return (
    <AuthCard title="E-mail confirmation">
      {state === 'pending' && <Spinner label="Confirming your e-mail" />}
      {state === 'done' && (
        <>
          <p role="status">Your e-mail address is confirmed. You can publish listings now.</p>
          {/* A full reload picks up the verified state of the account. */}
          <a className="btn btn-primary btn-md" href="/sell">
            Sell an item
          </a>
        </>
      )}
      {state === 'failed' && (
        <p role="alert">This link is invalid or has expired. Sign in and use “Send it again” in the banner at the top.</p>
      )}
    </AuthCard>
  )
}
