import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { adminApi, chatApi, listingApi, orderApi } from '../api/endpoints'
import type { Listing } from '../api/types'
import { useAuth } from '../app/auth'
import { useDocumentTitle, useRequireLogin, useSavedListings } from '../app/hooks'
import { keys } from '../app/queryClient'
import { toast } from '../app/toast'
import { ConfirmDialog, ReasonDialog } from '../components/dialogs'
import { Icon } from '../components/Icon'
import { ListingImage } from '../components/ListingCard'
import { Button, QueryView, UserLink } from '../components/ui'
import { formatDate, formatPrice, STATUS_LABELS } from '../lib/format'

function Gallery({ images, title }: { images: string[]; title: string }) {
  const [index, setIndex] = useState(0)
  const current = images[Math.min(index, images.length - 1)]
  return (
    <div className="gallery">
      <div className="gallery-main">
        <ListingImage src={current} alt={title} />
      </div>
      {images.length > 1 && (
        <div className="gallery-thumbs">
          {images.map((url, position) => (
            <button
              key={url}
              type="button"
              className={position === index ? 'active' : undefined}
              onClick={() => setIndex(position)}
              aria-label={`Photo ${position + 1} of ${images.length}`}
              aria-current={position === index}
            >
              <img src={url} alt="" loading="lazy" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

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
  const relist = useMutation({
    mutationFn: () => listingApi.relist(listing.id),
    onSuccess: () => {
      toast.success('Your listing is active again')
      return refresh()
    },
  })
  const restore = useMutation({
    mutationFn: () => adminApi.activateListing(listing.id),
    onSuccess: () => {
      toast.success('The listing is visible again')
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
              Edit listing
            </Link>
          )}
          {listing.status === 'SOLD' && (
            <Button variant="primary" busy={relist.isPending} onClick={() => relist.mutate()}>
              List again
            </Button>
          )}
          <Button variant="danger" icon="trash" onClick={() => setDialog('delete')}>
            Delete
          </Button>
        </>
      ) : (
        <>
          {listing.status === 'ACTIVE' && (
            <>
              <Button variant="primary" onClick={() => requireLogin(() => setDialog('buy'))}>
                Buy now
              </Button>
              <Button icon="cart" busy={saved.cartBusy} onClick={() => saved.toggleCart(listing.id)}>
                {saved.cartIds.has(listing.id) ? 'Remove from cart' : 'Add to cart'}
              </Button>
            </>
          )}
          <Button icon="chat" busy={message.isPending} onClick={() => requireLogin(() => message.mutate())}>
            Message seller
          </Button>
          <div className="row">
            <Button
              variant="ghost"
              size="sm"
              icon="heart"
              aria-pressed={saved.favoriteIds.has(listing.id)}
              onClick={() => saved.toggleFavorite(listing.id)}
            >
              {saved.favoriteIds.has(listing.id) ? 'Saved' : 'Save'}
            </Button>
            <Button variant="ghost" size="sm" icon="flag" onClick={() => requireLogin(() => setDialog('report'))}>
              Report
            </Button>
          </div>
        </>
      )}

      {isStaff && !isOwner && (
        <div className="staff-box">
          <p className="eyebrow">Moderation</p>
          <div className="row">
            {(listing.status === 'ACTIVE' || listing.status === 'PENDING_REVIEW') && (
              <Button size="sm" onClick={() => setDialog('takeDown')}>
                Take down
              </Button>
            )}
            {(listing.status === 'DEACTIVATED' || listing.status === 'PENDING_REVIEW') && (
              <Button size="sm" busy={restore.isPending} onClick={() => restore.mutate()}>
                Approve
              </Button>
            )}
            <Button size="sm" variant="danger" onClick={() => setDialog('remove')}>
              Remove
            </Button>
          </div>
        </div>
      )}

      {dialog === 'buy' && (
        <ConfirmDialog
          title="Confirm your purchase"
          confirmLabel={`Buy for ${formatPrice(listing.price, listing.currency)}`}
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await orderApi.checkout([listing.id])
            await client.invalidateQueries()
            toast.success('Purchase confirmed. The seller has been notified.')
            navigate('/account/purchases')
          }}
        >
          <p>
            You are buying <strong>{listing.title}</strong>. The item is reserved for you at once; payment and
            handover are arranged directly with the seller.
          </p>
        </ConfirmDialog>
      )}
      {dialog === 'delete' && (
        <ConfirmDialog
          title="Delete this listing?"
          confirmLabel="Delete listing"
          danger
          onClose={() => setDialog(null)}
          onConfirm={async () => {
            await listingApi.remove(listing.id)
            await refresh()
            toast.success('Listing deleted')
            navigate('/account/listings')
          }}
        >
          <p>“{listing.title}” will disappear from the marketplace. This cannot be undone.</p>
        </ConfirmDialog>
      )}
      {dialog === 'report' && (
        <ReasonDialog
          title="Report this listing"
          label="What is wrong with it?"
          hint="At least 10 characters. Our moderators read every report."
          minLength={10}
          confirmLabel="Send report"
          onClose={() => setDialog(null)}
          onSubmit={async (reason) => {
            await listingApi.report(listing.id, reason, [])
            toast.success('Thank you. Our team will look into it.')
          }}
        />
      )}
      {dialog === 'takeDown' && (
        <ReasonDialog
          title="Take this listing down"
          hint="The seller sees this reason and can edit the listing to have it reviewed again."
          confirmLabel="Take down"
          onClose={() => setDialog(null)}
          onSubmit={async (reason) => {
            await adminApi.deactivateListing(listing.id, reason)
            await refresh()
          }}
        />
      )}
      {dialog === 'remove' && (
        <ReasonDialog
          title="Remove this listing permanently"
          hint="The seller is told why. This cannot be undone."
          confirmLabel="Remove listing"
          danger
          onClose={() => setDialog(null)}
          onSubmit={async (reason) => {
            await adminApi.removeListing(listing.id, reason)
            await refresh()
            navigate('/admin')
          }}
        />
      )}
    </div>
  )
}

export function ListingDetail() {
  const { id = '' } = useParams()
  const { user } = useAuth()
  const query = useQuery({ queryKey: keys.listing(id), queryFn: () => listingApi.get(id) })
  useDocumentTitle(query.data?.title)

  const userId = user?.id
  useEffect(() => {
    // Feeds the view counter and the browsing history; not worth an error message.
    if (userId) listingApi.recordView(id).catch(() => undefined)
  }, [id, userId])

  return (
    <QueryView query={query}>
      {(listing) => (
        <article className="detail">
          <Gallery key={listing.id} images={listing.imageUrls} title={listing.title} />
          <div className="detail-side">
            {listing.status !== 'ACTIVE' && (
              <div className={listing.status === 'SOLD' ? 'notice' : 'notice notice-warn'} role="status">
                <strong>{STATUS_LABELS[listing.status]}</strong>
                {listing.moderationReason && <span> — {listing.moderationReason}</span>}
              </div>
            )}
            <p className="eyebrow">{listing.category.name}</p>
            <h1>{listing.title}</h1>
            <p className="price price-lg">{formatPrice(listing.price, listing.currency)}</p>
            <p className="meta">
              {listing.location && (
                <span>
                  <Icon name="pin" size={16} /> {listing.location}
                </span>
              )}
              <span>Listed {formatDate(listing.createdAt)}</span>
              <span>
                <Icon name="eye" size={16} /> {listing.viewCount}
              </span>
            </p>
            <Actions listing={listing} />
            <div className="card seller-card">
              <p className="eyebrow">Seller</p>
              <UserLink user={listing.owner} />
              <p className="muted">Member since {formatDate(listing.owner.memberSince)}</p>
              {listing.phone && user && (
                <a className="link" href={`tel:${listing.phone}`}>
                  {listing.phone}
                </a>
              )}
            </div>
          </div>
          <section className="detail-description">
            <h2>Description</h2>
            <p className="prose">{listing.description}</p>
          </section>
        </article>
      )}
    </QueryView>
  )
}
