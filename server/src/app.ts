import { existsSync } from 'node:fs'
import path from 'node:path'
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
import { serveStoredFile, uploadDir } from './modules/uploads/uploads.routes'

/** Builds the HTTP application without starting it, so tests can drive it directly. */
export function createApp() {
  const app = express()
  app.disable('x-powered-by')
  // One reverse proxy (nginx) in front: needed for correct client IPs in rate limiting.
  app.set('trust proxy', 1)

  app.use(pinoHttp({ logger, autoLogging: { ignore: (req) => req.url?.startsWith('/health') ?? false } }))
  app.use(
    helmet({
      // Images are loaded by the web client from another origin during development.
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      // Helmet's default ("no-referrer") hides where a request comes from, and
      // OpenStreetMap's tile servers refuse requests that do not say. This
      // sends the site's origin only, never the page address.
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      // Applies to the web client when this process serves it: map tiles and
      // the address search are the only third parties the page may talk to.
      contentSecurityPolicy: {
        directives: {
          'img-src': ["'self'", 'data:', 'blob:', 'https://tile.openstreetmap.org'],
          'connect-src': ["'self'", 'ws:', 'wss:', 'https://nominatim.openstreetmap.org'],
        },
      },
    }),
  )
  app.use(cors({ origin: env.CLIENT_URL, credentials: true }))
  app.use(express.json({ limit: '100kb' }))
  app.use(cookieParser())

  // File names are random and never reused, so they can be cached forever.
  if (env.STORAGE_DRIVER === 'database') app.get('/uploads/:name', serveStoredFile)
  else app.use('/uploads', express.static(uploadDir, { index: false, maxAge: '365d', immutable: true }))

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

  // Single-service deployment: the same process serves the built web client.
  const clientDir = env.CLIENT_DIST ? path.resolve(env.CLIENT_DIST) : null
  if (clientDir && existsSync(path.join(clientDir, 'index.html'))) {
    app.use(
      express.static(clientDir, {
        index: false,
        setHeaders: (res, filePath) => {
          // Vite puts a content hash into the names of everything under /assets.
          const hashed = filePath.includes(`${path.sep}assets${path.sep}`)
          res.setHeader('Cache-Control', hashed ? 'public, max-age=31536000, immutable' : 'no-cache')
        },
      }),
    )
    // Client-side routing: any other page address gets the application shell.
    app.get(/^\/(?!api\/|uploads\/|health|ws$).*/, (_req, res) => {
      res.setHeader('Cache-Control', 'no-cache')
      res.sendFile(path.join(clientDir, 'index.html'))
    })
  }
  app.use(notFoundHandler)
  app.use(errorHandler)
  return app
}
