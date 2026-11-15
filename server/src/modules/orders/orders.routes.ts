import { Router } from 'express'
import { z } from 'zod'
import { param } from '../../lib/http'
import { parse } from '../../lib/validation'
import { getAuth, requireAuth } from '../../middleware/auth'
import { reviewInputSchema, reviewService } from '../reviews/reviews.service'
import { orderService } from './orders.service'

const checkoutSchema = z.object({ listingIds: z.array(z.string().min(1).max(40)).min(1).max(20) })

export const ordersRouter = Router()

ordersRouter.post('/orders', requireAuth, async (req, res) => {
  const { listingIds } = parse(checkoutSchema, req.body)
  res.status(201).json(await orderService.checkout(getAuth(req).userId, listingIds))
})

ordersRouter.post('/orders/:id/confirm-payment', requireAuth, async (req, res) => {
  res.json(await orderService.confirmPayment(getAuth(req).userId, param(req, 'id')))
})

ordersRouter.post('/orders/:id/cancel', requireAuth, async (req, res) => {
  res.json(await orderService.cancel(getAuth(req).userId, param(req, 'id')))
})

ordersRouter.post('/orders/:id/skip-review', requireAuth, async (req, res) => {
  await orderService.skipReview(getAuth(req).userId, param(req, 'id'))
  res.status(204).end()
})

ordersRouter.post('/orders/:id/review', requireAuth, async (req, res) => {
  const input = parse(reviewInputSchema, req.body)
  res.status(201).json(await reviewService.create(getAuth(req).userId, param(req, 'id'), input))
})

ordersRouter.get('/me/purchases', requireAuth, async (req, res) => {
  res.json(await orderService.purchases(getAuth(req).userId))
})

ordersRouter.get('/me/sales/summary', requireAuth, async (req, res) => {
  res.json(await orderService.salesSummary(getAuth(req).userId))
})

ordersRouter.get('/me/sales', requireAuth, async (req, res) => {
  res.json(await orderService.sales(getAuth(req).userId))
})
