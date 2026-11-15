import { Suspense, useRef, useState, type FormEvent } from 'react'
import { errorMessage } from '../api/client'
import { accountApi } from '../api/endpoints'
import type { Coordinates } from '../api/types'
import { useAuth } from '../app/auth'
import { toast } from '../app/toast'
import { geocode, LazyMap, reverseGeocode } from './LocationPicker'
import { Button, Field, FormError, Modal, Spinner } from './ui'
import { t } from '../app/i18n'

export interface HomeValue {
  address: string
  coordinates: Coordinates | null
}

/**
 * Address field with a map: typing an address and pressing "Find" places the
 * flag, and placing the flag by hand fills in the address.
 */
export function HomeAddressFields({ value, onChange }: { value: HomeValue; onChange: (value: HomeValue) => void }) {
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const lastPick = useRef(0)
  // The latest value, for answers that arrive after the user typed on.
  const latest = useRef(value)
  latest.current = value

  const find = async () => {
    if (!value.address.trim()) {
      setMessage(t('Type your address first, e.g. “Bahnhofstrasse 1, Zürich”.'))
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const found = await geocode(value.address)
      if (found) onChange({ ...latest.current, coordinates: found })
      else setMessage(t('This address was not found. Click on the map to mark the place yourself.'))
    } catch {
      setMessage(t('The address search is not available right now. Click on the map to mark the place yourself.'))
    } finally {
      setBusy(false)
    }
  }

  const pick = (coordinates: Coordinates) => {
    onChange({ ...latest.current, coordinates })
    const pickId = ++lastPick.current
    reverseGeocode(coordinates)
      .then((address) => {
        if (address && pickId === lastPick.current) onChange({ address, coordinates })
      })
      .catch(() => undefined)
  }

  return (
    <>
      <Field label={t('Home address')} hint={message ?? t('Only you can see it. It is used to find listings near you.')}>
        {(props) => (
          <div className="input-row">
            <input
              {...props}
              maxLength={160}
              autoComplete="street-address"
              placeholder={t('Street and number, town')}
              value={value.address}
              onChange={(event) => onChange({ ...value, address: event.target.value })}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault()
                  void find()
                }
              }}
            />
            <Button busy={busy} onClick={() => void find()}>
              {t('Find')}
            </Button>
          </div>
        )}
      </Field>
      <Suspense fallback={<Spinner label={t('Loading the map')} />}>
        <LazyMap position={value.coordinates} onChange={pick} />
      </Suspense>
    </>
  )
}

/** Saves the home address of the signed-in user and updates the session. */
export function useSaveHome() {
  const { setUser } = useAuth()
  return async (value: HomeValue | null) => {
    const account = await accountApi.update(
      value
        ? { homeAddress: value.address.trim() || null, homeCoordinates: value.coordinates }
        : { homeAddress: null, homeCoordinates: null },
    )
    setUser(account)
    return account
  }
}

/**
 * Asks for the home address the first time someone searches nearby. It is an
 * offer, not a gate: closing it asks once whether to skip, and skipping is fine.
 */
export function HomeAddressPrompt({ onSaved, onClose }: { onSaved: () => void; onClose: () => void }) {
  const { user } = useAuth()
  const save = useSaveHome()
  // With an address on file this is an edit: it starts from the saved one and can simply be cancelled.
  const editing = Boolean(user?.homeCoordinates)
  const [value, setValue] = useState<HomeValue>({
    address: user?.homeAddress ?? '',
    coordinates: user?.homeCoordinates ?? null,
  })
  const dismiss = editing ? onClose : () => setConfirmingSkip(true)
  const [confirmingSkip, setConfirmingSkip] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (!value.coordinates) {
      setError(new Error(t('Press “Find” or click on the map so we know where the address is.')))
      return
    }
    setBusy(true)
    setError(null)
    try {
      await save(value)
      toast.success(editing ? 'Address changed' : 'Home address saved')
      onSaved()
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  if (confirmingSkip) {
    return (
      <Modal title={t('Skip the address?')} onClose={onClose}>
        <div className="modal-body">
          <p>{t('Without it we cannot show what is near you. You can add it any time under “My account”.')}</p>
        </div>
        <footer className="modal-footer">
          <Button onClick={() => setConfirmingSkip(false)}>{t('Go back')}</Button>
          <Button variant="primary" onClick={onClose}>
            {t('Yes, skip')}
          </Button>
        </footer>
      </Modal>
    )
  }

  return (
    <Modal title={editing ? t('Search around another address') : t('Where is home?')} onClose={dismiss}>
      <form onSubmit={(event) => void submit(event)}>
        <div className="modal-body">
          <p className="muted">
            {editing
              ? t('Change the address to search around a different place. Cancel keeps the current one.')
              : t('Add your address once to see listings within walking or cycling distance.')}
          </p>
          <HomeAddressFields value={value} onChange={setValue} />
          <FormError error={error} />
        </div>
        <footer className="modal-footer">
          <Button onClick={dismiss}>{editing ? t('Cancel') : t('Not now')}</Button>
          <Button type="submit" variant="primary" busy={busy}>
            {t('Save address')}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}

/** The "Home address" card of the profile page. */
export function HomeAddressSettings() {
  const { user } = useAuth()
  const save = useSaveHome()
  const [value, setValue] = useState<HomeValue>({
    address: user?.homeAddress ?? '',
    coordinates: user?.homeCoordinates ?? null,
  })
  const [busy, setBusy] = useState(false)

  const run = async (next: HomeValue | null) => {
    if (next && !next.coordinates) {
      toast.error(t('Press “Find” or click on the map so we know where the address is.'))
      return
    }
    setBusy(true)
    try {
      await save(next)
      if (!next) setValue({ address: '', coordinates: null })
      toast.success(next ? 'Home address saved' : 'Home address removed')
    } catch (err) {
      toast.error(errorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="card form">
      <h2>{t('Home address')}</h2>
      <p className="muted">{t('Optional. With it, “Near me” on the start page shows listings within 1 to 20 km.')}</p>
      <HomeAddressFields value={value} onChange={setValue} />
      <div className="row">
        <Button variant="primary" busy={busy} onClick={() => void run(value)}>
          {t('Save address')}
        </Button>
        {user?.homeCoordinates && (
          <Button variant="ghost" disabled={busy} onClick={() => void run(null)}>
            {t('Remove')}
          </Button>
        )}
      </div>
    </div>
  )
}
