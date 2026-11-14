import { dismissToast, useToasts } from '../app/toast'
import { Icon } from './Icon'

export function Toasts() {
  const toasts = useToasts()
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((item) => (
        <div key={item.id} className={`toast toast-${item.kind}`} role={item.kind === 'error' ? 'alert' : 'status'}>
          <span>{item.message}</span>
          <button type="button" className="icon-btn" onClick={() => dismissToast(item.id)} aria-label="Dismiss">
            <Icon name="x" size={16} />
          </button>
        </div>
      ))}
    </div>
  )
}
