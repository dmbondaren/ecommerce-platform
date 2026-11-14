import jwt from 'jsonwebtoken'
import type { Role } from '@prisma/client'
import { env } from '../../config/env'

export interface AccessTokenPayload {
  sub: string
  role: Role
}

export function signAccessToken(payload: AccessTokenPayload): string {
  return jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    algorithm: 'HS256',
    expiresIn: env.ACCESS_TOKEN_TTL_MINUTES * 60,
  })
}

export function verifyAccessToken(token: string): AccessTokenPayload | null {
  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: ['HS256'] })
    if (typeof decoded === 'string' || typeof decoded.sub !== 'string') return null
    return { sub: decoded.sub, role: decoded.role as Role }
  } catch {
    return null
  }
}
