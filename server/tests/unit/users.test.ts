import { describe, expect, it } from 'vitest'
import { countByName } from '../../src/modules/users/users.service'

describe('countByName', () => {
  it('counts and orders by frequency, then by name', () => {
    expect(countByName(['Fashion', 'Electronics', 'Fashion', 'Vehicles', 'Electronics', 'Fashion'])).toEqual([
      { name: 'Fashion', count: 3 },
      { name: 'Electronics', count: 2 },
      { name: 'Vehicles', count: 1 },
    ])
    expect(countByName(['b', 'a'])).toEqual([
      { name: 'a', count: 1 },
      { name: 'b', count: 1 },
    ])
    expect(countByName([])).toEqual([])
  })
})
