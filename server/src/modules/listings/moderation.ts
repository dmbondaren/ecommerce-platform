/**
 * Automatic screening of new and edited listings. It does not reject
 * anything by itself: a flagged listing is held back until a moderator has
 * looked at it, and its owner is told why.
 */

const PROHIBITED_TERMS = [
  'cocaine',
  'heroin',
  'methamphetamine',
  'counterfeit',
  'fake passport',
  'fake id',
  'stolen',
  'firearm',
  'ammunition',
  'explosives',
]

// Typical of advance-fee scams: moving the deal off the platform and asking for money first.
const SCAM_PATTERNS = [/western union/i, /pay(ment)? in advance/i, /prepay(ment)?/i, /gift ?cards? only/i]

const LINK_PATTERN = /(https?:\/\/|www\.)\S+/gi
const MAX_LINKS = 1
const SHOUTING_MIN_LETTERS = 12
const SHOUTING_RATIO = 0.7

/** Returns why a listing needs a human look, or `null` when it can be published. */
export function screenListing(title: string, description: string): string | null {
  const text = `${title}\n${description}`
  const lower = text.toLowerCase()

  const term = PROHIBITED_TERMS.find((candidate) => new RegExp(`\\b${candidate}\\b`).test(lower))
  if (term) return `mentions a prohibited item ("${term}")`

  if (SCAM_PATTERNS.some((pattern) => pattern.test(text))) return 'asks for payment outside the platform'

  if ((text.match(LINK_PATTERN) ?? []).length > MAX_LINKS) return 'contains several external links'

  const letters = title.replace(/[^\p{L}]/gu, '')
  const upper = letters.replace(/[^\p{Lu}]/gu, '')
  if (letters.length >= SHOUTING_MIN_LETTERS && upper.length / letters.length > SHOUTING_RATIO) {
    return 'has a title written almost entirely in capital letters'
  }

  if (/(.)\1{7,}/u.test(text)) return 'contains long runs of a repeated character'

  return null
}
