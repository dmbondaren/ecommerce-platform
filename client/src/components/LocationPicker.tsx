import { lazy, Suspense, useState } from 'react'
import type { Coordinates } from '../api/types'
import { Button, Spinner } from './ui'

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
  if (!response.ok) throw new Error('The address search is not available right now')
  const [first] = (await response.json()) as SearchResult[]
  if (!first) return null
  const position = { lat: Number(first.lat), lng: Number(first.lon) }
  return Number.isFinite(position.lat) && Number.isFinite(position.lng) ? position : null
}

interface Props {
  address: string
  value: Coordinates | null
  onChange: (value: Coordinates | null) => void
}

/** Optional map position of a listing: found from the address, or placed by hand. */
export function LocationPicker({ address, value, onChange }: Props) {
  const [open, setOpen] = useState(value !== null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)

  const find = async () => {
    if (!address.trim()) {
      setMessage('Enter a location above first, e.g. “Bahnhofstrasse 1, Zürich”.')
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const found = await geocode(address)
      if (found) onChange(found)
      else setMessage('This address was not found. Click on the map to place the flag yourself.')
    } catch {
      setMessage('The address search is not available right now. Click on the map to place the flag yourself.')
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
        Show the location on a map
      </label>
      {open && (
        <>
          <div className="row">
            <Button size="sm" busy={busy} onClick={() => void find()}>
              Find the address on the map
            </Button>
            {value && (
              <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
                Remove the flag
              </Button>
            )}
          </div>
          <p className="field-hint" aria-live="polite">
            {message ??
              'Click on the map or drag the flag to adjust. Buyers will see this spot, so choose a nearby public place if you prefer not to show your home.'}
          </p>
          <Suspense fallback={<Spinner label="Loading the map" />}>
            <LazyMap position={value} onChange={onChange} />
          </Suspense>
        </>
      )}
    </div>
  )
}
