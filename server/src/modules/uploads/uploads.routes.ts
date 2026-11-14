import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { Router, type RequestHandler } from 'express'
import multer from 'multer'
import { env } from '../../config/env'
import { badRequest, notFound } from '../../lib/errors'
import { param } from '../../lib/http'
import { prisma } from '../../lib/prisma'
import { requireAuth } from '../../middleware/auth'
import { writeLimiter } from '../../middleware/rate-limit'

const EXTENSIONS: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
}

const useDatabase = env.STORAGE_DRIVER === 'database'

export const uploadDir = path.resolve(env.UPLOAD_DIR)
if (!useDatabase) mkdirSync(uploadDir, { recursive: true })

// The stored name never contains anything the client sent, and the extension
// comes from an allow-list, so an upload cannot be served as HTML or SVG even
// if the declared type was a lie.
const newName = (mimetype: string) => `${randomUUID()}${EXTENSIONS[mimetype] ?? ''}`

const upload = multer({
  storage: useDatabase
    ? multer.memoryStorage()
    : multer.diskStorage({
        destination: uploadDir,
        filename: (_req, file, cb) => cb(null, newName(file.mimetype)),
      }),
  limits: { fileSize: 10 * 1024 * 1024, files: 10 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype in EXTENSIONS) cb(null, true)
    else cb(badRequest('Only JPEG, PNG, WebP and GIF images are allowed'))
  },
})

/** Serves an image kept in the database, under the same address a file on disk would have. */
export const serveStoredFile: RequestHandler = async (req, res) => {
  const file = await prisma.storedFile.findUnique({ where: { name: param(req, 'name') } })
  if (!file) throw notFound('File')
  res
    .set({
      'Content-Type': file.contentType,
      // Names are random and never reused, so the content behind one never changes.
      'Cache-Control': 'public, max-age=31536000, immutable',
    })
    .send(Buffer.from(file.data))
}

export const uploadsRouter = Router()

uploadsRouter.post('/', requireAuth, writeLimiter, upload.array('files', 10), async (req, res) => {
  const files = Array.isArray(req.files) ? req.files : []
  if (files.length === 0) throw badRequest('No files were uploaded')
  if (!useDatabase) {
    res.status(201).json({
      files: files.map((file) => ({ url: `/uploads/${file.filename}`, name: file.originalname })),
    })
    return
  }
  const stored = files.map((file) => ({ file, name: newName(file.mimetype) }))
  await prisma.storedFile.createMany({
    data: stored.map(({ file, name }) => ({ name, contentType: file.mimetype, data: file.buffer })),
  })
  res.status(201).json({
    files: stored.map(({ file, name }) => ({ url: `/uploads/${name}`, name: file.originalname })),
  })
})
