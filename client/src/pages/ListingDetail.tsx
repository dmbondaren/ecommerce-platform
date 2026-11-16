import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Suspense, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { adminApi, chatApi, listingApi, orderApi } from '../api/endpoints'
import type { Listing } from '../api/types'
import { useAuth } from '../app/auth'
import { usePrices } from '../app/currency'
import { useDocumentTitle, useRequireLogin, useSavedListings } from '../app/hooks'
import { keys } from '../app/queryClient'
import { toast } from '../app/toast'
import { ConfirmDialog, ReasonDialog } from '../components/dialogs'
import { Gallery } from '../components/Gallery'
import { Icon } from '../components/Icon'
import { LazyMap } from '../components/LocationPicker'
import { Button, QueryView, Spinner, UserLink } from '../components/ui'
import { googleMapsUrl } from '../lib/address'
import { formatDate, formatPrice, STATUS_LABELS } from '../lib/format'
import { t } from '../app/i18n'

type Dialog = 'buy' | 'delete' | 'report' | 'takeDown' | 'remove' | null

function Actions({ listing }: { listing: Listing }) {
  const { user, isStaff } = useAuth()
  const navigate = useNavigate()
  const client = useQueryClient()
  const requireLogin = useRequireLogin()
  const saved = useSavedListings()
  const [dialog, setDialog] = useState<Dialog>(null)
  const isOwner = user?.id === listing.owner.id
  const refresh = () => client.invalidateQueries({ queryKey: keys.listings })

  const message = useMutation({
    mutationFn: () => chatApi.openForListing(listing.id),
    onSuccess: (conversation) => navigate(`/messages/${conversation.id}`),
  })
  const restore = useMutation({
    mutationFn: () => adminApi.activateListing(listing.id),
    onSuccess: () => {
      toast.success(t('The listing is visible again'))
      return refresh()
    },
  })

  return (
    <div className="actions">
      {isOwner ? (
        <>
          {(listing.status === 'ACTIVE' || listing.status === 'DEACTIVATED' || listing.status === 'PENDING_REVIEW') && (
            <Link className="btn btn-primary btn-md" to={`/listings/${listing.id}/edit`}>
              <Icon name="edit" size={18} />
              {t('Edit listing')}
            </Link>
          )}
          {listing.status === 'SOLD' && (
<Link className="btn btn-primary btn-md" to={`/sell?from=${listing.id}`}>
              {t('Sell again')}
            </Link>
          )}
          {listing.status !== 'RESERVED' && (
            <Button variant="danger" icon="trash" onClick={() => setDialog('delete')}>
              {t('Delete')}
            </Button>
          )}
        </>
      ) : (
        <>
          {listing.status === 'ACTIVE' && (
            <>
              <Button variant="primary" onClick={() => requireLogin(() => setDialog('buy'))}>
                {t('Buy now')}
              </Button>
              <Button icon="cart" busy={saved.cartBusy} onClick={() => saved.toggleCart(listing.id)}>
                {saved.cartIds.has(listing.id) ? t('Remove from cart') : t('Add to cart')}
              </Button>
            </>
          )}
          {listing.status !== 'ARCHIVED' && (
            <Button icon="chat" busy={message.isPending} onClick={() => requireLogin(() => message.mutate())}>
              {listing.status === 'RESERVED' ? t('Ask the seller') : t('Message seller')}
            </Button>
          )}
          <div className="row">
            <Button
              variant="ghost"
              size="sm"
              icon="heart"
              className={saved.favoriteIds.has(listing.id) ? 'saved' : undefined}
              aria-pressed={saved.favoriteIds.has(listing.id)}
              onClick={() => saved.toggleFavorite(listing.id)}
            >
              {saved.favoriteIds.has(listing.id) ? t('Saved') : t('Save')}
            </Button>
            <Button variant="ghost" size="sm" icon="flag" onClick={() => requireLogin(() => setDialog('report'))}>
              {t('Report')}
            </Button>
          </div>
        </>
      )}

      {isStaff && !isOwner && (
        <div className="staff-box">
          <p className="eyebrow">{t('Moderation')}</p>
          <div className="row">
            {(listing.status === 'ACTIVE' || listing.status === 'PENDING_REVIEW') && (
              <Button size="sm" onClick={() => setDialog('takeDown')}>
                {t('Take down')}
              </Button>
            )}
            {(listing.status === 'DEACTIVATED' || listing.status === 'PENDING_REVIEW') && (
              <Button size="sm" busy={restore.isPending} onClick={() => restore.mutate()}>
                {t('Approve')}
              </Button>
            )}
            {listing.status !== 'RESERVED' && listing.status !== 'SOLD' && listing.status !== 'ARCHIVED' && (
              <Link className="btn btn-secondary btn-sm" to={`/listings/${listing.id}/edit`}>
                {t('Edit')}
              </Link>
            )}
            <Button size="sm" variant="danger" onClick={() => setDialog('remove')}>
              {t('Remove')}
            </Button>
          </div>
        </div>
      )}

      {dialog === 'buy' && (
        <ConfirmDialog
          title={t('Reserve and pay')}
          confirmLabel={t('Reserve for {price}', { price: formatPrice(listing.price, listing.currency) })}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await orderApi.checkout([listing.id])
            await client.invalidateQueries()
            toast.success(t('Reserved for you. The payment details are in your e-mail and under “Purchases”.'))
            navigate('/account/purchases')
          }}
        >
          <p>
            <strong>{listing.title}</strong> {t('will be reserved for you for 15 minutes. You receive the transfer details by e-mail, pay, and confirm with “I have paid”. Without a confirmation in time the item goes back on sale.')}
          </p>
        </ConfirmDialog>
      )}
      {dialog === 'delete' && (
        <ConfirmDialog
          title={t('Delete this listing?')}
          confirmLabel={t('Delete listing')}
          danger
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await listingApi.remove(listing.id)
            await refresh()
            toast.success(t('Listing deleted'))
            navigate('/account/listings')
          }}
        >
          <p>“{listing.title}{t('” will disappear from the marketplace. This cannot be undone.')}</p>
        </ConfirmDialog>
      )}
      {dialog === 'report' && (
        <ReasonDialog
          title={t('Report this listing')}
          label={t('What is wrong with it?')}
          hint={t('At least 10 characters. Our moderators read every report.')}
          minLength={10}
          confirmLabel={t('Send report')}
          onClose={() => setDialog(null)}
          onSubmit={async (reason) => {
            await listingApi.report(listing.id, reason, [])
            // A moderator who files a report should see it in the queue straight away.
            await client.invalidateQueries({ queryKey: ['admin'] })
            toast.success(t('Thank you. Our team will look into it.'))
          }}
        />
      )}
      {dialog === 'takeDown' && (
        <ReasonDialog
          title={t('Take this listing down')}
          hint={t('The seller sees this reason and can edit the listing to have it reviewed again.')}
          confirmLabel={t('Take down')}
          onClose={() => setDialog(null)}
          onSubmit={async (reason) => {
            await adminApi.deactivateListing(listing.id, reason)
            await refresh()
          }}
        />
      )}
      {dialog === 'remove' && (
        <ReasonDialog
          title={t('Remove this listing permanently')}
          hint={t('The seller is told why. This cannot be undone.')}
          confirmLabel={t('Remove listing')}
          danger
          onClose={() => setDialog(null)}
          onSubmit={async (reason) => {
            await adminApi.removeListing(listing.id, reason)
            await refresh()
            navigate('/admin/moderation')
          }}
        />
      )}
    </div>
  )
}

