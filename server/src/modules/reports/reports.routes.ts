import { Router } from 'express'
import { param } from '../../lib/http'
import { parse } from '../../lib/validation'
import { getAuth, requireAuth } from '../../middleware/auth'
import { writeLimiter } from '../../middleware/rate-limit'
import { reportInputSchema, reportService } from './reports.service'

export const reportsRouter = Router()

reportsRouter.post('/listings/:id/reports', requireAuth, writeLimiter, async (req, res) => {
  const input = parse(reportInputSchema, req.body)
  res.status(201).json(await reportService.create(getAuth(req).userId, param(req, 'id'), input))
})

reportsRouter.get('/me/reports', requireAuth, async (req, res) => {
  res.json(await reportService.mine(getAuth(req).userId))
})
