const jwt = require('jsonwebtoken')
const { models } = require('../db')

const { RefreshToken } = models

class TokenService {
  generateToken(payload) {
    const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, { expiresIn: '30d' })
    const accessToken = jwt.sign(payload, process.env.JWT_ACCESS_SECRET, { expiresIn: '30m' })
    return { refreshToken, accessToken }
  }

  validateAccessToken(token) {
    try { return jwt.verify(token, process.env.JWT_ACCESS_SECRET) } catch { return null }
  }

  validateRefreshToken(token) {
    try { return jwt.verify(token, process.env.JWT_REFRESH_SECRET) } catch { return null }
  }

  async saveTokens(userId, refreshToken) {
    const [row] = await RefreshToken.findOrCreate({
      where: { user_id: userId },
      defaults: { user_id: userId, refresh_token: refreshToken }
    })
    if (row.refresh_token !== refreshToken) {
      await row.update({ refresh_token: refreshToken, created_at: new Date() })
    }
  }

  async removeToken(refreshToken) {
    return RefreshToken.destroy({ where: { refresh_token: refreshToken } })
  }

  async findToken(refreshToken) {
    const row = await RefreshToken.findOne({ where: { refresh_token: refreshToken }, raw: true })
    return row || null
  }
}

module.exports = new TokenService()
