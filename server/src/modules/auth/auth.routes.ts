import { Router, type CookieOptions, type Response } from 'express'
import { z } from 'zod'
import { env, isProduction } from '../../config/env'
import { parse } from '../../lib/validation'
import { getAuth, requireAuth } from '../../middleware/auth'
import { authLimiter } from '../../middleware/rate-limit'
import { authService, type Session } from './auth.service'

const REFRESH_COOKIE = 'refresh_token'

// Scoped to the auth routes so the browser does not attach it to any other request.
const refreshCookieOptions: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: 'lax',
  path: '/api/v1/auth',
  maxAge: env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000,
}

export const emailSchema = z.string().trim().email().max(254)
export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(72, 'Password must be at most 72 characters') // bcrypt ignores anything beyond 72 bytes

const credentialsSchema = z.object({ email: emailSchema, password: passwordSchema })
const loginSchema = z.object({ email: emailSchema, password: z.string().min(1).max(72) })
const tokenSchema = z.object({ token: z.string().min(1).max(200) })
const resetSchema = tokenSchema.extend({ password: passwordSchema })

function sendSession(res: Response, session: Session, status = 200) {
  res.cookie(REFRESH_COOKIE, session.refreshToken, refreshCookieOptions)
  res.status(status).json({ accessToken: session.accessToken, user: session.user })
}

const readRefreshCookie = (cookies: unknown): string | undefined => {
  const value = (cookies as Record<string, unknown> | undefined)?.[REFRESH_COOKIE]
  return typeof value === 'string' ? value : undefined
}

export const authRouter = Router()

authRouter.post('/register', authLimiter, async (req, res) => {
  const { email, password } = parse(credentialsSchema, req.body)
  sendSession(res, await authService.register(email, password, req.get('user-agent')), 201)
})

authRouter.post('/login', authLimiter, async (req, res) => {
  const { email, password } = parse(loginSchema, req.body)
  sendSession(res, await authService.login(email, password, req.get('user-agent')))
})

authRouter.post('/refresh', async (req, res) => {
  sendSession(res, await authService.refresh(readRefreshCookie(req.cookies), req.get('user-agent')))
})

authRouter.post('/logout', async (req, res) => {
  await authService.logout(readRefreshCookie(req.cookies))
  res.clearCookie(REFRESH_COOKIE, { ...refreshCookieOptions, maxAge: undefined })
  res.status(204).end()
})

authRouter.post('/verify-email', authLimiter, async (req, res) => {
  await authService.verifyEmail(parse(tokenSchema, req.body).token)
  res.status(204).end()
})

authRouter.post('/resend-verification', authLimiter, requireAuth, async (req, res) => {
  await authService.resendVerification(getAuth(req).userId)
  res.status(204).end()
})

authRouter.post('/password-reset/request', authLimiter, async (req, res) => {
  await authService.requestPasswordReset(parse(z.object({ email: emailSchema }), req.body).email)
  res.status(202).json({ message: 'A reset link has been sent' })
})

authRouter.post('/password-reset/confirm', authLimiter, async (req, res) => {
  const { token, password } = parse(resetSchema, req.body)
  await authService.resetPassword(token, password)
  res.status(204).end()
})
