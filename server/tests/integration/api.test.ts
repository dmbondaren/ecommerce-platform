/**
 * End-to-end tests of the HTTP API against a real PostgreSQL database.
 * Start one with `docker compose up -d db`; the test database and its schema
 * are created automatically.
 */
import { execSync } from 'node:child_process'
import request from 'supertest'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from '../../src/app'
import { ensureCategories } from '../../src/bootstrap'
import { prisma } from '../../src/lib/prisma'
import { orderService } from '../../src/modules/orders/orders.service'

const app = createApp()
const api = '/api/v1'
const password = 'correct-horse-battery'

async function register(email: string, verified = true) {
  const response = await request(app).post(`${api}/auth/register`).send({ email, password }).expect(201)
  if (verified) {
    await prisma.user.update({ where: { email }, data: { emailVerifiedAt: new Date() } })
  }
  return { token: response.body.accessToken as string, id: response.body.user.id as string }
}

const bearer = (token: string) => ({ Authorization: `Bearer ${token}` })

let categoryId: number

const listingBody = () => ({
  title: 'Road bike, 54 cm',
  description: 'Aluminium frame, serviced this spring.',
  price: 640.5,
  currency: 'CHF',
  categoryId,
  imageUrls: ['/uploads/3f0c9a52-6f0e-4c58-9a59-0b5f3c1b9a10.jpg'],
})

beforeAll(async () => {
  if (!/test/i.test(new URL(process.env.DATABASE_URL ?? '').pathname)) {
    throw new Error('Refusing to run: integration tests empty the database and need one named "*test*"')
  }
  // Creates the database when it is missing and brings its schema up to date.
  execSync('npx prisma db push --skip-generate --accept-data-loss', { stdio: 'pipe' })
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "User", "Category", "SearchStat" RESTART IDENTITY CASCADE')
  await ensureCategories()
  categoryId = (await prisma.category.findFirstOrThrow()).id
}, 60_000)

afterAll(async () => {
  await prisma.$disconnect()
})

describe('authentication', () => {
  it('registers, rejects duplicates and wrong passwords', async () => {
    await register('auth@example.com')
    await request(app).post(`${api}/auth/register`).send({ email: 'AUTH@example.com', password }).expect(409)
    await request(app).post(`${api}/auth/login`).send({ email: 'auth@example.com', password: 'wrong' }).expect(401)
    const login = await request(app).post(`${api}/auth/login`).send({ email: 'auth@example.com', password }).expect(200)
    expect(login.body.user.email).toBe('auth@example.com')
    expect(login.body.user).not.toHaveProperty('passwordHash')
  })

  it('validates input and protects private routes', async () => {
    const invalid = await request(app).post(`${api}/auth/register`).send({ email: 'nope', password: '1' }).expect(400)
    expect(invalid.body.error.code).toBe('BAD_REQUEST')
    await request(app).get(`${api}/me`).expect(401)
    await request(app).get(`${api}/me`).set(bearer('garbage')).expect(401)
  })

  it('rotates refresh tokens and revokes the session when one is reused', async () => {
    const agent = request.agent(app)
    const login = await agent.post(`${api}/auth/login`).send({ email: 'auth@example.com', password }).expect(200)
    const firstCookie = (login.headers['set-cookie'] as unknown as string[])[0]?.split(';')[0] ?? ''

    await agent.post(`${api}/auth/refresh`).expect(200)
    // The first cookie was replaced by the rotation, so presenting it again is a replay.
    await request(app).post(`${api}/auth/refresh`).set('Cookie', firstCookie).expect(401)
    // ...which also invalidates the legitimate, newer session.
    await agent.post(`${api}/auth/refresh`).expect(401)
  })
})

