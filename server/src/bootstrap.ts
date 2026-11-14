import { env } from './config/env'
import { DEFAULT_CATEGORIES } from './lib/constants'
import { randomToken } from './lib/crypto'
import { logger } from './lib/logger'
import { prisma } from './lib/prisma'
import { hashPassword } from './modules/auth/auth.service'

/** Idempotent, so it is safe to run on every start. */
export async function ensureCategories() {
  await prisma.$transaction(
    DEFAULT_CATEGORIES.map((category, sortOrder) =>
      prisma.category.upsert({
        where: { slug: category.slug },
        create: { ...category, sortOrder },
        update: { name: category.name, sortOrder },
      }),
    ),
  )
}

/**
 * Creates the first super administrator from the environment, or promotes
 * the existing account with that e-mail. The password of an existing account
 * is never overwritten.
 */
export async function ensureSuperAdmin() {
  if (!env.SUPER_ADMIN_EMAIL || !env.SUPER_ADMIN_PASSWORD) return
  const email = env.SUPER_ADMIN_EMAIL.toLowerCase()
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } })
  if (existing) {
    if (existing.role !== 'SUPER_ADMIN') {
      await prisma.user.update({ where: { id: existing.id }, data: { role: 'SUPER_ADMIN' } })
      logger.info({ email }, 'Promoted existing account to super admin')
    }
    return
  }
  await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(env.SUPER_ADMIN_PASSWORD),
      nickname: `admin-${randomToken().slice(0, 6).toLowerCase()}`,
      role: 'SUPER_ADMIN',
      emailVerifiedAt: new Date(),
    },
  })
  logger.info({ email }, 'Created super admin account')
}
