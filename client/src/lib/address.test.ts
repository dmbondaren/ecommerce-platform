import { describe, expect, it } from 'vitest'
import { formatAddress, googleMapsUrl } from './address'

describe('formatAddress', () => {
  it('builds a postal-style line', () => {
    expect(formatAddress({ road: 'Bahnhofstrasse', house_number: '1', postcode: '8001', city: 'Zürich' })).toBe(
      'Bahnhofstrasse 1, 8001 Zürich',
    )
  })

  it('copes with missing parts', () => {
    expect(formatAddress({ road: 'Seestrasse', town: 'Thalwil' })).toBe('Seestrasse, Thalwil')
    expect(formatAddress({ house_number: '7', postcode: '3011', city: 'Bern' })).toBe('3011 Bern')
    expect(formatAddress({ pedestrian: 'Niederdorfstrasse', city: 'Zürich' })).toBe('Niederdorfstrasse, Zürich')
  })

  it('falls back to the full description and respects the field limit', () => {
    expect(formatAddress({}, 'Uetliberg, Stallikon')).toBe('Uetliberg, Stallikon')
    expect(formatAddress(undefined, 'x'.repeat(300))).toHaveLength(120)
  })
})

describe('googleMapsUrl', () => {
  it('prefers the written address', () => {
    expect(googleMapsUrl('Bahnhofstrasse 1, 8001 Zürich', { lat: 47.37, lng: 8.54 })).toBe(
      'https://www.google.com/maps/search/?api=1&query=Bahnhofstrasse%201%2C%208001%20Z%C3%BCrich',
    )
  })

  it('uses the coordinates when there is no address', () => {
    expect(googleMapsUrl('  ', { lat: 47.37, lng: 8.54 })).toBe(
      'https://www.google.com/maps/search/?api=1&query=47.37%2C8.54',
    )
    expect(googleMapsUrl(null, null)).toBeNull()
  })
})
