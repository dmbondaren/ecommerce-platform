import type { Coordinates } from '../api/types'

/** The parts of a Nominatim address that matter for a postal-style line. */
export interface AddressParts {
  road?: string
  pedestrian?: string
  footway?: string
  square?: string
  house_number?: string
  postcode?: string
  city?: string
  town?: string
  village?: string
  municipality?: string
  suburb?: string
}

const MAX_LENGTH = 120

/**
 * "Bahnhofstrasse 1, 8001 Zürich" from the structured answer of a reverse
 * geocoder. Falls back to the service's own full description when the place
 * has no street, e.g. a spot in a park.
 */
export function formatAddress(parts: AddressParts | undefined, displayName = ''): string {
  const street = parts?.road ?? parts?.pedestrian ?? parts?.square ?? parts?.footway
  const place = parts?.city ?? parts?.town ?? parts?.village ?? parts?.municipality ?? parts?.suburb
  const first = [street, street ? parts?.house_number : undefined].filter(Boolean).join(' ')
  const second = [parts?.postcode, place].filter(Boolean).join(' ')
  const line = [first, second].filter(Boolean).join(', ') || displayName
  return line.slice(0, MAX_LENGTH).trim()
}

/** Opens Google Maps at the listing's address or, without one, at its map position. */
export function googleMapsUrl(address: string | null, position: Coordinates | null): string | null {
  const query = address?.trim() || (position ? `${position.lat},${position.lng}` : '')
  return query ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}` : null
}
