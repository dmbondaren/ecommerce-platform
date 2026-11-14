import bcrypt from 'bcrypt'
import type { AuthTokenType, User } from '@prisma/client'
import { env } from '../../config/env'
import { randomToken, sha256 } from '../../lib/crypto'
import { badRequest, conflict, forbidden, unauthorized } from '../../lib/errors'
import { logger } from '../../lib/logger'
import { prisma } from '../../lib/prisma'
import { mailer } from '../../mail/mailer'
import { isBanned } from '../../middleware/auth'
import { toAccount } from '../users/user.dto'
import { signAccessToken } from './tokens'

const BCRYPT_ROUNDS = 12
const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000
const REFRESH_TTL_MS = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000

// Compared against when the e-mail is unknown, so that login takes the same
// time whether or not the account exists.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser', BCRYPT_ROUNDS)

export const hashPassword = (password: string) => bcrypt.hash(password, BCRYPT_ROUNDS)

const normalizeEmail = (email: string) => email.trim().toLowerCase()

/** Derives a free nickname from the e-mail's local part, e.g. "anna" or "anna-4f2a". */
async function generateNickname(email: string): Promise<string> {
  const base =
    (email.split('@')[0] ?? '')
      .replace(/[^a-zA-Z0-9_.-]/g, '')
      .slice(0, 24) || 'user'
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = attempt === 0 ? base : `${base}-${randomToken().slice(0, 4).toLowerCase()}`
    const taken = await prisma.user.findFirst({
      where: { nickname: { equals: candidate, mode: 'insensitive' } },
      select: { id: true },
    })
    if (!taken) return candidate
  }
  return `user-${randomToken().slice(0, 10).toLowerCase()}`
}

async function createAuthToken(userId: string, type: AuthTokenType, ttlMs: number): Promise<string> {
  const token = randomToken()
  await prisma.$transaction([
    // Only the newest link of each kind stays valid.
    prisma.authToken.deleteMany({ where: { userId, type, usedAt: null } }),
    prisma.authToken.create({
      data: { userId, type, tokenHash: sha256(token), expiresAt: new Date(Date.now() + ttlMs) },
    }),
  ])
  return token
}

async function consumeAuthToken(token: string, type: AuthTokenType) {
  const record = await prisma.authToken.findUnique({ where: { tokenHash: sha256(token) } })
  if (!record || record.type !== type || record.usedAt || record.expiresAt < new Date()) {
    throw badRequest('This link is invalid or has expired')
  }
  return record
}

export interface Session {
  accessToken: string
  refreshToken: string
  user: ReturnType<typeof toAccount>
}

async function issueSession(user: User, userAgent?: string): Promise<Session> {
  const refreshToken = randomToken()
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: sha256(refreshToken),
      expiresAt: new Date(Date.now() + REFRESH_TTL_MS),
      userAgent: userAgent?.slice(0, 255),
    },
  })
  return {
    accessToken: signAccessToken({ sub: user.id, role: user.role }),
    refreshToken,
    user: toAccount(user),
  }
}

function sendVerificationMail(user: User, token: string) {
  const link = `${env.CLIENT_URL}/verify-email?token=${encodeURIComponent(token)}`
  // Mail delivery must never fail the request that triggered it.
  mailer
    .send({
      to: user.email,
      subject: 'Confirm your e-mail address',
      heading: 'Welcome to Marketplace',
      body: 'Please confirm your e-mail address to finish setting up your account.',
      action: { label: 'Confirm e-mail', url: link },
    })
    .catch((err: unknown) => logger.warn({ err }, 'Failed to send verification e-mail'))
}

