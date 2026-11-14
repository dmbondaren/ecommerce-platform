/** Demo data for local development: `npm run db:seed`. */
import { seedDemoData } from '../src/demo-data'
import { logger } from '../src/lib/logger'
import { prisma } from '../src/lib/prisma'

seedDemoData()
  .catch((err: unknown) => {
    logger.error({ err }, 'Seeding failed')
    process.exitCode = 1
  })
  .finally(() => prisma.$disconnect())
