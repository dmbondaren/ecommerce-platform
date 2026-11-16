import type { Request, RequestHandler } from 'express'
import type { Role } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { AppError, forbidden, unauthorized } from '../lib/errors'
import { verifyAccessToken } from '../modules/auth/tokens'

export interface AuthContext {
  userId: string
  role: Role
  emailVerified: boolean
}

interface BanState {
  bannedPermanently: boolean
  bannedUntil: Date | null
}

export const isBanned = (user: BanState, now = new Date()) =>
  user.bannedPermanently || (user.bannedUntil !== null && user.bannedUntil > now)

export const isAdminRole = (role: Role) => role === 'ADMIN' || role === 'SUPER_ADMIN'

/** Told to a suspended user at sign-in and on any request made with a token issued before the suspension. */
export function suspendedError(user: BanState & { banReason?: string | null }) {
  const until = user.bannedPermanently ? 'permanently' : `until ${user.bannedUntil?.toISOString()}`
  return new AppError(403, 'ACCOUNT_SUSPENDED', `This account is suspended ${until}${user.banReason ? `: ${user.banReason}` : ''}`)
}

/**
 * Resolves an access token to the current state of its user. The role and ban
 * status are read from the database on every request, so a ban or a role
 * change takes effect immediately instead of when the token expires.
 */
export async function resolveAccessToken(token: string): Promise<AuthContext | null> {
  const state = await loadAccount(token)
  return state?.kind === 'active' ? state.auth : null
}

type AccountState = { kind: 'active'; auth: AuthContext } | { kind: 'suspended'; error: AppError }

async function loadAccount(token: string): Promise<AccountState | null> {
  const payload = verifyAccessToken(token)
  if (!payload) return null
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, role: true, emailVerifiedAt: true, bannedUntil: true, bannedPermanently: true, banReason: true },
  })
  if (!user) return null
  if (isBanned(user)) return { kind: 'suspended', error: suspendedError(user) }
  return {
    kind: 'active',
    auth: {
      userId: user.id,
      role: user.role,
      // Staff accounts are created by other staff, so they count as verified.
      emailVerified: user.emailVerifiedAt !== null || isAdminRole(user.role),
    },
  }
}

const bearerToken = (req: Request) => {
  const header = req.headers.authorization
  return header?.startsWith('Bearer ') ? header.slice('Bearer '.length) : null
}

async function authenticate(req: Request): Promise<AuthContext | null> {
  const token = bearerToken(req)
  return token ? resolveAccessToken(token) : null
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const token = bearerToken(req)
  const state = token ? await loadAccount(token) : null
  if (!state) throw unauthorized()
  // Said plainly, so that a suspended user is not left guessing why nothing works.
  if (state.kind === 'suspended') throw state.error
  req.auth = state.auth
  next()
}

/** For public endpoints that return extra data to signed-in users. */
export const optionalAuth: RequestHandler = async (req, _res, next) => {
  req.auth = (await authenticate(req)) ?? undefined
  next()
}

export const requireAdmin: RequestHandler = (req, _res, next) => {
  if (!isAdminRole(getAuth(req).role)) throw forbidden('Administrator access required')
  next()
}

export const requireSuperAdmin: RequestHandler = (req, _res, next) => {
  if (getAuth(req).role !== 'SUPER_ADMIN') throw forbidden('Super administrator access required')
  next()
}

/** Auth context of a route that sits behind `requireAuth`. */
export function getAuth(req: Request): AuthContext {
  if (!req.auth) throw unauthorized()
  return req.auth
}

/** Publishing content requires a confirmed e-mail address, which keeps throwaway accounts out. */
export const requireVerified: RequestHandler = (req, _res, next) => {
  if (!getAuth(req).emailVerified) throw forbidden('Confirm your e-mail address first')
  next()
}