export const authService = {
  async register(email: string, password: string, userAgent?: string): Promise<Session> {
    const normalized = normalizeEmail(email)
    const existing = await prisma.user.findUnique({ where: { email: normalized }, select: { id: true } })
    if (existing) throw conflict('An account with this e-mail already exists')

    const user = await prisma.user.create({
      data: {
        email: normalized,
        passwordHash: await hashPassword(password),
        nickname: await generateNickname(normalized),
      },
    })
    const token = await createAuthToken(user.id, 'EMAIL_VERIFICATION', EMAIL_VERIFICATION_TTL_MS)
    sendVerificationMail(user, token)
    return issueSession(user, userAgent)
  },

  async login(email: string, password: string, userAgent?: string): Promise<Session> {
    const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } })
    const passwordMatches = await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)
    // One message for both cases: the response must not reveal which e-mails are registered.
    if (!user || !passwordMatches) throw unauthorized('Invalid e-mail or password')
    if (isBanned(user)) {
      const until = user.bannedPermanently ? 'permanently' : `until ${user.bannedUntil?.toISOString()}`
      throw forbidden(`This account is suspended ${until}${user.banReason ? `: ${user.banReason}` : ''}`)
    }
    return issueSession(user, userAgent)
  },

  /**
   * Rotates the refresh token. Presenting a token that was already rotated
   * means it leaked, so every session of that user is revoked.
   */
  async refresh(refreshToken: string | undefined, userAgent?: string): Promise<Session> {
    if (!refreshToken) throw unauthorized()
    const record = await prisma.refreshToken.findUnique({
      where: { tokenHash: sha256(refreshToken) },
      include: { user: true },
    })
    if (!record) throw unauthorized()

    if (record.revokedAt) {
      logger.warn({ userId: record.userId }, 'Refresh token reuse detected, revoking all sessions')
      await prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      })
      throw unauthorized()
    }
    if (record.expiresAt < new Date() || isBanned(record.user)) throw unauthorized()

    // The conditional update makes rotation atomic: of two concurrent
    // refreshes with the same token, only one can win.
    const rotated = await prisma.refreshToken.updateMany({
      where: { id: record.id, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    if (rotated.count === 0) throw unauthorized()
    return issueSession(record.user, userAgent)
  },

  async logout(refreshToken: string | undefined): Promise<void> {
    if (!refreshToken) return
    await prisma.refreshToken.updateMany({
      where: { tokenHash: sha256(refreshToken), revokedAt: null },
      data: { revokedAt: new Date() },
    })
  },

  async verifyEmail(token: string): Promise<void> {
    const record = await consumeAuthToken(token, 'EMAIL_VERIFICATION')
    await prisma.$transaction([
      prisma.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      prisma.user.update({ where: { id: record.userId }, data: { emailVerifiedAt: new Date() } }),
    ])
  },

  async resendVerification(userId: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user || user.emailVerifiedAt) return
    const token = await createAuthToken(user.id, 'EMAIL_VERIFICATION', EMAIL_VERIFICATION_TTL_MS)
    sendVerificationMail(user, token)
  },

  /** Always resolves, whether or not the e-mail belongs to an account. */
  async requestPasswordReset(email: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { email: normalizeEmail(email) } })
    if (!user) return
    const token = await createAuthToken(user.id, 'PASSWORD_RESET', PASSWORD_RESET_TTL_MS)
    const link = `${env.CLIENT_URL}/reset-password?token=${encodeURIComponent(token)}`
    mailer
      .send({
        to: user.email,
        subject: 'Reset your password',
        heading: 'Password reset',
        body: 'Use the button below to choose a new password. The link is valid for one hour. If you did not ask for this, you can ignore this e-mail.',
        action: { label: 'Choose a new password', url: link },
      })
      .catch((err: unknown) => logger.warn({ err }, 'Failed to send password reset e-mail'))
  },

  async resetPassword(token: string, newPassword: string): Promise<void> {
    const record = await consumeAuthToken(token, 'PASSWORD_RESET')
    await prisma.$transaction([
      prisma.authToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
      prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: await hashPassword(newPassword) },
      }),
      // A password reset signs the user out everywhere.
      prisma.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ])
  },
}
