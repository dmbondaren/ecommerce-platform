import { createHash, randomBytes } from 'node:crypto'

/** URL-safe random token with 256 bits of entropy. */
export const randomToken = () => randomBytes(32).toString('base64url')

/**
 * Tokens are high-entropy random values, so a fast hash is enough to make a
 * database leak useless (unlike passwords, which need bcrypt).
 */
export const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')
