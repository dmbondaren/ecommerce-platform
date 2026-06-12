process.env.JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'test-access-secret'
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'test-refresh-secret'
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000'

const test = require('node:test')
const assert = require('node:assert/strict')
const express = require('express')
const cookieParser = require('cookie-parser')

const ApiError = require('../exceptions/api-error')
const errorMiddleware = require('../middlewares/error-middleware')
const tokenService = require('../service/token-service')
const userService = require('../service/user-service')
const listingService = require('../service/listing-service')
const router = require('../router')

function buildApp() {
  const app = express()
  app.use(express.json())
  app.use(express.urlencoded({ extended: false }))
  app.use(cookieParser())
  app.use('/api', router)
  app.use(errorMiddleware)
  return app
}

async function request(app, path, options = {}) {
  const server = app.listen(0)
  const { port } = server.address()
  try {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      ...options,
      headers: {
        ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type': 'application/json' } : {}),
        ...(options.headers || {})
      }
    })
    const text = await res.text()
    let body = null
    try { body = text ? JSON.parse(text) : null } catch { body = text }
    return { status: res.status, body }
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
}

function bearer(payload) {
  return `Bearer ${tokenService.generateToken(payload).accessToken}`
}

const originalUserService = {}
const originalListingService = {}
const originalConsoleLog = console.log

test.before(() => {
  for (const key of ['registration', 'getUserById', 'getAllUsers']) originalUserService[key] = userService[key]
  for (const key of ['getListings', 'getCategories', 'markChatRead']) originalListingService[key] = listingService[key]
  console.log = (...args) => {
    if (args[0] instanceof ApiError) return
    originalConsoleLog(...args)
  }
})

test.beforeEach(() => {
  userService.registration = async () => {
    throw new Error('registration service should not be called for invalid form data')
  }
  userService.getUserById = async (id) => ({
    id: String(id),
    email: `user-${id}@example.com`,
    isActivated: true
  })
  userService.getAllUsers = async () => ([
    { id: '1', email: 'admin@example.com', isAdmin: true },
    { id: '2', email: 'buyer@example.com', isAdmin: false }
  ])
  listingService.getListings = async (search, minPrice, maxPrice, category, sortBy) => ([{
    _id: '10',
    title: search || 'Тестове оголошення',
    price: Number(minPrice || 100),
    category: category || 'Техніка',
    sortBy
  }])
  listingService.getCategories = async () => ['Техніка', 'Робота', 'Доставка', 'Цифрові послуги']
  listingService.markChatRead = async (userId, roomId) => ({ userId: String(userId), roomId, count: 2 })
})

test.after(() => {
  Object.assign(userService, originalUserService)
  Object.assign(listingService, originalListingService)
  console.log = originalConsoleLog
})

test('JWT: protected route rejects missing and invalid access tokens', async () => {
  const app = buildApp()

  const missing = await request(app, '/api/me')
  assert.equal(missing.status, 401)
  assert.equal(missing.body.message, 'Користувач не авторизований')

  const invalid = await request(app, '/api/me', {
    headers: { Authorization: 'Bearer broken-token' }
  })
  assert.equal(invalid.status, 401)
  assert.equal(invalid.body.message, 'Користувач не авторизований')
})

test('JWT: protected route accepts a valid access token and exposes req.user', async () => {
  const app = buildApp()
  const res = await request(app, '/api/me', {
    headers: { Authorization: bearer({ id: 7, email: 'user@example.com', isAdmin: false, isSuperAdmin: false }) }
  })

  assert.equal(res.status, 200)
  assert.equal(res.body.id, '7')
  assert.equal(res.body.email, 'user-7@example.com')
})

test('roles: regular users cannot access the admin user list', async () => {
  const app = buildApp()
  const res = await request(app, '/api/users', {
    headers: { Authorization: bearer({ id: 2, email: 'buyer@example.com', isAdmin: false, isSuperAdmin: false }) }
  })

  assert.equal(res.status, 400)
  assert.equal(res.body.message, 'Потрібні права адміністратора')
})

