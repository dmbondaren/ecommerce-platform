import { describe, expect, it } from 'vitest'
import { screenListing } from '../../src/modules/listings/moderation'

describe('screenListing', () => {
  it('lets ordinary listings through', () => {
    expect(screenListing('Road bike, 54 cm', 'Aluminium frame, serviced this spring. See www.example.com')).toBeNull()
    expect(screenListing('Kitchen installation', 'I install kitchens and bathrooms.')).toBeNull()
  })

  it('flags prohibited items as whole words only', () => {
    expect(screenListing('Passport holder', 'Leather, brown')).toBeNull()
    expect(screenListing('Documents', 'Fake passport, fast delivery')).toMatch(/prohibited/)
  })

  it('flags requests to pay outside the platform', () => {
    expect(screenListing('iPhone 15', 'Payment in advance via Western Union only')).toMatch(/outside the platform/)
  })

  it('flags link spam, shouting and character runs', () => {
    expect(screenListing('Cheap watches', 'http://a.example and https://b.example')).toMatch(/links/)
    expect(screenListing('BEST PRICE IN ZURICH BUY NOW', 'A normal description.')).toMatch(/capital letters/)
    expect(screenListing('Sofa', 'Greaaaaaaaaaat condition')).toMatch(/repeated/)
  })

  it('does not treat short upper-case model names as shouting', () => {
    expect(screenListing('SONY WH-1000', 'Headphones in good condition.')).toBeNull()
  })
})
