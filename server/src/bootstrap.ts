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
 * Makes the account named by SUPER_ADMIN_EMAIL a super administrator. An
 * existing account is promoted (its password is never touched); otherwise the
 * account is created, which also needs SUPER_ADMIN_PASSWORD.
 */
export async function ensureSuperAdmin() {
  if (!env.SUPER_ADMIN_EMAIL) return
  const email = env.SUPER_ADMIN_EMAIL.trim().toLowerCase()
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true, role: true } })
  if (existing) {
    if (existing.role !== 'SUPER_ADMIN') {
      await prisma.user.update({
        where: { id: existing.id },
        data: { role: 'SUPER_ADMIN', emailVerifiedAt: new Date() },
      })
      logger.info({ email }, 'Promoted existing account to super admin')
    }
    return
  }
  if (!env.SUPER_ADMIN_PASSWORD) {
    logger.warn({ email }, 'SUPER_ADMIN_EMAIL has no account yet: register it, or set SUPER_ADMIN_PASSWORD')
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
