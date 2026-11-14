import { useState, type FormEvent, type ReactNode } from 'react'
import { Button, Field, FormError, Modal, fieldErrors } from './ui'

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
        <Button onClick={onClose}>Cancel</Button>
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
  /** Adds a "number of days" field, e.g. for a temporary suspension. */
  withDays?: boolean
  onSubmit: (reason: string, days: number | null) => Promise<unknown>
  onClose: () => void
}

export function ReasonDialog({
  title,
  label = 'Reason',
  hint,
  confirmLabel,
  danger,
  minLength = 3,
  withDays,
  onSubmit,
  onClose,
}: ReasonProps) {
  const [reason, setReason] = useState('')
  const [days, setDays] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const errors = fieldErrors(error)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await onSubmit(reason.trim(), days ? Number(days) : null)
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
          {withDays && (
            <Field label="Duration in days" hint="Leave empty for a permanent suspension." errors={errors.days}>
              {(props) => (
                <input
                  {...props}
                  type="number"
                  min={1}
                  max={3650}
                  value={days}
                  onChange={(event) => setDays(event.target.value)}
                />
              )}
            </Field>
          )}
          {Object.keys(errors).length === 0 && <FormError error={error} />}
        </div>
        <footer className="modal-footer">
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" variant={danger ? 'danger' : 'primary'} busy={busy}>
            {confirmLabel}
          </Button>
        </footer>
      </form>
    </Modal>
  )
}
