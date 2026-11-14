import cookieParser from 'cookie-parser'
import cors from 'cors'
import express from 'express'
import helmet from 'helmet'
import { pinoHttp } from 'pino-http'
import { apiRouter } from './api'
import { env } from './config/env'
import { logger } from './lib/logger'
import { prisma } from './lib/prisma'
import { errorHandler, notFoundHandler } from './middleware/error-handler'
import { apiLimiter } from './middleware/rate-limit'
import { uploadDir } from './modules/uploads/uploads.routes'

/** Builds the HTTP application without starting it, so tests can drive it directly. */
export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  // One reverse proxy (nginx) in front: needed for correct client IPs in rate limiting.
  app.set('trust proxy', 1)

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false } }))
  // Images are loaded by the web client from another origin.
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }))
  app.use(cors({ origin: env.CLIENT_URL, credentials: true }))
  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())

  // File names are random and never reused, so they can be cached forever.
  app.use('/uploads', express.static(uploadDir, { index: false, maxAge: '365d', immutable: true }))

  /** Liveness: the process is up. */
  app.get('/health', (_req, res) => {
    res.json({ status: 'ok', uptime: Math.round(process.uptime()) })
  })

  /** Readiness: the process can also reach its database. */
  app.get('/health/ready', async (_req, res) => {
    try {
      await prisma.$queryRaw`SELECT 1`
      res.json({ status: 'ready' })
    } catch (err) {
      logger.error({ err }, 'Readiness check failed')
      res.status(503).json({ status: 'unavailable' })
    }
  })

  app.use('/api/v1', apiLimiter, apiRouter)
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
