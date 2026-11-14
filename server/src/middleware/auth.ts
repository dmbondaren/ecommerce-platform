import type { Request, RequestHandler } from 'express'
import type { Role } from '@prisma/client'
import { prisma } from '../lib/prisma'
import { forbidden, unauthorized } from '../lib/errors'
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

/**
 * Resolves an access token to the current state of its user. The role and ban
 * status are read from the database on every request, so a ban or a role
 * change takes effect immediately instead of when the token expires.
 */
export async function resolveAccessToken(token: string): Promise<AuthContext | null> {
  const payload = verifyAccessToken(token)
  if (!payload) return null
  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: { id: true, role: true, emailVerifiedAt: true, bannedUntil: true, bannedPermanently: true },
  })
  if (!user || isBanned(user)) return null
  return {
    userId: user.id,
    role: user.role,
    // Staff accounts are created by other staff, so they count as verified.
    emailVerified: user.emailVerifiedAt !== null || isAdminRole(user.role),
  }
}

async function authenticate(req: Request): Promise<AuthContext | null> {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) return null
  return resolveAccessToken(header.slice('Bearer '.length))
}

export const requireAuth: RequestHandler = async (req, _res, next) => {
  const auth = await authenticate(req)
  if (!auth) throw unauthorized()
  req.auth = auth
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
