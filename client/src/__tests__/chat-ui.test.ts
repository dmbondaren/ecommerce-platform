import { isNearBottom } from '../utils/chat-ui'

describe('chat auto scroll logic', () => {
  it('auto-scrolls when the user is already near the latest messages', () => {
    expect(isNearBottom(1000, 840, 120)).toBe(true)
  })

  it('does not auto-scroll when the user is reading older messages', () => {
    expect(isNearBottom(1000, 500, 120)).toBe(false)
  })

  it('respects a custom threshold', () => {
    expect(isNearBottom(1000, 700, 250, 40)).toBe(false)
    expect(isNearBottom(1000, 720, 250, 40)).toBe(true)
  })
})
