import { IListing } from '../models/IListing'
import ActionButton from './ActionButton'

type ListingTileProps = {
  listing: IListing
  priceText: (listing: IListing) => string
  onOpen: (id: string) => void
}

export default function ListingTile({ listing, priceText, onOpen }: ListingTileProps) {
  return (
    <ActionButton className='tile' onClick={() => onOpen(listing._id)}>
      <img src={listing.imageUrl} alt={listing.title}/>
      <h3>{listing.title}</h3>
      <p>{priceText(listing)}</p>
      <small>{new Date(listing.createdAt || '').toLocaleDateString()}</small>
    </ActionButton>
  )
}
