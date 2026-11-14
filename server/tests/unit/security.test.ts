import { describe, expect, it } from 'vitest'
import { randomToken, sha256 } from '../../src/lib/crypto'
import { escapeHtml, parseSender, renderMail } from '../../src/mail/mailer'
import { isAdminRole, isBanned } from '../../src/middleware/auth'
import { signAccessToken, verifyAccessToken } from '../../src/modules/auth/tokens'

describe('access tokens', () => {
  it('round-trips the payload', () => {
    const token = signAccessToken({ sub: 'user-1', role: 'ADMIN' })
    expect(verifyAccessToken(token)).toEqual({ sub: 'user-1', role: 'ADMIN' })
  })

  it('rejects tampered and malformed tokens', () => {
    const token = signAccessToken({ sub: 'user-1', role: 'USER' })
    expect(verifyAccessToken(`${token.slice(0, -2)}xx`)).toBeNull()
    expect(verifyAccessToken('not-a-token')).toBeNull()
    expect(verifyAccessToken('')).toBeNull()
  })
})

describe('isBanned', () => {
  const now = new Date('2026-06-01T12:00:00Z')

  it('treats a permanent ban as active regardless of dates', () => {
    expect(isBanned({ bannedPermanently: true, bannedUntil: null }, now)).toBe(true)
  })

  it('expires a temporary ban', () => {
    expect(isBanned({ bannedPermanently: false, bannedUntil: new Date('2026-06-02T00:00:00Z') }, now)).toBe(true)
    expect(isBanned({ bannedPermanently: false, bannedUntil: new Date('2026-05-31T00:00:00Z') }, now)).toBe(false)
    expect(isBanned({ bannedPermanently: false, bannedUntil: null }, now)).toBe(false)
  })
})

describe('isAdminRole', () => {
  it('covers both staff roles', () => {
    expect(isAdminRole('USER')).toBe(false)
    expect(isAdminRole('ADMIN')).toBe(true)
    expect(isAdminRole('SUPER_ADMIN')).toBe(true)
  })
})

describe('e-mail rendering', () => {
  it('escapes user-controlled text', () => {
    expect(escapeHtml(`<img src=x onerror="alert('1')">&`)).toBe(
      '&lt;img src=x onerror=&quot;alert(&#39;1&#39;)&quot;&gt;&amp;',
    )
    const html = renderMail({
      to: 'a@example.com',
      subject: 'Sold',
      heading: 'Sold: <script>alert(1)</script>',
      body: 'Body',
      action: { label: 'Open', url: 'https://example.com/?a=1&b="2"' },
    })
    expect(html).not.toContain('<script>')
    expect(html).toContain('href="https://example.com/?a=1&amp;b=&quot;2&quot;"')
  })
})

describe('token helpers', () => {
  it('generates unique URL-safe tokens and stable hashes', () => {
    const token = randomToken()
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(randomToken()).not.toBe(token)
    expect(sha256('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})

describe('parseSender', () => {
  it('splits a display name from the address', () => {
    expect(parseSender('Marketplace <no-reply@example.com>')).toEqual({ name: 'Marketplace', email: 'no-reply@example.com' })
    expect(parseSender('"My Shop" <shop@example.com>')).toEqual({ name: 'My Shop', email: 'shop@example.com' })
  })

  it('accepts a bare address', () => {
    expect(parseSender(' shop@example.com ')).toEqual({ name: 'Marketplace', email: 'shop@example.com' })
  })
})
