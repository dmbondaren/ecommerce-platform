import type { ErrorRequestHandler, RequestHandler } from 'express'
import { Prisma } from '@prisma/client'
import { MulterError } from 'multer'
import { AppError } from '../lib/errors'
import { logger } from '../lib/logger'

export const notFoundHandler: RequestHandler = (req, res) => {
  res.status(404).json({ error: { code: 'NOT_FOUND', message: `No route for ${req.method} ${req.path}` } })
}

function toAppError(err: unknown): AppError | null {
  if (err instanceof AppError) return err
  if (err instanceof MulterError) {
    return err.code === 'LIMIT_FILE_SIZE'
      ? new AppError(413, 'FILE_TOO_LARGE', 'File is too large (10 MB maximum)')
      : new AppError(400, 'UPLOAD_FAILED', 'File upload failed')
  }
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === 'P2002') return new AppError(409, 'CONFLICT', 'This value is already in use')
    if (err.code === 'P2025') return new AppError(404, 'NOT_FOUND', 'Resource not found')
  }
  // Malformed JSON bodies and oversized payloads raised by express.json().
  if (typeof err === 'object' && err !== null && 'type' in err) {
    const type = (err as { type?: unknown }).type
    if (type === 'entity.parse.failed') return new AppError(400, 'BAD_REQUEST', 'Malformed JSON body')
    if (type === 'entity.too.large') return new AppError(413, 'PAYLOAD_TOO_LARGE', 'Request body is too large')
  }
  return null
}

// Express recognises error handlers by their four-argument signature.
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  const appError = toAppError(err)
  if (appError) {
    res.status(appError.status).json({
      error: { code: appError.code, message: appError.message, details: appError.details },
    })
    return
  }
  logger.error({ err, method: req.method, path: req.path }, 'Unhandled error')
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Something went wrong on our side' } })
}
