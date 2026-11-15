import { Router } from 'express'
import { z } from 'zod'
import { pageSchema, param } from '../../lib/http'
import { parse } from '../../lib/validation'
import { getAuth, requireAdmin, requireAuth, requireSuperAdmin } from '../../middleware/auth'
import { reportService } from '../reports/reports.service'
import { adminService, banSchema, reasonSchema, roleSchema, userSearchSchema } from './admin.service'

const reportQuerySchema = z.object({ status: z.enum(['OPEN', 'RESOLVED']).default('OPEN') })

export const adminRouter = Router()
adminRouter.use(requireAuth, requireAdmin)

adminRouter.get('/users', async (req, res) => {
  res.json(await adminService.users(parse(pageSchema.merge(userSearchSchema), req.query)))
})

adminRouter.get('/users/:id', async (req, res) => {
  res.json(await adminService.user(param(req, 'id')))
})

adminRouter.post('/users/:id/ban', async (req, res) => {
  res.json(await adminService.ban(getAuth(req), param(req, 'id'), parse(banSchema, req.body)))
})

adminRouter.delete('/users/:id/ban', async (req, res) => {
  res.json(await adminService.unban(getAuth(req), param(req, 'id')))
})

adminRouter.put('/users/:id/role', requireSuperAdmin, async (req, res) => {
  const { role } = parse(roleSchema, req.body)
  res.json(await adminService.setRole(getAuth(req), param(req, 'id'), role))
})

// POST with a body instead of DELETE: the reason is mandatory and DELETE bodies are unreliable.
adminRouter.post('/users/:id/delete', requireSuperAdmin, async (req, res) => {
  const { reason } = parse(reasonSchema, req.body)
  await adminService.deleteUser(getAuth(req), param(req, 'id'), reason)
  res.status(204).end()
})

adminRouter.get('/listings', async (_req, res) => {
  res.json(await adminService.moderationQueue())
})

adminRouter.post('/listings/:id/deactivate', async (req, res) => {
  const { reason } = parse(reasonSchema, req.body)
  res.json(await adminService.deactivateListing(getAuth(req), param(req, 'id'), reason))
})

adminRouter.post('/listings/:id/activate', async (req, res) => {
  res.json(await adminService.activateListing(getAuth(req), param(req, 'id')))
})

adminRouter.post('/listings/:id/remove', async (req, res) => {
  const { reason } = parse(reasonSchema, req.body)
  await adminService.removeListing(getAuth(req), param(req, 'id'), reason)
  res.status(204).end()
})

adminRouter.get('/reports', async (req, res) => {
  res.json(await reportService.list(parse(reportQuerySchema, req.query).status))
})

adminRouter.post('/reports/:id/resolve', async (req, res) => {
  res.json(await reportService.resolve(getAuth(req).userId, param(req, 'id')))
})

adminRouter.get('/system', (_req, res) => {
  res.json(adminService.system())
})

adminRouter.post('/system/test-email', async (req, res) => {
  res.json(await adminService.sendTestEmail(getAuth(req)))
})

adminRouter.get('/audit-log', async (req, res) => {
  const { page, pageSize } = parse(pageSchema, req.query)
  res.json(await adminService.auditLog(page, pageSize))
})
