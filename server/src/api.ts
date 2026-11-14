import { Router } from 'express'
import { adminRouter } from './modules/admin/admin.routes'
import { authRouter } from './modules/auth/auth.routes'
import { conversationsRouter } from './modules/conversations/conversations.routes'
import { listingsRouter } from './modules/listings/listings.routes'
import { notificationsRouter } from './modules/notifications/notifications.routes'
import { ordersRouter } from './modules/orders/orders.routes'
import { reportsRouter } from './modules/reports/reports.routes'
import { reviewsRouter } from './modules/reviews/reviews.routes'
import { uploadsRouter } from './modules/uploads/uploads.routes'
import { usersRouter } from './modules/users/users.routes'

export const apiRouter = Router()

// Routers with a prefix guard everything below it (e.g. all of /admin).
apiRouter.use('/auth', authRouter)
apiRouter.use('/admin', adminRouter)
apiRouter.use('/conversations', conversationsRouter)
apiRouter.use('/reviews', reviewsRouter)
apiRouter.use('/uploads', uploadsRouter)
apiRouter.use('/me/notifications', notificationsRouter)

// These declare full paths and protect each route individually.
apiRouter.use(usersRouter)
apiRouter.use(listingsRouter)
apiRouter.use(ordersRouter)
apiRouter.use(reportsRouter)