const mapsUrl = (listing: Listing) => googleMapsUrl(listing.location, listing.coordinates)

export function ListingDetail() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const query = useQuery({ queryKey: keys.listing(id), queryFn: () => listingApi.get(id) })
  useDocumentTitle(query.data?.title)
  const prices = usePrices()

  const userId = user?.id
  useEffect(() => {
    // Feeds the view counter and the browsing history; not worth an error message.
    if (userId) listingApi.recordView(id).catch(() => undefined)
  }, [id, userId])

  return (
    <QueryView query={query}>
      {(listing) => {
        const price = prices.show(listing.price, listing.currency)
        return (
        <article className={listing.status === 'RESERVED' || listing.status === 'SOLD' ? 'detail dimmed' : 'detail'}>
          <Gallery key={listing.id} images={listing.imageUrls} title={listing.title} />
          <div className="detail-side">
            {listing.status !== 'ACTIVE' && (
              <div
                className={listing.status === 'SOLD' || listing.status === 'RESERVED' ? 'notice' : 'notice notice-warn'}
                role="status"
              >
                <strong>{t(STATUS_LABELS[listing.status])}</strong>
                {listing.status === 'RESERVED' && (
                  <span> {t('— a buyer is completing the payment. You can still ask the seller about it.')}</span>
                )}
                {listing.moderationReason && <span> — {listing.moderationReason}</span>}
              </div>
            )}
            <p className="eyebrow">{t(listing.category.name)}</p>
            <h1>{listing.title}</h1>
            <p className="price price-lg">
              {price.text}
              {price.original && <span className="price-original">{price.original}</span>}
            </p>
            <p className="meta">
              {listing.location && (
                <span>
                  <Icon name="pin" size={16} /> {listing.location}
                </span>
              )}
              <span>{t('Listed')} {formatDate(listing.createdAt)}</span>
              <span>
                <Icon name="eye" size={16} /> {listing.viewCount}
              </span>
            </p>
            <Actions listing={listing} />
            <div className="card seller-card">
              <p className="eyebrow">{t('Seller')}</p>
              <UserLink user={listing.owner} />
              <p className="muted">{t('Member since')} {formatDate(listing.owner.memberSince)}</p>
              {listing.phone && user && (
                <a className="link" href={`tel:${listing.phone}`}>
                  {listing.phone}
                </a>
              )}
            </div>
          </div>
          <section className="detail-description">
            <h2>{t('Description')}</h2>
            <p className="prose">{listing.description}</p>
            {listing.coordinates && (
              <>
                <h2>{t('Where to find it')}</h2>
                {listing.location && <p className="muted">{listing.location}</p>}
                <Suspense fallback={<Spinner label={t('Loading the map')} />}>
                  <LazyMap position={listing.coordinates} />
                </Suspense>
              </>
            )}
            {mapsUrl(listing) && (
              <a className="btn btn-secondary btn-md map-link" href={mapsUrl(listing) ?? undefined} target="_blank" rel="noreferrer">
                <Icon name="pin" size={18} />
                {t('Open in Google Maps')}
              </a>
            )}
          </section>
        </article>
        )
      }}
    </QueryView>
  )
}
