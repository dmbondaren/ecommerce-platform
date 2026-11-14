import { createServer } from 'node:http'
import { createApp } from './app'
import { ensureCategories, ensureSuperAdmin } from './bootstrap'
import { env } from './config/env'
import { seedDemoData } from './demo-data'
import { logger } from './lib/logger'
import { prisma } from './lib/prisma'
import { startReservationSweeper } from './modules/orders/orders.service'
import { attachWebSocketServer } from './realtime/ws-server'

const SHUTDOWN_TIMEOUT_MS = 10_000

/**
 * Touches the most recently added columns. When the database was not updated
 * after a schema change every request would fail with a vague 500; this turns
 * it into one clear message at start-up.
 */
async function assertSchemaIsCurrent() {
  try {
    await prisma.order.findFirst({ select: { status: true, expiresAt: true, paymentReference: true } })
    await prisma.listing.findFirst({ where: { status: 'RESERVED' }, select: { latitude: true, longitude: true } })
  } catch (err) {
    logger.fatal({ err }, 'The database schema is out of date. Stop the server and run "npm run db:push".')
    process.exit(1)
  }
}

async function main() {
  // Fail at start-up, not on the first request, when the database is unreachable.
  await prisma.$connect()
  await assertSchemaIsCurrent()
  await ensureCategories()
  await ensureSuperAdmin()
  if (env.SEED_DEMO_DATA) await seedDemoData()

  const server = createServer(createApp())
  const realtime = attachWebSocketServer(server)
  const stopSweeper = startReservationSweeper()
  server.listen(env.PORT, () => logger.info({ port: env.PORT, env: env.NODE_ENV }, 'API listening'))

  let shuttingDown = false
  const shutdown = (signal: string) => {
    if (shuttingDown) return
    shuttingDown = true
    logger.info({ signal }, 'Shutting down')
    stopSweeper()
    realtime.close()
    // Stops accepting connections and waits for requests in flight.
    server.close(() => {
      prisma
        .$disconnect()
        .catch((err: unknown) => logger.error({ err }, 'Failed to close the database connection'))
        .finally(() => process.exit(0))
    })
    setTimeout(() => {
      logger.error('Shutdown timed out, forcing exit')
      process.exit(1)
    }, SHUTDOWN_TIMEOUT_MS).unref()
  }
  process.on('SIGTERM', () => shutdown('SIGTERM'))
  process.on('SIGINT', () => shutdown('SIGINT'))
}

// A rejected promise nobody awaited is a bug, but not a reason to drop every
// connected user; an exception that escaped everything leaves the process in
// an unknown state, so that one does end it and the orchestrator restarts it.
process.on('unhandledRejection', (reason) => logger.error({ err: reason }, 'Unhandled promise rejection'))
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'Uncaught exception')
  process.exit(1)
})

main().catch((err: unknown) => {
  logger.fatal({ err }, 'Failed to start')
  process.exit(1)
})
