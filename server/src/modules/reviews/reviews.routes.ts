import { Router } from 'express'
import { param } from '../../lib/http'
import { parse } from '../../lib/validation'
import { getAuth, requireAuth } from '../../middleware/auth'
import { writeLimiter } from '../../middleware/rate-limit'
import { replySchema, reviewService, voteSchema } from './reviews.service'

export const reviewsRouter = Router()
reviewsRouter.use(requireAuth)

reviewsRouter.post('/:id/vote', async (req, res) => {
  const { type } = parse(voteSchema, req.body)
  res.json(await reviewService.vote(getAuth(req).userId, param(req, 'id'), type))
})

reviewsRouter.post('/:id/replies', writeLimiter, async (req, res) => {
  const { body } = parse(replySchema, req.body)
  res.status(201).json(await reviewService.reply(getAuth(req).userId, param(req, 'id'), body))
})
