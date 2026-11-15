import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type FormEvent } from 'react'
import { useParams } from 'react-router-dom'
import { userApi } from '../api/endpoints'
import type { Review, VoteType } from '../api/types'
import { useAuth } from '../app/auth'
import { useDocumentTitle, useRequireLogin, useSavedListings } from '../app/hooks'
import { Icon } from '../components/Icon'
import { ListingGrid } from '../components/ListingCard'
import { ProfileCharts } from '../components/ProfileCharts'
import { Avatar, Button, EmptyState, QueryView, Stars, UserLink } from '../components/ui'
import { formatDate, formatPrice, timeAgo } from '../lib/format'
import { t } from '../app/i18n'

function ReviewCard({ review, sellerId }: { review: Review; sellerId: string }) {
  const { user } = useAuth()
  const client = useQueryClient()
  const requireLogin = useRequireLogin()
  const [reply, setReply] = useState('')
  const refresh = () => client.invalidateQueries({ queryKey: ['users', sellerId, 'reviews'] })

  const vote = useMutation({
    mutationFn: (type: VoteType) => userApi.vote(review.id, review.myVote === type ? null : type),
    onSuccess: refresh,
  })
  const sendReply = useMutation({
    mutationFn: () => userApi.reply(review.id, reply.trim()),
    onSuccess: () => {
      setReply('')
      return refresh()
    },
  })
  const canReply = user && (user.id === sellerId || user.id === review.author.id)
  const canVote = user?.id !== review.author.id

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (reply.trim()) sendReply.mutate()
  }

  return (
    <li className="card review">
      <header className="review-header">
        <UserLink user={review.author} />
        <Stars value={review.rating} />
        <span className="muted">{timeAgo(review.createdAt)}</span>
      </header>
      <p className="muted">
        {t('Bought:')} {review.item.title} · {formatPrice(review.item.price, review.item.currency)}
      </p>
      {review.comment && <p className="prose">{review.comment}</p>}
      {(review.pros || review.cons) && (
        <dl className="pros-cons">
          {review.pros && (
            <div>
              <dt>{t('Liked')}</dt>
              <dd>{review.pros}</dd>
            </div>
          )}
          {review.cons && (
            <div>
              <dt>{t('Could be better')}</dt>
              <dd>{review.cons}</dd>
            </div>
          )}
        </dl>
      )}
      {canVote && (
        <div className="row">
          <button
            type="button"
            className={review.myVote === 'LIKE' ? 'vote active' : 'vote'}
            aria-pressed={review.myVote === 'LIKE'}
            aria-label={`Helpful (${review.likes})`}
            onClick={() => requireLogin(() => vote.mutate('LIKE'))}
          >
            <Icon name="thumb" size={16} /> {review.likes}
          </button>
          <button
            type="button"
            className={review.myVote === 'DISLIKE' ? 'vote active' : 'vote'}
            aria-pressed={review.myVote === 'DISLIKE'}
            aria-label={`Not helpful (${review.dislikes})`}
            onClick={() => requireLogin(() => vote.mutate('DISLIKE'))}
          >
            <Icon name="thumb" size={16} className="flip" /> {review.dislikes}
          </button>
        </div>
      )}
      {review.replies.length > 0 && (
        <ul className="replies">
          {review.replies.map((item) => (
            <li key={item.id}>
              <strong>{item.author.nickname}</strong> <span className="muted">{timeAgo(item.createdAt)}</span>
              <p>{item.body}</p>
            </li>
          ))}
        </ul>
      )}
      {canReply && (
        <form className="reply-form" onSubmit={submit}>
          <input
            aria-label={t('Reply to this review')}
            placeholder={t('Write a reply')}
            maxLength={1000}
            value={reply}
            onChange={(event) => setReply(event.target.value)}
          />
          <Button type="submit" size="sm" busy={sendReply.isPending} disabled={!reply.trim()}>
            {t('Reply')}
          </Button>
        </form>
      )}
    </li>
  )
}

export function UserProfile() {
  const { id = '' } = useParams()
  const [tab, setTab] = useState<'listings' | 'reviews'>('listings')
  const profile = useQuery({ queryKey: ['users', id], queryFn: () => userApi.profile(id) })
  const listings = useQuery({ queryKey: ['users', id, 'listings'], queryFn: () => userApi.listings(id) })
  const reviews = useQuery({ queryKey: ['users', id, 'reviews'], queryFn: () => userApi.reviews(id) })
  const saved = useSavedListings()
  useDocumentTitle(profile.data?.nickname)

  return (
    <QueryView query={profile}>
      {(user) => (
        <>
          <header className="profile-header card">
            <Avatar user={user} size={72} />
            <div>
              <h1>
                {user.nickname}
                {user.isStaff && <span className="badge badge-accent">{t('Staff')}</span>}
              </h1>
              <p className="muted">
                {t('Member since')} {formatDate(user.memberSince)}
                {user.isVerified && ` · ${t('e-mail confirmed')}`}
              </p>
              {(user.area || user.phone) && (
                <p className="meta">
                  {user.area && (
                    <span>
                      <Icon name="pin" size={16} /> {user.area}
                    </span>
                  )}
                  {user.phone && (
                    <a className="link" href={`tel:${user.phone}`}>
                      {user.phone}
                    </a>
                  )}
                </p>
              )}
            </div>
            <dl className="stats">
              <div>
                <dt>{t('Rating')}</dt>
                <dd>{user.stats.rating === null ? '—' : user.stats.rating.toFixed(1)}</dd>
              </div>
              <div>
                <dt>{t('Reviews')}</dt>
                <dd>{user.stats.reviewCount}</dd>
              </div>
              <div>
                <dt>{t('Sold')}</dt>
                <dd>{user.stats.sales}</dd>
              </div>
            </dl>
          </header>

          <ProfileCharts userId={id} />

          <div className="tabs" role="tablist">
            <button type="button" role="tab" aria-selected={tab === 'listings'} onClick={() => setTab('listings')}>
              {t('Listings (')}{user.stats.activeListings})
            </button>
            <button type="button" role="tab" aria-selected={tab === 'reviews'} onClick={() => setTab('reviews')}>
              {t('Reviews (')}{user.stats.reviewCount})
            </button>
          </div>

          {tab === 'listings' ? (
            <QueryView query={listings} empty={<EmptyState title={t('No active listings')} />}>
              {(items) => (
                <ListingGrid listings={items} favoriteIds={saved.favoriteIds} onToggleFavorite={saved.toggleFavorite} />
              )}
            </QueryView>
          ) : (
            <QueryView query={reviews} empty={<EmptyState title={t('No reviews yet')} />}>
              {(items) => (
                <ul className="stack">
                  {items.map((review) => (
                    <ReviewCard key={review.id} review={review} sellerId={id} />
                  ))}
                </ul>
              )}
            </QueryView>
          )}
        </>
      )}
    </QueryView>
  )
}
