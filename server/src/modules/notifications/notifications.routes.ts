import { Router } from 'express'
import { getAuth, requireAuth } from '../../middleware/auth'
import { notificationService } from './notifications.service'

export const notificationsRouter = Router()
notificationsRouter.use(requireAuth)

notificationsRouter.get('/', async (req, res) => {
  res.json(await notificationService.list(getAuth(req).userId))
})

notificationsRouter.post('/read-all', async (req, res) => {
  await notificationService.markAllRead(getAuth(req).userId)
  res.status(204).end()
})
