import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { listingApi, orderApi } from '../api/endpoints'
import type { Listing } from '../api/types'
import { useDocumentTitle, useSavedListings } from '../app/hooks'
import { keys } from '../app/queryClient'
import { toast } from '../app/toast'
import { ConfirmDialog } from '../components/dialogs'
import { ListingImage } from '../components/ListingCard'
import { Button, EmptyState, PageHeader, QueryView } from '../components/ui'
import { formatPrice } from '../lib/format'
import { t } from '../app/i18n'

/** Items may be priced in different currencies, so there is one total per currency. */
export function totalsByCurrency(items: Pick<Listing, 'price' | 'currency'>[]) {
  const totals = new Map<string, number>()
  for (const item of items) totals.set(item.currency, (totals.get(item.currency) ?? 0) + item.price)
  return [...totals].map(([currency, amount]) => formatPrice(Math.round(amount * 100) / 100, currency))
}

export function Cart() {
  useDocumentTitle(t('Cart'))
  const navigate = useNavigate()
  const client = useQueryClient()
  const cart = useQuery({ queryKey: keys.cart, queryFn: listingApi.cart })
  const saved = useSavedListings()
  const [confirming, setConfirming] = useState(false)

  return (
    <div className="narrow">
      <PageHeader title={t('Cart')} />
      <QueryView
        query={cart}
        empty={
          <EmptyState title={t('Your cart is empty')}>
            <Link to="/">{t('Browse the listings')}</Link>
          </EmptyState>
        }
      >
        {(items) => (
          <>
            <ul className="rows card">
              {items.map((item) => (
                <li key={item.id} className="row-item">
                  <Link to={`/listings/${item.id}`} className="thumb">
                    <ListingImage src={item.imageUrls[0]} alt="" />
                  </Link>
                  <div className="row-main">
                    <Link to={`/listings/${item.id}`}>{item.title}</Link>
                    <span className="muted">{t('Sold by')} {item.owner.nickname}</span>
                  </div>
                  <strong>{formatPrice(item.price, item.currency)}</strong>
                  <Button variant="ghost" size="sm" icon="x" onClick={() => saved.toggleCart(item.id)} aria-label={`Remove ${item.title}`} />
                </li>
              ))}
            </ul>
            <div className="summary">
              <span>
                {t('Total:')} <strong>{totalsByCurrency(items).join(' + ')}</strong>
              </span>
              <Button variant="primary" onClick={() => setConfirming(true)}>
                {t('Buy')} {items.length === 1 ? t('this item') : t('{count} items', { count: items.length })}
              </Button>
            </div>
            {confirming && (
              <ConfirmDialog
                title={t('Reserve and pay')}
                confirmLabel={t('Reserve now')}
                onClose={() => setConfirming(false)}
                onConfirm={async () => {
                  await orderApi.checkout(items.map((item) => item.id))
                  await client.invalidateQueries()
                  toast.success(t('Reserved for you. The payment details are in your e-mail and under “Purchases”.'))
                  navigate('/account/purchases')
                }}
              >
                <p>
                  {t('The items will be reserved for you for 15 minutes. You receive the transfer details by e-mail, pay, and confirm each one with “I have paid”. If one of them has just been taken by someone else, nothing is reserved and you can review your cart.')}
                </p>
              </ConfirmDialog>
            )}
          </>
        )}
      </QueryView>
    </div>
  )
}
