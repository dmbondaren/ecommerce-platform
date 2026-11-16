import { useState } from 'react'
import { errorMessage } from '../api/client'
import { authApi } from '../api/endpoints'
import { useAuth } from '../app/auth'
import { t } from '../app/i18n'
import { toast } from '../app/toast'
import { Button } from './ui'

/**
 * Sends the confirmation e-mail again, wherever the user is told that the
 * address is not confirmed yet. Says where it went and where to look for it.
 */
export function ResendVerification({ compact = false }: { compact?: boolean }) {
  const { user } = useAuth()
  const [state, setState] = useState<'idle' | 'sending' | 'sent'>('idle')

  const resend = async () => {
    setState('sending')
    try {
      await authApi.resendVerification()
      setState('sent')
    } catch (error) {
      setState('idle')
      toast.error(errorMessage(error))
    }
  }

  if (state === 'sent') {
    return (
      <span className="resend" role="status">
        {t('Sent to {email}. If it is not in your inbox within a minute, look in the spam folder.', { email: user?.email ?? '' })}
      </span>
    )
  }
  return (
    <span className="resend">
      {compact ? (
        <button type="button" className="link" disabled={state === 'sending'} onClick={() => void resend()}>
          {t('Send the confirmation e-mail again')}
        </button>
      ) : (
        <Button variant="primary" busy={state === 'sending'} onClick={() => void resend()}>
          {t('Send the confirmation e-mail again')}
        </Button>
      )}
      {!compact && <span className="muted">{t('The e-mail may land in the spam folder.')}</span>}
    </span>
  )
}
