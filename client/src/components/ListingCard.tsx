import { Link } from 'react-router-dom'
import type { Listing } from '../api/types'
import { formatPrice, STATUS_LABELS, timeAgo } from '../lib/format'
import { Icon } from './Icon'

interface Props {
  listing: Listing
  favorite?: boolean
  onToggleFavorite?: (id: string) => void
}

export function ListingImage({ src, alt }: { src: string | undefined | null; alt: string }) {
  if (!src) {
    return (
      <div className="image-placeholder" role="img" aria-label="No photo">
        <Icon name="image" size={32} />
      </div>
    )
  }
  return <img src={src} alt={alt} loading="lazy" />
}

export function ListingCard({ listing, favorite = false, onToggleFavorite }: Props) {
  return (
    <article className="card listing-card">
      <Link to={`/listings/${listing.id}`} className="listing-card-media" tabIndex={-1} aria-hidden="true">
        <ListingImage src={listing.imageUrls[0]} alt="" />
        {listing.status !== 'ACTIVE' && <span className="badge badge-overlay">{STATUS_LABELS[listing.status]}</span>}
      </Link>
      {onToggleFavorite && (
        <button
          type="button"
          className={favorite ? 'favorite-btn active' : 'favorite-btn'}
          onClick={() => onToggleFavorite(listing.id)}
          aria-pressed={favorite}
          aria-label={favorite ? 'Remove from favourites' : 'Save to favourites'}
        >
          <Icon name="heart" size={18} filled={favorite} />
        </button>
      )}
      <div className="listing-card-body">
        <p className="price">{formatPrice(listing.price, listing.currency)}</p>
        <h3>
          <Link to={`/listings/${listing.id}`}>{listing.title}</Link>
        </h3>
        <p className="meta">
          {listing.location ? `${listing.location} · ` : ''}
          {timeAgo(listing.createdAt)}
        </p>
      </div>
    </article>
  )
}

export function ListingGrid({
  listings,
  favoriteIds,
  onToggleFavorite,
}: {
  listings: Listing[]
  favoriteIds?: Set<string>
  onToggleFavorite?: (id: string) => void
}) {
  return (
    <div className="grid">
      {listings.map((listing) => (
        <ListingCard
          key={listing.id}
          listing={listing}
          favorite={favoriteIds?.has(listing.id)}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
    </div>
  )
}
