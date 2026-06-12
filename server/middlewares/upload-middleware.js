const multer = require('multer')
const path = require('path')
const fs = require('fs')

const uploadDir = path.resolve(__dirname, '../uploads')
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true })

const storage = multer.diskStorage({
  destination: (_, __, cb) => cb(null, uploadDir),
  filename: (_, file, cb) => cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, '-')}`)
})

const fileFilter = (_, file, cb) => {
  if (file.mimetype.startsWith('image/')) return cb(null, true)
  cb(new Error('Only image files are allowed'))
}

module.exports = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } })
