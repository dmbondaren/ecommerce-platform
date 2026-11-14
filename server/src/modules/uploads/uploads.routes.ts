import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { Router } from 'express'
import multer from 'multer'
import { env } from '../../config/env'
import { badRequest } from '../../lib/errors'
import { requireAuth } from '../../middleware/auth'
import { writeLimiter } from '../../middleware/rate-limit'

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
}

export const uploadDir = path.resolve(env.UPLOAD_DIR)
mkdirSync(uploadDir, { recursive: true })

const upload = multer({
  storage: multer.diskStorage({
    destination: uploadDir,
    // The stored name never contains anything the client sent, and the
    // extension comes from an allow-list, so an upload cannot be served as
    // HTML or SVG even if the declared type was a lie.
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${EXTENSIONS[file.mimetype] ?? ''}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype in EXTENSIONS) cb(null, true)
    else cb(badRequest('Only JPEG, PNG, WebP and GIF images are allowed'))
  },
})

export const uploadsRouter = Router()

uploadsRouter.post('/', requireAuth, writeLimiter, upload.array('files', 10), (req, res) => {
  const files = Array.isArray(req.files) ? req.files : []
  if (files.length === 0) throw badRequest('No files were uploaded')
  res.status(201).json({
    files: files.map((file) => ({ url: `/uploads/${file.filename}`, name: file.originalname })),
  })
})
