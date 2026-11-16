import { useState, type FormEvent, type ReactNode } from 'react'
import { Button, Field, FormError, Modal, fieldErrors } from './ui'
import { t } from '../app/i18n'

interface ConfirmProps {
  title: string
  children?: ReactNode
  confirmLabel: string
  danger?: boolean
  onConfirm: () => Promise<unknown>
  onClose: () => void
}

/** Asks before an action that cannot be undone; stays open and shows the error if it fails. */
export function ConfirmDialog({ title, children, confirmLabel, danger, onConfirm, onClose }: ConfirmProps) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)

  const confirm = async () => {
    setBusy(true)
    setError(null)
    try {
      await onConfirm()
      onClose()
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <div className="modal-body">
        {children}
        <FormError error={error} />
      </div>
      <footer className="modal-footer">
        <Button onClick={onClose}>{t('Cancel')}</Button>
        <Button variant={danger ? 'danger' : 'primary'} busy={busy} onClick={() => void confirm()}>
          {confirmLabel}
        </Button>
      </footer>
    </Modal>
  )
}

interface ReasonProps {
  title: string
  label?: string
  hint?: string
  confirmLabel: string
  danger?: boolean
  minLength?: number
  onSubmit: (reason: string) => Promise<unknown>
  onClose: () => void
}

export function ReasonDialog({
  title,
  label = 'Reason',
  hint,
  confirmLabel,
  danger,
  minLength = 3,
  onSubmit,
  onClose,
}: ReasonProps) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const errors = fieldErrors(error)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSubmit(reason.trim())
      onClose()
    } catch (err) {
      setError(err)
      setBusy(false)
    }
  }

  return (
    <Modal title={title} onClose={onClose}>
      <form onSubmit={(event) => void submit(event)}>
        <div className="modal-body">
          <Field label={label} hint={hint} errors={errors.reason ?? errors.message}>
            {(props) => (
              <textarea
                {...props}
                rows={4}
                required
                minLength={minLength}
                maxLength={1000}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            )}
          </Field>
          {Object.keys(errors).length === 0 && <FormError error={error} />}
        </div>
        <footer className="modal-footer">
          <Button onClick={onClose}>{t('Cancel')}</Button>
          <Button type="submit" variant={danger ? 'danger' : 'primary'} busy={busy}>
            {confirmLabel}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}
