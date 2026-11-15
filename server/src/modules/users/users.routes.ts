import { Router } from 'express'
import { param } from '../../lib/http'
import { parse } from '../../lib/validation'
import { getAuth, optionalAuth, requireAuth } from '../../middleware/auth'
import { listingService } from '../listings/listings.service'
import { reviewService } from '../reviews/reviews.service'
import { accountPatchSchema, userService } from './users.service'

export const usersRouter = Router()

usersRouter.get('/me', requireAuth, async (req, res) => {
  res.json(await userService.account(getAuth(req).userId))
})

usersRouter.patch('/me', requireAuth, async (req, res) => {
  res.json(await userService.updateAccount(getAuth(req).userId, parse(accountPatchSchema, req.body)))
})

usersRouter.get('/users/:id', optionalAuth, async (req, res) => {
  res.json(await userService.publicProfile(param(req, 'id'), req.auth !== undefined))
})

usersRouter.get('/users/:id/activity', async (req, res) => {
  res.json(await userService.activity(param(req, 'id')))
})

usersRouter.get('/users/:id/listings', async (req, res) => {
  res.json(await listingService.byOwner(param(req, 'id'), { onlyActive: true }))
})

usersRouter.get('/users/:id/reviews', optionalAuth, async (req, res) => {
  res.json(await reviewService.forSeller(param(req, 'id'), req.auth?.userId))
})
