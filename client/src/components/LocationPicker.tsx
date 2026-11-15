import { lazy, Suspense, useRef, useState } from 'react'
import type { Coordinates } from '../api/types'
import { formatAddress, googleMapsUrl, type AddressParts } from '../lib/address'
import { Button, Spinner } from './ui'
import { t } from '../app/i18n'

// Leaflet is sizeable and only needed where a map is shown.
export const LazyMap = lazy(() => import('./MapView'))

interface SearchResult {
  lat: string
  lon: string
}

/** Looks an address up with OpenStreetMap's Nominatim service. */
export async function geocode(address: string): Promise<Coordinates | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=${encodeURIComponent(address)}`
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) throw new Error(t('The address search is not available right now'))
  const [first] = (await response.json()) as SearchResult[]
  if (!first) return null
  const position = { lat: Number(first.lat), lng: Number(first.lon) }
  return Number.isFinite(position.lat) && Number.isFinite(position.lng) ? position : null
}

/** Finds the address of a point on the map, e.g. "Bahnhofstrasse 1, 8001 Zürich". */
export async function reverseGeocode(position: Coordinates): Promise<string | null> {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&addressdetails=1&lat=${position.lat}&lon=${position.lng}`
  const response = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!response.ok) return null
  const result = (await response.json()) as { display_name?: string; address?: AddressParts }
  return formatAddress(result.address, result.display_name) || null
}

interface Props {
  address: string
  value: Coordinates | null
  onChange: (value: Coordinates | null) => void
  /** Called with the address of a spot the user picked on the map. */
  onAddressChange: (address: string) => void
}

/** Optional map position of a listing: found from the address, or placed by hand. */
export function LocationPicker({ address, value, onChange, onAddressChange }: Props) {
  const [open, setOpen] = useState(value !== null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  // Only the answer for the latest pick counts; earlier ones may arrive late.
  const lastPick = useRef(0)

  /** The flag was placed by hand: write the address of that spot into the listing. */
  const pick = (position: Coordinates) => {
    onChange(position)
    const pickId = ++lastPick.current
    setMessage(t('Looking up the address of this spot…'))
    reverseGeocode(position)
      .then((found) => {
        if (pickId !== lastPick.current) return
        if (found) {
          onAddressChange(found)
          setMessage(`The location was set to “${found}”.`)
        } else {
          setMessage(t('No address was found for this spot, so the location text was left as it is.'))
        }
      })
      .catch(() => {
        if (pickId === lastPick.current) setMessage(t('The address could not be looked up; please type it in yourself.'))
      })
  }

  const mapsUrl = googleMapsUrl(address, value)

  const find = async () => {
    if (!address.trim()) {
      setMessage(t('Enter a location above first, e.g. “Bahnhofstrasse 1, Zürich”.'))
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const found = await geocode(address)
      if (found) onChange(found)
      else setMessage(t('This address was not found. Click on the map to place the flag yourself.'))
    } catch {
      setMessage(t('The address search is not available right now. Click on the map to place the flag yourself.'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="location-picker">
      <label className="checkbox">
        <input
          type="checkbox"
          checked={open}
          onChange={(event) => {
            setOpen(event.target.checked)
            if (!event.target.checked) onChange(null)
          }}
        />
        {t('Show the location on a map')}
      </label>
      {open && (
        <>
          <div className="row">
            <Button size="sm" busy={busy} onClick={() => void find()}>
              {t('Find the address on the map')}
            </Button>
            {value && (
              <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
                {t('Remove the flag')}
              </Button>
            )}
            {value && mapsUrl && (
              <a className="btn btn-ghost btn-sm" href={mapsUrl} target="_blank" rel="noreferrer">
                {t('Check in Google Maps')}
              </a>
            )}
          </div>
          <p className="field-hint" aria-live="polite">
            {message ??
              t('Click on the map or drag the flag: the location above is filled in with the address of that spot. Buyers will see this spot, so choose a nearby public place if you prefer not to show your home.')}
          </p>
          <Suspense fallback={<Spinner label={t('Loading the map')} />}>
            <LazyMap position={value} onChange={pick} />
          </Suspense>
        </>
      )}
    </div>
  )
}
