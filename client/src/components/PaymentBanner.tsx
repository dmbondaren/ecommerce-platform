import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { orderApi } from '../api/endpoints'
import type { Purchase } from '../api/types'
import { useAuth } from '../app/auth'
import { keys } from '../app/queryClient'
import { toast } from '../app/toast'
import { formatCountdown, formatPrice } from '../lib/format'
import { Icon } from './Icon'
import { Button, Modal } from './ui'
import { t } from '../app/i18n'

/** Re-renders once a second while `active`, and returns the current time. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!active) return
    const timer = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(timer)
  }, [active])
  return now
}

export const isAwaitingPayment = (order: Purchase, now: number) =>
  order.status === 'PENDING_PAYMENT' && order.expiresAt !== null && new Date(order.expiresAt).getTime() > now

export function PaymentDetailsDialog({ order, onClose }: { order: Purchase; onClose: () => void }) {
  const payment = order.payment
  const copy = (value: string) => {
    navigator.clipboard?.writeText(value).then(
      () => toast.success(t('Copied')),
      () => toast.error(t('Could not copy. Please select the text instead.')),
    )
  }
  const rows: [string, string][] = payment
    ? [
        ['Amount', formatPrice(payment.amount, payment.currency)],
        ['Recipient', payment.recipient],
        ['IBAN', payment.iban],
        ['Reference', payment.reference ?? order.id],
      ]
    : []
  return (
    <Modal title={t('Payment details')} onClose={onClose}>
      <div className="modal-body">
        <p>
          {t('Transfer the amount for')} <strong>{order.title}</strong> {t('with your banking app, then press “I have paid”. The same details were sent to your e-mail address.')}
        </p>
        <dl className="payment-details">
          {rows.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>
                {value}
                <button type="button" className="link" onClick={() => copy(value)}>
                  {t('Copy')}
                </button>
              </dd>
            </div>
          ))}
        </dl>
        <p className="muted">
          {t('This is a demonstration project: no real payment is processed and you should not send money.')}
        </p>
      </div>
      <footer className="modal-footer">
        <Button onClick={onClose}>{t('Close')}</Button>
      </footer>
    </Modal>
  )
}

/** Confirm and cancel actions of a reservation, shared by the banner and the purchases page. */
export function usePaymentActions() {
  const client = useQueryClient()
  const refresh = () => client.invalidateQueries()
  const confirm = useMutation({
    mutationFn: orderApi.confirmPayment,
    onSuccess: () => toast.success(t('Payment confirmed. The seller has been notified.')),
    onSettled: refresh,
  })
  const cancel = useMutation({
    mutationFn: orderApi.cancel,
    onSuccess: () => toast.info(t('Reservation cancelled. The item is on sale again.')),
    onSettled: refresh,
  })
  return { confirm, cancel }
}

/**
 * Shown under the header while the user has an unpaid reservation: what is
 * reserved, how long is left, and the button that completes the purchase.
 * The bar shrinks from edge to edge as the time runs out.
 */
export function PaymentBanner() {
  const { user } = useAuth()
  const client = useQueryClient()
  const purchases = useQuery({ queryKey: keys.purchases, queryFn: orderApi.purchases, enabled: Boolean(user) })
  const hasPending = purchases.data?.some((order) => order.status === 'PENDING_PAYMENT') ?? false
  const now = useNow(hasPending)
  const { confirm } = usePaymentActions()
  const [showDetails, setShowDetails] = useState(false)

  const pending = (purchases.data ?? [])
    .filter((order) => isAwaitingPayment(order, now))
    .sort((a, b) => (a.expiresAt ?? '').localeCompare(b.expiresAt ?? ''))
  const order = pending[0]

  // When a countdown reaches zero the server releases the item; fetch the result.
  const stale = hasPending && pending.length === 0
  useEffect(() => {
    if (!stale) return
    const timer = setTimeout(() => void client.invalidateQueries(), 2000)
    return () => clearTimeout(timer)
  }, [stale, client])

  if (!order?.expiresAt) return null
  const end = new Date(order.expiresAt).getTime()
  const total = Math.max(1, end - new Date(order.createdAt).getTime())
  const left = end - now
  const urgent = left < 2 * 60_000

  return (
    <section className={urgent ? 'pay-banner urgent' : 'pay-banner'} aria-label={t('Payment reminder')}>
      <div className="container pay-banner-inner">
        <Icon name="clock" />
        <p>
          <strong>{order.title}</strong> {t('is reserved for you. Pay')} {formatPrice(order.price, order.currency)} {t('within')}{' '}
          <strong className="countdown" role="timer">
            {formatCountdown(left)}
          </strong>
          {pending.length > 1 && (
            <>
              {' '}
              · <Link to="/account/purchases">{pending.length - 1} {t('more waiting')}</Link>
            </>
          )}
        </p>
        <div className="row">
          <Button size="sm" onClick={() => setShowDetails(true)}>
            {t('Payment details')}
          </Button>
          <Button size="sm" variant="primary" busy={confirm.isPending} onClick={() => confirm.mutate(order.id)}>
            {t('I have paid')}
          </Button>
        </div>
      </div>
      <div className="pay-progress" aria-hidden="true">
        <span style={{ width: `${Math.min(100, (left / total) * 100)}%` }} />
      </div>
      {showDetails && <PaymentDetailsDialog order={order} onClose={() => setShowDetails(false)} />}
    </section>
  )
}
