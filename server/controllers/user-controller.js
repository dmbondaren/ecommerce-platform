const userService = require('../service/user-service')
const { validationResult } = require('express-validator')
const ApiError = require('../exceptions/api-error')
const cookieOptions = require('../utils/cookie-options')

class UserController {
  async registration(req, res, next) {
    try {
      const errors = validationResult(req)
      if (!errors.isEmpty()) return next(ApiError.BadRequest('Помилка валідації', errors.array()))
      const { email, password } = req.body
      const userData = await userService.registration(email, password)
      res.cookie('refreshToken', userData.refreshToken, cookieOptions)
      return res.json(userData)
    } catch (e) { next(e) }
  }

  async login(req, res, next) {
    try {
      const { email, password } = req.body
      const userData = await userService.login(email, password)
      res.cookie('refreshToken', userData.refreshToken, cookieOptions)
      return res.json(userData)
    } catch (e) { next(e) }
  }

  async logout(req, res, next) {
    try {
      const { refreshToken } = req.cookies
      const token = await userService.logout(refreshToken)
      res.clearCookie('refreshToken')
      return res.json(token)
    } catch (e) { next(e) }
  }

  async activate(req, res, next) {
    try {
      await userService.activate(req.params.link)
      return res.redirect(process.env.CLIENT_URL)
    } catch (e) { next(e) }
  }

  async requestPasswordReset(req, res, next) {
    try { return res.json(await userService.requestPasswordReset(req.body.email)) } catch (e) { next(e) }
  }

  async passwordResetPage(req, res, next) {
    try {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      return res.send(await userService.getPasswordResetPage(req.params.link))
    } catch (e) { next(e) }
  }

  async passwordResetSubmit(req, res, next) {
    try {
      res.setHeader('Content-Type', 'text/html; charset=utf-8')
      return res.send(await userService.resetPassword(req.params.link, req.body.password, req.body.confirmPassword))
    } catch (e) { next(e) }
  }

  async refreshToken(req, res, next) {
    try {
      const { refreshToken } = req.cookies
      const userData = await userService.refresh(refreshToken)
      res.cookie('refreshToken', userData.refreshToken, cookieOptions)
      return res.json(userData)
    } catch (e) { next(e) }
  }

  async getUsers(req, res, next) {
    try {
      if (!req.user?.isAdmin && !req.user?.isSuperAdmin) return next(ApiError.BadRequest('Потрібні права адміністратора'))
      return res.json(await userService.getAllUsers())
    } catch (e) { next(e) }
  }

  async getAdminUserDetails(req, res, next) {
    try { return res.json(await userService.getAdminUserDetails(req.user.id, req.params.id)) } catch (e) { next(e) }
  }

  async getPublicProfile(req, res, next) {
    try { return res.json(await userService.getPublicUserProfile(req.params.id)) } catch (e) { next(e) }
  }

  async banUser(req, res, next) {
    try { return res.json(await userService.banUser(req.user.id, req.params.id, req.body.minutes, req.body.permanent, req.body.reason || '')) } catch (e) { next(e) }
  }

  async unbanUser(req, res, next) {
    try { return res.json(await userService.unbanUser(req.user.id, req.params.id)) } catch (e) { next(e) }
  }

  async deleteUser(req, res, next) {
    try { return res.json(await userService.deleteUser(req.user.id, req.params.id)) } catch (e) { next(e) }
  }

  async me(req, res, next) {
    try { return res.json(await userService.getUserById(req.user.id)) } catch (e) { next(e) }
  }
  async updateNickname(req, res, next) {
    try {
      const targetId = req.body.userId || req.user.id
      if (String(targetId) !== String(req.user.id) && !req.user?.isAdmin && !req.user?.isSuperAdmin) return next(ApiError.BadRequest('Потрібні права адміністратора'))
      return res.json(await userService.updateNickname(targetId, req.body.nickname || 'Користувач'))
    } catch (e) { next(e) }
  }
  async setAdmin(req, res, next) {
    try { return res.json(await userService.setAdminAccess(req.user.id, req.body.userId, req.body.isAdmin)) } catch (e) { next(e) }
  }
  async updatePhone(req, res, next) {
    try { return res.json(await userService.updatePhone(req.user.id, req.body.phone || null)) } catch (e) { next(e) }
  }
  async updatePreferredCurrency(req, res, next) {
    try { return res.json(await userService.updatePreferredCurrency(req.user.id, req.body.currency || 'UAH')) } catch (e) { next(e) }
  }
  async updateAvatar(req, res, next) {
    try {
      const url = req.file ? `${process.env.API_URL || 'http://localhost:5000'}/uploads/${req.file.filename}` : ''
      return res.json(await userService.updateAvatar(req.user.id, url))
    } catch (e) { next(e) }
  }
}

module.exports = new UserController()
