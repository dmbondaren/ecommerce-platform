import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { orderApi } from '../api/endpoints'
import type { Purchase } from '../api/types'
import { useAuth } from '../app/auth'
import { t } from '../app/i18n'
import { keys } from '../app/queryClient'
import { Icon } from './Icon'
import { ReviewDialog } from './ReviewDialog'
import { Button } from './ui'

/** A paid purchase that the buyer has neither reviewed nor declined to review. */
export const awaitsReview = (order: Purchase) =>
  order.status === 'PAID' && order.review === null && !order.reviewSkipped && order.seller !== null

/**
 * Yellow reminder under the header after a purchase. It goes away once the
 * buyer has written the review, or has said they would rather not.
 */
export function ReviewBanner() {
  const { user } = useAuth()
  const client = useQueryClient()
  const purchases = useQuery({ queryKey: keys.purchases, queryFn: orderApi.purchases, enabled: Boolean(user) })
  const [reviewing, setReviewing] = useState<Purchase | null>(null)
  const skip = useMutation({
    mutationFn: orderApi.skipReview,
    onSettled: () => client.invalidateQueries({ queryKey: keys.purchases }),
  })

  const waiting = (purchases.data ?? []).filter(awaitsReview)
  const order = waiting[0]
  if (!order) return reviewing ? <ReviewDialog order={reviewing} onClose={() => setReviewing(null)} /> : null

  return (
    <section className="review-banner" aria-label={t('Review reminder')}>
      <div className="container pay-banner-inner">
        <Icon name="star" filled />
        <p>
          {t('How was your purchase?')} <strong>{order.title}</strong>
          {waiting.length > 1 && ` · +${waiting.length - 1}`}
        </p>
        <div className="row">
          <Button size="sm" variant="primary" onClick={() => setReviewing(order)}>
            {t('Leave a review')}
          </Button>
          <Button size="sm" variant="ghost" busy={skip.isPending} onClick={() => skip.mutate(order.id)}>
            {t('No review')}
          </Button>
        </div>
      </div>
      {reviewing && <ReviewDialog order={reviewing} onClose={() => setReviewing(null)} />}
    </section>
  )
}
