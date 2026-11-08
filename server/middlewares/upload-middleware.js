const multer = require('multer')
const path = require('path')
const fs = require('fs')
const crypto = require('crypto')
const ApiError = require('../exceptions/api-error')

const uploadDir = path.resolve(__dirname, '../uploads')
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

const ALLOWED_TYPES = {
    'image/jpeg': '.jpg',
    'image/png': '.png',
    'image/webp': '.webp',
    'image/gif': '.gif'
}

const storage = multer.diskStorage({
    destination: (_, __, cb) => cb(null, uploadDir),
    filename: (_, file, cb) =>
        cb(null, `${Date.now()}-${crypto.randomUUID()}${ALLOWED_TYPES[file.mimetype]}`)
})

const fileFilter = (_, file, cb) => {
    if (ALLOWED_TYPES[file.mimetype]) return cb(null, true)
    cb(ApiError.BadRequest('Дозволені лише зображення JPG, PNG, WEBP або GIF'))
}

module.exports = multer({ storage, fileFilter, limits: { fileSize: 10 * 1024 * 1024 } })