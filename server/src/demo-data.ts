import { ensureCategories } from './bootstrap'
import { env } from './config/env'
import { logger } from './lib/logger'
import { prisma } from './lib/prisma'
import { hashPassword } from './modules/auth/auth.service'

const DEMO_PASSWORD = 'demo-password-123'

const USERS = [
  { email: 'anna@example.com', nickname: 'anna' },
  { email: 'luca@example.com', nickname: 'luca' },
  { email: 'mia@example.com', nickname: 'mia' },
]

const LISTINGS = [
  { owner: 'anna', category: 'electronics', title: 'MacBook Air M2, 16 GB', price: 890, location: 'Zürich', description: 'Bought in 2023, battery at 94 %. Comes with the original charger and box.' },
  { owner: 'anna', category: 'home-garden', title: 'Oak dining table, seats six', price: 320, location: 'Zürich', description: 'Solid oak, 180 x 90 cm. A few marks on the surface, otherwise in great shape.' },
  { owner: 'anna', category: 'sports-hobbies', title: 'Road bike, 54 cm frame', price: 640, location: 'Winterthur', description: 'Aluminium frame with a carbon fork, Shimano 105 groupset, serviced this spring.' },
  { owner: 'luca', category: 'electronics', title: 'Sony WH-1000XM5 headphones', price: 210, location: 'Bern', description: 'Noise cancelling headphones in black, used for six months, with case and cable.' },
  { owner: 'luca', category: 'fashion', title: 'Wool winter coat, size M', price: 95, location: 'Bern', description: 'Dark grey wool coat, worn for one season. Dry cleaned and ready to wear.' },
  { owner: 'luca', category: 'vehicles', title: 'Vespa Primavera 125', price: 2900, location: 'Basel', description: 'First owner, 8 400 km, always kept in a garage. Next inspection due in 2028.' },
  { owner: 'mia', category: 'home-garden', title: 'Monstera plant, 1.2 m tall', price: 45, location: 'Luzern', description: 'Healthy and fast growing, comes in a ceramic pot. Pick-up only.' },
  { owner: 'mia', category: 'services', title: 'German lessons for beginners', price: 40, location: 'Zürich', description: 'One-hour private lessons from A1 to B1, online or in person in the city centre.' },
  { owner: 'mia', category: 'sports-hobbies', title: 'Fender acoustic guitar', price: 180, location: 'Luzern', description: 'Dreadnought body with a warm sound, new strings and a padded gig bag included.' },
]

/** Adds demo users and listings. Safe to run repeatedly: it only adds what is missing. */
export async function seedDemoData() {
  await ensureCategories()
  const passwordHash = await hashPassword(DEMO_PASSWORD)

  for (const user of USERS) {
    await prisma.user.upsert({
      where: { email: user.email },
      create: { ...user, passwordHash, emailVerifiedAt: new Date() },
      update: {},
    })
  }

  const demoUsers = await prisma.user.findMany({
    where: { email: { in: USERS.map((user) => user.email) } },
    select: { id: true, nickname: true },
  })
  // With DEMO_OWNER_EMAIL the listings belong to that account, so the site
  // owner can manage them and their profile shows them.
  const realOwner = env.DEMO_OWNER_EMAIL
    ? await prisma.user.findUnique({ where: { email: env.DEMO_OWNER_EMAIL.toLowerCase() }, select: { id: true } })
    : null
  if (env.DEMO_OWNER_EMAIL && !realOwner) {
    logger.warn({ email: env.DEMO_OWNER_EMAIL }, 'DEMO_OWNER_EMAIL has no account yet; register it and restart')
  }
  const demoUserIds = demoUsers.map((user) => user.id)
  if (realOwner) {
    const fromDemo = { sellerId: { in: demoUserIds } }
    const toOwner = { sellerId: realOwner.id }
    await prisma.$transaction([
      prisma.listing.updateMany({ where: { ownerId: { in: demoUserIds } }, data: { ownerId: realOwner.id } }),
      // Their sales, reviews and listing chats move too, so the history stays in one place.
      // Purchases the owner made from a demo user are left alone: nobody sells to themselves.
      prisma.order.updateMany({ where: { ...fromDemo, buyerId: { not: realOwner.id } }, data: toOwner }),
      prisma.review.updateMany({ where: { ...fromDemo, authorId: { not: realOwner.id } }, data: toOwner }),
      prisma.conversation.updateMany({ where: { ...fromDemo, buyerId: { not: realOwner.id } }, data: toOwner }),
    ])
  }
  const knownOwners = realOwner ? [...demoUserIds, realOwner.id] : demoUserIds

  for (const { owner, category, ...listing } of LISTINGS) {
    const exists = await prisma.listing.findFirst({
      where: { title: listing.title, ownerId: { in: knownOwners } },
      select: { id: true },
    })
    if (exists) continue
    const ownerId = realOwner?.id ?? demoUsers.find((user) => user.nickname === owner)?.id
    if (!ownerId) continue
    await prisma.listing.create({
      data: {
        ...listing,
        currency: 'CHF',
        owner: { connect: { id: ownerId } },
        category: { connect: { slug: category } },
      },
    })
  }
  logger.info({ users: USERS.map((user) => user.email), password: DEMO_PASSWORD }, 'Demo data is ready')
}