test('roles: admins can access the admin user list', async () => {
  const app = buildApp()
  const res = await request(app, '/api/users', {
    headers: { Authorization: bearer({ id: 1, email: 'admin@example.com', isAdmin: true, isSuperAdmin: false }) }
  })

  assert.equal(res.status, 200)
  assert.equal(res.body.length, 2)
  assert.equal(res.body[0].email, 'admin@example.com')
})

test('forms: registration route rejects invalid email and short password before service call', async () => {
  const app = buildApp()
  const res = await request(app, '/api/registration', {
    method: 'POST',
    body: JSON.stringify({ email: 'not-email', password: '12' })
  })

  assert.equal(res.status, 400)
  assert.equal(res.body.message, 'Помилка валідації')
  assert.ok(Array.isArray(res.body.errors))
})

test('listings: public listing search passes filters to the service', async () => {
  const app = buildApp()
  const res = await request(app, '/api/listings?search=phone&minPrice=10&maxPrice=500&category=%D0%A2%D0%B5%D1%85%D0%BD%D1%96%D0%BA%D0%B0&sortBy=price_asc')

  assert.equal(res.status, 200)
  assert.equal(res.body[0].title, 'phone')
  assert.equal(res.body[0].price, 10)
  assert.equal(res.body[0].category, 'Техніка')
  assert.equal(res.body[0].sortBy, 'price_asc')
})

test('categories: public route returns category lookup values from the service', async () => {
  const app = buildApp()
  const res = await request(app, '/api/categories')

  assert.equal(res.status, 200)
  assert.deepEqual(res.body, ['Техніка', 'Робота', 'Доставка', 'Цифрові послуги'])
})

test('chat: read receipts route marks the selected room as read for the authorized user', async () => {
  const app = buildApp()
  const res = await request(app, '/api/my/chat-read', {
    method: 'POST',
    headers: { Authorization: bearer({ id: 5, email: 'reader@example.com', isAdmin: false, isSuperAdmin: false }) },
    body: JSON.stringify({ roomId: 'buy-10-5' })
  })

  assert.equal(res.status, 200)
  assert.equal(res.body.userId, '5')
  assert.equal(res.body.roomId, 'buy-10-5')
  assert.equal(res.body.count, 2)
})

test('listing service: form validation rejects incomplete listing data before database write', async () => {
  await assert.rejects(
    () => listingService.createListing(1, {
      title: '',
      description: 'Опис є',
      price: '100',
      imageUrl: 'http://localhost/image.jpg',
      imageUrls: ['http://localhost/image.jpg'],
      location: 'Київ',
      category: 'Техніка'
    }),
    (error) => error instanceof ApiError && error.status === 400
  )

  await assert.rejects(
    () => listingService.createListing(1, {
      title: 'Товар',
      description: 'Опис є',
      price: '-5',
      imageUrl: 'http://localhost/image.jpg',
      imageUrls: ['http://localhost/image.jpg'],
      location: 'Київ',
      category: 'Техніка'
    }),
    (error) => error instanceof ApiError && error.status === 400
  )
})

test('listing service: archived purchase snapshots preserve sold/deleted card data', () => {
  const archived = listingService.mapPurchaseListing({
    listing_id: 44,
    listing_title_snapshot: 'Архівний ноутбук',
    listing_description_snapshot: 'Збережений опис',
    listing_image_url_snapshot: 'http://localhost/uploads/notebook.jpg',
    listing_image_urls_snapshot: JSON.stringify(['http://localhost/uploads/notebook.jpg']),
    listing_currency_snapshot: 'USD',
    listing_category_snapshot: 'Техніка',
    seller_id_snapshot: 3,
    price: 500
  }, null)

  assert.equal(archived._id, '44')
  assert.equal(archived.title, 'Архівний ноутбук')
  assert.equal(archived.description, 'Збережений опис')
  assert.equal(archived.currency, 'USD')
  assert.equal(archived.category, 'Техніка')
  assert.equal(archived.ownerId, '3')
  assert.deepEqual(archived.imageUrls, ['http://localhost/uploads/notebook.jpg'])
})
