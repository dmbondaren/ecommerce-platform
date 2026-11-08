const multer = require('multer')
const ApiError = require('../exceptions/api-error')

module.exports = function (err, req, res, next) {
    console.log(err)
    if (err instanceof ApiError) {
        return res.status(err.status).json({ message: err.message, errors: err.errors })
    }
    if (err instanceof multer.MulterError) {
        const tooLarge = err.code === 'LIMIT_FILE_SIZE'
        return res.status(tooLarge ? 413 : 400).json({
            message: tooLarge ? 'Файл занадто великий (максимум 10 МБ)' : 'Помилка завантаження файлу',
            errors: []
        })
    }
    return res.status(500).json({ message: 'Внутрішня помилка сервера' })
}