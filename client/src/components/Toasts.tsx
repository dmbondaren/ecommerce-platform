import { Link } from 'react-router-dom'
import { dismissToast, useToasts } from '../app/toast'
import { Icon } from './Icon'
import { t } from '../app/i18n'

export function Toasts() {
  const toasts = useToasts()
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((item) => (
        <div key={item.id} className={`toast toast-${item.kind}`} role={item.kind === 'error' || item.kind === 'alert' ? 'alert' : 'status'}>
          {item.kind === 'alert' && <Icon name="bell" size={20} />}
          {item.link ? (
            <Link to={item.link} onClick={() => dismissToast(item.id)}>
              {item.message}
            </Link>
          ) : (
            <span>{item.message}</span>
          )}
          <button type="button" className="icon-btn" onClick={() => dismissToast(item.id)} aria-label={t('Dismiss')}>
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}
