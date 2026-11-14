import { Router } from 'express'
import { param } from '../../lib/http'
import { parse } from '../../lib/validation'
import { getAuth, requireAuth } from '../../middleware/auth'
import { writeLimiter } from '../../middleware/rate-limit'
import {
  conversationService,
  editMessageSchema,
  historyQuerySchema,
  messageInputSchema,
  openConversationSchema,
} from './conversations.service'

/**
 * Messages are sent over HTTP, where they are validated, rate limited and
 * answered with a status code; the WebSocket only pushes the result to the
 * other participants.
 */
export const conversationsRouter = Router()
conversationsRouter.use(requireAuth)

conversationsRouter.get('/', async (req, res) => {
  res.json(await conversationService.list(getAuth(req)))
})

conversationsRouter.post('/', async (req, res) => {
  res.json(await conversationService.open(getAuth(req), parse(openConversationSchema, req.body)))
})

conversationsRouter.get('/unread-count', async (req, res) => {
  res.json({ count: await conversationService.unreadTotal(getAuth(req)) })
})

conversationsRouter.patch('/messages/:messageId', async (req, res) => {
  const { body } = parse(editMessageSchema, req.body)
  res.json(await conversationService.editMessage(getAuth(req), param(req, 'messageId'), body))
})

conversationsRouter.delete('/messages/:messageId', async (req, res) => {
  await conversationService.deleteMessage(getAuth(req), param(req, 'messageId'))
  res.status(204).end()
})

conversationsRouter.get('/:id', async (req, res) => {
  res.json(await conversationService.get(getAuth(req), param(req, 'id')))
})

conversationsRouter.get('/:id/messages', async (req, res) => {
  const { before } = parse(historyQuerySchema, req.query)
  res.json(await conversationService.messages(getAuth(req), param(req, 'id'), before))
})

conversationsRouter.post('/:id/messages', writeLimiter, async (req, res) => {
  const input = parse(messageInputSchema, req.body)
  res.status(201).json(await conversationService.send(getAuth(req), param(req, 'id'), input))
})

conversationsRouter.post('/:id/read', async (req, res) => {
  await conversationService.markRead(getAuth(req), param(req, 'id'))
  res.status(204).end()
})

conversationsRouter.delete('/:id', async (req, res) => {
  await conversationService.hide(getAuth(req), param(req, 'id'))
  res.status(204).end()
})
