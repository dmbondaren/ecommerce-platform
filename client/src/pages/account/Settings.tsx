import { useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { errorMessage } from '../../api/client'
import { accountApi, uploadImages } from '../../api/endpoints'
import type { Currency } from '../../api/types'
import { useAuth } from '../../app/auth'
import { toast } from '../../app/toast'
import { HomeAddressSettings } from '../../components/HomeAddress'
import { Avatar, Button, Field, FormError, fieldErrors } from '../../components/ui'

const CURRENCIES: Currency[] = ['CHF', 'EUR', 'USD', 'UAH']

export function Settings() {
  const { user, setUser, logout } = useAuth()
  const navigate = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)
  const [nickname, setNickname] = useState(user?.nickname ?? '')
  const [phone, setPhone] = useState(user?.phone ?? '')
  const [currency, setCurrency] = useState<Currency>(user?.preferredCurrency ?? 'CHF')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const errors = fieldErrors(error)
  if (!user) return null

  const save = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      setUser(await accountApi.update({ nickname: nickname.trim(), phone: phone.trim() || null, preferredCurrency: currency }))
      toast.success('Profile saved')
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  const changeAvatar = async (file: File | undefined) => {
    if (!file) return
    try {
      const [uploaded] = await uploadImages([file])
      if (uploaded) setUser(await accountApi.update({ avatarUrl: uploaded.url }))
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <>
      <h1>Profile</h1>
      <div className="card form">
        <div className="row">
          <Avatar user={user} size={64} />
          <div>
            <Button size="sm" onClick={() => fileInput.current?.click()}>
              Change photo
            </Button>
            {user.avatarUrl && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() =>
                  void accountApi
                    .update({ avatarUrl: null })
                    .then(setUser)
                    .catch((err: unknown) => toast.error(errorMessage(err)))
                }
              >
                Remove
              </Button>
            )}
          </div>
          <input
            ref={fileInput}
            type="file"
            hidden
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => void changeAvatar(event.target.files?.[0])}
          />
        </div>

        <form className="form" onSubmit={(event) => void save(event)}>
          {Object.keys(errors).length === 0 && <FormError error={error} />}
          <Field label="E-mail" hint={user.isVerified ? 'Confirmed' : 'Not confirmed yet'}>
            {(props) => <input {...props} value={user.email} readOnly />}
          </Field>
          <Field label="Nickname" errors={errors.nickname} hint="3–24 letters, digits, dots, dashes or underscores. Shown on your listings.">
            {(props) => (
              <input {...props} required minLength={3} maxLength={24} value={nickname} onChange={(event) => setNickname(event.target.value)} />
            )}
          </Field>
          <Field label="Phone (optional)" errors={errors.phone}>
            {(props) => <input {...props} type="tel" maxLength={40} value={phone} onChange={(event) => setPhone(event.target.value)} />}
          </Field>
          <Field label="Preferred currency" errors={errors.preferredCurrency}>
            {(props) => (
              <select {...props} value={currency} onChange={(event) => setCurrency(event.target.value as Currency)}>
                {CURRENCIES.map((item) => (
                  <option key={item}>{item}</option>
                ))}
              </select>
            )}
          </Field>
          <div className="row">
            <Button type="submit" variant="primary" busy={busy}>
              Save profile
            </Button>
          </div>
        </form>
      </div>

      <HomeAddressSettings />

      <div className="card form">
        <h2>Security</h2>
        <p className="muted">
          To change your password, <Link to="/forgot-password">request a reset link</Link>. It signs you out on all
          devices.
        </p>
        <div className="row">
          <Button onClick={() => void logout().then(() => navigate('/'))}>Sign out</Button>
          <Link className="btn btn-ghost btn-md" to={`/users/${user.id}`}>
            View my public profile
          </Link>
        </div>
      </div>
    </>
  )
}
