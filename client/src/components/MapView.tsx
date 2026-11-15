import * as L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { useEffect, useRef } from 'react'
import type { Coordinates } from '../api/types'
import { t } from '../app/i18n'

// Zürich: where the map opens before a place has been chosen.
const DEFAULT_CENTER: Coordinates = { lat: 47.3769, lng: 8.5417 }

const flagIcon = L.divIcon({
  className: 'map-flag',
  html: '<svg width="34" height="40" viewBox="0 0 34 40" aria-hidden="true"><path d="M6 38V3" stroke="#1f2933" stroke-width="3" stroke-linecap="round"/><path d="M7.5 4h20l-5 7 5 7h-20z" fill="#e11d2e" stroke="#9f1220" stroke-width="1.5" stroke-linejoin="round"/></svg>',
  iconSize: [34, 40],
  // The foot of the pole is the exact spot.
  iconAnchor: [6, 38],
})

interface Props {
  position: Coordinates | null
  /** When given, the map is editable: a click or a drag of the flag picks a new place. */
  onChange?: (position: Coordinates) => void
}

/**
 * A map with a red flag, drawn with Leaflet on OpenStreetMap tiles. The
 * Leaflet map lives outside React's tree, so it is created once and then
 * kept in sync with the props by hand.
 */
export default function MapView({ position, onChange }: Props) {
  const container = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const marker = useRef<L.Marker | null>(null)
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const editable = onChange !== undefined

  useEffect(() => {
    if (!container.current) return
    const instance = L.map(container.current, { scrollWheelZoom: editable }).setView(
      [DEFAULT_CENTER.lat, DEFAULT_CENTER.lng],
      11,
    )
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    }).addTo(instance)
    if (editable) {
      instance.on('click', (event: L.LeafletMouseEvent) =>
        onChangeRef.current?.({ lat: event.latlng.lat, lng: event.latlng.lng }),
      )
    }
    map.current = instance
    return () => {
      instance.remove()
      map.current = null
      marker.current = null
    }
  }, [editable])

  useEffect(() => {
    const instance = map.current
    if (!instance) return
    if (!position) {
      marker.current?.remove()
      marker.current = null
      return
    }
    const latLng: L.LatLngExpression = [position.lat, position.lng]
    if (marker.current) {
      marker.current.setLatLng(latLng)
    } else {
      const created = L.marker(latLng, { icon: flagIcon, draggable: editable, keyboard: false }).addTo(instance)
      created.on('dragend', () => {
        const { lat, lng } = created.getLatLng()
        onChangeRef.current?.({ lat, lng })
      })
      marker.current = created
    }
    instance.setView(latLng, Math.max(instance.getZoom(), 15))
  }, [position, editable])

  return <div ref={container} className="map" role="application" aria-label={t('Map')} />
}