describe('listings and checkout', () => {
  it('requires a verified e-mail to publish', async () => {
    const unverified = await register('unverified@example.com', false)
    await request(app).post(`${api}/listings`).set(bearer(unverified.token)).send(listingBody()).expect(403)
  })

  it('publishes, finds, edits and protects a listing', async () => {
    const seller = await register('seller@example.com')
    const stranger = await register('stranger@example.com')

    const created = await request(app).post(`${api}/listings`).set(bearer(seller.token)).send(listingBody()).expect(201)
    const id = created.body.id as string
    expect(created.body.price).toBe(640.5)
    expect(created.body.owner).not.toHaveProperty('email')

    const found = await request(app).get(`${api}/listings`).query({ q: 'ROAD BIKE', maxPrice: 700 }).expect(200)
    expect(found.body.items.map((item: { id: string }) => item.id)).toContain(id)
    const missed = await request(app).get(`${api}/listings`).query({ maxPrice: 100 }).expect(200)
    expect(missed.body.items).toHaveLength(0)

    await request(app).put(`${api}/listings/${id}`).set(bearer(stranger.token)).send(listingBody()).expect(404)
    await request(app).delete(`${api}/listings/${id}`).set(bearer(stranger.token)).expect(404)
    await request(app).get(`${api}/admin/users`).set(bearer(stranger.token)).expect(403)
  })

  it('reserves an item for exactly one buyer and sells it on payment', async () => {
    const seller = await register('seller2@example.com')
    const buyer = await register('buyer@example.com')
    const rival = await register('rival@example.com')
    const created = await request(app).post(`${api}/listings`).set(bearer(seller.token)).send(listingBody()).expect(201)
    const listingIds = [created.body.id as string]

    await request(app).post(`${api}/orders`).set(bearer(seller.token)).send({ listingIds }).expect(409)

    const results = await Promise.all([
      request(app).post(`${api}/orders`).set(bearer(buyer.token)).send({ listingIds }),
      request(app).post(`${api}/orders`).set(bearer(rival.token)).send({ listingIds }),
    ])
    expect(results.map((result) => result.status).sort()).toEqual([201, 409])
    expect(await prisma.order.count({ where: { listingId: listingIds[0] } })).toBe(1)

    const winner = results[0]?.status === 201 ? buyer : rival
    const loser = winner === buyer ? rival : buyer
    const orderId = (await prisma.order.findFirstOrThrow({ where: { listingId: listingIds[0] } })).id
    const review = (token: string) => request(app).post(`${api}/orders/${orderId}/review`).set(bearer(token))

    // Until it is paid the item is reserved: visible, not buyable, not reviewable.
    const reserved = await request(app).get(`${api}/listings/${listingIds[0]}`).expect(200)
    expect(reserved.body.status).toBe('RESERVED')
    const availableOnly = await request(app).get(`${api}/listings`).query({ available: 1 }).expect(200)
    expect(availableOnly.body.items.map((item: { id: string }) => item.id)).not.toContain(listingIds[0])
    await review(winner.token).send({ rating: 5 }).expect(409)

    await request(app).post(`${api}/orders/${orderId}/confirm-payment`).set(bearer(loser.token)).expect(404)
    const paid = await request(app).post(`${api}/orders/${orderId}/confirm-payment`).set(bearer(winner.token)).expect(200)
    expect(paid.body.status).toBe('PAID')
    await request(app).post(`${api}/orders/${orderId}/confirm-payment`).set(bearer(winner.token)).expect(409)

    await review(loser.token).send({ rating: 5 }).expect(404)
    await review(winner.token).send({ rating: 5 }).expect(201)
    await review(winner.token).send({ rating: 1 }).expect(409)

    const profile = await request(app).get(`${api}/users/${seller.id}`).expect(200)
    expect(profile.body.stats).toMatchObject({ rating: 5, reviewCount: 1, sales: 1 })
  })
})

describe('reservations', () => {
  it('releases an unpaid reservation when its time is up, and lets the buyer cancel', async () => {
    const seller = await register('seller3@example.com')
    const buyer = await register('buyer3@example.com')
    const created = await request(app).post(`${api}/listings`).set(bearer(seller.token)).send(listingBody()).expect(201)
    const id = created.body.id as string
    const statusOf = async () => (await prisma.listing.findUniqueOrThrow({ where: { id } })).status

    const first = await request(app).post(`${api}/orders`).set(bearer(buyer.token)).send({ listingIds: [id] }).expect(201)
    expect(first.body[0].payment.reference).toMatch(/^MP-[A-Z0-9]+$/)
    await request(app).post(`${api}/orders/${first.body[0].id}/cancel`).set(bearer(buyer.token)).expect(200)
    expect(await statusOf()).toBe('ACTIVE')

    const second = await request(app).post(`${api}/orders`).set(bearer(buyer.token)).send({ listingIds: [id] }).expect(201)
    expect(await statusOf()).toBe('RESERVED')
    expect(await orderService.expireOverdue(new Date(Date.now() + 60 * 60 * 1000))).toBeGreaterThanOrEqual(1)
    expect(await statusOf()).toBe('ACTIVE')
    await request(app).post(`${api}/orders/${second.body[0].id}/confirm-payment`).set(bearer(buyer.token)).expect(409)
  })

  it('holds a suspicious listing back for moderation', async () => {
    const seller = await register('seller4@example.com')
    const created = await request(app)
      .post(`${api}/listings`)
      .set(bearer(seller.token))
      .send({ ...listingBody(), description: 'Payment in advance via Western Union only.' })
      .expect(201)
    expect(created.body.status).toBe('PENDING_REVIEW')
    await request(app).get(`${api}/listings/${created.body.id}`).expect(404)
  })

  it('stores an optional map position', async () => {
    const seller = await register('seller5@example.com')
    const created = await request(app)
      .post(`${api}/listings`)
      .set(bearer(seller.token))
      .send({ ...listingBody(), coordinates: { lat: 47.3769, lng: 8.5417 } })
      .expect(201)
    expect(created.body.coordinates).toEqual({ lat: 47.3769, lng: 8.5417 })
    await request(app)
      .post(`${api}/listings`)
      .set(bearer(seller.token))
      .send({ ...listingBody(), coordinates: { lat: 147, lng: 8 } })
      .expect(400)
  })
})

describe('error handling', () => {
  it('answers unknown routes and malformed JSON with structured errors', async () => {
    const missing = await request(app).get(`${api}/nope`).expect(404)
    expect(missing.body.error.code).toBe('NOT_FOUND')
    const malformed = await request(app)
      .post(`${api}/auth/login`)
      .set('Content-Type', 'application/json')
      .send('{"email":')
      .expect(400)
    expect(malformed.body.error.message).toBe('Malformed JSON body')
  })
})
