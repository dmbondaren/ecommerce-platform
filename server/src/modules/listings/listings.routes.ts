import { Router } from 'express'
import { param } from '../../lib/http'
import { parse } from '../../lib/validation'
import { getAuth, optionalAuth, requireAuth, requireVerified } from '../../middleware/auth'
import { listingInputSchema, listingQuerySchema } from './listing.schemas'
import { listingService } from './listings.service'

export const listingsRouter = Router()

listingsRouter.get('/categories', async (_req, res) => {
  res.json(await listingService.categories())
})

listingsRouter.get('/listings', optionalAuth, async (req, res) => {
  res.json(await listingService.search(parse(listingQuerySchema, req.query), req.auth))
})

// Declared before "/listings/:id" so that it is not read as an id.
listingsRouter.get('/listings/top-searches', async (_req, res) => {
  res.json(await listingService.topSearches())
})

listingsRouter.get('/listings/:id', optionalAuth, async (req, res) => {
  res.json(await listingService.getById(param(req, 'id'), req.auth))
})

listingsRouter.post('/listings', requireAuth, requireVerified, async (req, res) => {
  const listing = await listingService.create(getAuth(req).userId, parse(listingInputSchema, req.body))
  res.status(201).json(listing)
})

listingsRouter.put('/listings/:id', requireAuth, async (req, res) => {
  const input = parse(listingInputSchema, req.body)
  res.json(await listingService.update(getAuth(req).userId, param(req, 'id'), input))
})

listingsRouter.delete('/listings/:id', requireAuth, async (req, res) => {
  await listingService.remove(getAuth(req).userId, param(req, 'id'))
  res.status(204).end()
})

listingsRouter.post('/listings/:id/relist', requireAuth, async (req, res) => {
  res.json(await listingService.relist(getAuth(req).userId, param(req, 'id')))
})

listingsRouter.post('/listings/:id/view', requireAuth, async (req, res) => {
  await listingService.recordView(getAuth(req).userId, param(req, 'id'))
  res.status(204).end()
})

listingsRouter.get('/me/listings', requireAuth, async (req, res) => {
  res.json(await listingService.byOwner(getAuth(req).userId))
})

listingsRouter.get('/me/history', requireAuth, async (req, res) => {
  res.json(await listingService.history(getAuth(req).userId))
})

listingsRouter.get('/me/favorites', requireAuth, async (req, res) => {
  res.json(await listingService.favorites(getAuth(req).userId))
})

listingsRouter.put('/me/favorites/:listingId', requireAuth, async (req, res) => {
  await listingService.setFavorite(getAuth(req).userId, param(req, 'listingId'), true)
  res.status(204).end()
})

listingsRouter.delete('/me/favorites/:listingId', requireAuth, async (req, res) => {
  await listingService.setFavorite(getAuth(req).userId, param(req, 'listingId'), false)
  res.status(204).end()
})

listingsRouter.get('/me/cart', requireAuth, async (req, res) => {
  res.json(await listingService.cart(getAuth(req).userId))
})

listingsRouter.put('/me/cart/:listingId', requireAuth, async (req, res) => {
  await listingService.setInCart(getAuth(req).userId, param(req, 'listingId'), true)
  res.status(204).end()
})

listingsRouter.delete('/me/cart/:listingId', requireAuth, async (req, res) => {
  await listingService.setInCart(getAuth(req).userId, param(req, 'listingId'), false)
  res.status(204).end()
})
