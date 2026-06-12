const bcrypt = require('bcrypt')
const MailService = require('./mail-service')
const TokenService = require('./token-service')
const uuid = require('uuid')
const ApiError = require('../exceptions/api-error')
const { models, Op } = require('../db')
const wsHub = require('../ws-hub')

const {
  User,
  RefreshToken,
  Listing,
  ListingImage,
  SellerReview,
  ChatThread,
  ChatMessage,
  Favorite,
  CartItem,
  ViewHistory,
  NicknameHistory,
  UserNotification,
  Purchase
} = models

class UserService {
  plain(row) {
    return row?.get ? row.get({ plain: true }) : row
  }

  mapUser(userRow) {
    const user = this.plain(userRow) || {}
    const isAdmin = !!(user.is_admin || user.is_super_admin)
    return {
      id: String(user.id),
      email: user.email,
      nickname: user.nickname || String(user.email || '').split('@')[0],
      isActivated: isAdmin || !!user.is_activated,
      isAdmin: !!user.is_admin,
      isSuperAdmin: !!user.is_super_admin,
      phone: user.phone || null,
      createdAt: user.created_at || null,
      bannedPermanent: !!user.banned_permanent,
      bannedUntil: user.banned_until || null,
      banReason: user.ban_reason || null,
      preferredCurrency: user.preferred_currency || 'UAH',
      avatarUrl: user.avatar_url || ''
    }
  }

  isUserBanned(userRow) {
    const user = this.plain(userRow) || {}
    if (user.banned_permanent) return true
    if (!user.banned_until) return false
    return new Date(user.banned_until).getTime() > Date.now()
  }

  async ensureAdmin(actorId) {
    const actor = await User.findByPk(actorId)
    if (!actor || (!actor.is_admin && !actor.is_super_admin)) throw ApiError.BadRequest('Потрібні права адміністратора')
    return this.plain(actor)
  }

  async registration(email, password) {
    const normalizedEmail = String(email || '').trim().toLowerCase()
    const exists = await User.findOne({ where: { email: normalizedEmail } })
    if (exists) throw ApiError.BadRequest(`Електронна пошта ${normalizedEmail} вже існує`)

    const activationLink = uuid.v4()
    const hashPassword = await bcrypt.hash(password, 10)
    const nickname = normalizedEmail.split('@')[0]
    const user = await User.create({
      email: normalizedEmail,
      password: hashPassword,
      activation_link: activationLink,
      is_activated: false,
      nickname
    })
    await MailService.sendActivationMail(normalizedEmail, `${process.env.API_URL}/api/activate/${activationLink}`)
    const userDto = this.mapUser(user)
    const tokens = TokenService.generateToken({ ...userDto })
    await TokenService.saveTokens(userDto.id, tokens.refreshToken)
    return { ...tokens, user: userDto }
  }

  async activate(activationLink) {
    const [affected] = await User.update({ is_activated: true }, { where: { activation_link: activationLink } })
    if (!affected) throw ApiError.BadRequest('Користувача не знайдено')
  }

  async login(email, password) {
    const user = await User.findOne({ where: { email: String(email || '').trim().toLowerCase() } })
    if (!user) throw ApiError.BadRequest('Користувача не знайдено')
    if (this.isUserBanned(user)) {
      throw ApiError.BadRequest(user.banned_permanent ? 'Користувача заблоковано назавжди' : `Користувача заблоковано до ${new Date(user.banned_until).toLocaleString()}`)
    }
    const isPassEquals = await bcrypt.compare(password, user.password)
    if (!isPassEquals) throw ApiError.BadRequest('Невірний пароль')
    const userDto = this.mapUser(user)
    const tokens = TokenService.generateToken({ ...userDto })
    await TokenService.saveTokens(userDto.id, tokens.refreshToken)
    return { ...tokens, user: userDto }
  }

  renderPasswordResetPage(link, options = {}) {
    const error = options.error || ''
    const done = !!options.done
    return `<!doctype html>
<html lang="uk">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Відновлення пароля</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f3f7f6;font-family:Arial,sans-serif;color:#112b2f}
    .card{width:min(440px,calc(100vw - 32px));background:#fff;border:1px solid #dce8e6;border-radius:14px;padding:28px;box-shadow:0 18px 45px rgba(0,47,52,.12)}
    h1{margin:0 0 8px;font-size:26px}
    p{line-height:1.5;color:#53676a}
    label{display:block;margin-top:14px;font-weight:700}
    input{width:100%;box-sizing:border-box;margin-top:7px;border:1px solid #b9cecb;border-radius:10px;padding:13px;font-size:16px}
    button{width:100%;margin-top:18px;border:0;border-radius:10px;background:#007782;color:#fff;font-weight:800;padding:13px;cursor:pointer}
    .error{background:#ffe9e9;color:#9f1c1c;border:1px solid #ffc7c7;border-radius:10px;padding:10px;margin:12px 0}
    .ok{background:#e8f8ef;color:#17643b;border:1px solid #bfe8cf;border-radius:10px;padding:12px;margin-top:12px}
  </style>
</head>
<body>
  <main class="card">
    <h1>${done ? 'Пароль змінено' : 'Новий пароль'}</h1>
    ${done ? '<div class="ok">Тепер можна увійти на сайт з новим паролем.</div>' : `<p>Введіть новий пароль для свого акаунта.</p>${error ? `<div class="error">${error}</div>` : ''}<form method="post" action="/api/password-reset/${link}"><label>Новий пароль<input name="password" type="password" minlength="3" required /></label><label>Повторіть пароль<input name="confirmPassword" type="password" minlength="3" required /></label><button type="submit">Змінити пароль</button></form>`}
  </main>
</body>
</html>`
  }

  async requestPasswordReset(email) {
    const normalizedEmail = String(email || '').trim().toLowerCase()
    if (!normalizedEmail) throw ApiError.BadRequest('Вкажіть електронну пошту')
    const user = await User.findOne({ where: { email: normalizedEmail } })
    if (!user) return { ok: true }
    const link = uuid.v4()
    const expires = new Date(Date.now() + 60 * 60 * 1000)
    await user.update({ password_reset_link: link, password_reset_expires: expires })
    await MailService.sendPasswordResetMail(normalizedEmail, `${process.env.API_URL}/api/password-reset/${link}`)
    return { ok: true }
  }

  async getPasswordResetPage(link) {
    const user = await User.findOne({ where: { password_reset_link: link } })
    if (!user || !user.password_reset_expires || new Date(user.password_reset_expires).getTime() < Date.now()) {
      return this.renderPasswordResetPage(link, { error: 'Посилання недійсне або вже застаріло.' })
    }
    return this.renderPasswordResetPage(link)
  }

  async resetPassword(link, password, confirmPassword) {
    if (String(password || '').length < 3) return this.renderPasswordResetPage(link, { error: 'Пароль має містити щонайменше 3 символи.' })
    if (password !== confirmPassword) return this.renderPasswordResetPage(link, { error: 'Паролі не збігаються.' })
    const user = await User.findOne({ where: { password_reset_link: link } })
    if (!user || !user.password_reset_expires || new Date(user.password_reset_expires).getTime() < Date.now()) {
      return this.renderPasswordResetPage(link, { error: 'Посилання недійсне або вже застаріло.' })
    }
    const hashPassword = await bcrypt.hash(password, 10)
    await user.update({ password: hashPassword, password_reset_link: null, password_reset_expires: null })
    await models.RefreshToken.destroy({ where: { user_id: user.id } })
    return this.renderPasswordResetPage(link, { done: true })
  }

  async logout(refreshToken) {
    return TokenService.removeToken(refreshToken)
  }

  async refresh(refreshToken) {
    if (!refreshToken) throw ApiError.UnauthorizedError()
    const userData = TokenService.validateRefreshToken(refreshToken)
    const tokenFromDb = await TokenService.findToken(refreshToken)
    if (!userData || !tokenFromDb) throw ApiError.UnauthorizedError()
    const user = await User.findByPk(userData.id)
    if (!user || this.isUserBanned(user)) throw ApiError.UnauthorizedError()
    const userDto = this.mapUser(user)
    const tokens = TokenService.generateToken({ ...userDto })
    await TokenService.saveTokens(userDto.id, tokens.refreshToken)
    return { ...tokens, user: userDto }
  }

  async getUserById(id) {
    const user = await User.findByPk(id)
    if (!user) throw ApiError.BadRequest('Користувача не знайдено')
    return this.mapUser(user)
  }

  safeImageUrls(row) {
    const listing = this.plain(row) || {}
    const images = Array.isArray(listing.images) ? listing.images.map((image) => this.plain(image)) : []
    if (images.length) {
      return images
        .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || Number(a.id || 0) - Number(b.id || 0))
        .map((image) => image.image_url)
        .filter(Boolean)
    }
    try {
      const parsed = listing.image_urls ? JSON.parse(listing.image_urls) : null
      if (Array.isArray(parsed) && parsed.length) return parsed.filter(Boolean)
    } catch (_) {}
    return [listing.image_url].filter(Boolean)
  }

  listingExtras() {
    return [
      { model: User, as: 'owner', required: false },
      { model: ListingImage, as: 'images', required: false }
    ]
  }

  listingInclude(required = false) {
    return { model: Listing, as: 'listing', required, include: this.listingExtras() }
  }

  mapPublicListing(row) {
    const listing = this.plain(row) || {}
    const owner = listing.owner || {}
    const imageUrls = this.safeImageUrls(listing)
    return {
      _id: String(listing.id),
      title: listing.title,
      description: listing.description,
      price: Number(listing.price),
      currency: listing.currency || 'UAH',
      imageUrl: imageUrls[0] || listing.image_url,
      imageUrls,
      location: listing.location,
      phone: listing.phone || null,
      category: listing.category || null,
      ownerId: listing.owner_id ? String(listing.owner_id) : undefined,
      ownerEmail: owner.email || listing.owner_email || null,
      createdAt: listing.created_at,
      status: listing.status || 'active',
      moderationReason: listing.moderation_reason || null
    }
  }

  mapReview(row) {
    const r = this.plain(row) || {}
    const buyer = r.buyer || {}
    const seller = r.seller || {}
    const listing = r.listing || {}
    const listingImages = this.safeImageUrls(listing)
    return {
      id: String(r.id),
      seller_id: String(r.seller_id),
      buyer_id: String(r.buyer_id),
      listing_id: r.listing_id ? String(r.listing_id) : null,
      listing_title: listing.title || r.listing_title_snapshot || null,
      listing_image_url: listingImages[0] || listing.image_url || r.listing_image_url_snapshot || '',
      listing_price: listing.price !== undefined && listing.price !== null ? Number(listing.price) : (r.listing_price_snapshot !== null && r.listing_price_snapshot !== undefined ? Number(r.listing_price_snapshot) : null),
      rating: Number(r.rating) || 0,
      comment: r.comment || '',
      pros: r.pros || null,
      cons: r.cons || null,
      created_at: r.created_at,
      buyer_email: buyer.email || '',
      buyer_nickname: buyer.nickname || String(buyer.email || '').split('@')[0],
      buyer_is_admin: !!(buyer.is_admin || buyer.is_super_admin),
      buyer_is_activated: !!buyer.is_activated,
      seller_email: seller.email || '',
      seller_nickname: seller.nickname || String(seller.email || '').split('@')[0],
      seller_is_admin: !!(seller.is_admin || seller.is_super_admin),
      seller_is_activated: !!seller.is_activated
    }
  }

  async getPublicUserProfile(targetUserId) {
    const user = await User.findByPk(targetUserId)
    if (!user) throw ApiError.BadRequest('Користувача не знайдено')
    const listings = await Listing.findAll({
      where: { owner_id: targetUserId, status: 'active' },
      include: this.listingExtras(),
      order: [['created_at', 'DESC']]
    })
    const reviews = await SellerReview.findAll({
      where: { seller_id: targetUserId },
      include: [
        { model: User, as: 'buyer', required: false },
        this.listingInclude(false)
      ],
      order: [['created_at', 'DESC']]
    })
    const allSales = await Purchase.findAll({
      include: [this.listingInclude(false)],
      order: [['created_at', 'ASC']]
    })
    const sales = allSales.filter((row) => String(row.listing?.owner_id || row.seller_id_snapshot || '') === String(targetUserId))
    const bought = await Purchase.findAll({
      where: { buyer_id: targetUserId },
      include: [this.listingInclude(false)],
      order: [['created_at', 'ASC']]
    })
    const ratingAverage = reviews.length ? reviews.reduce((sum, r) => sum + Number(r.rating || 0), 0) / reviews.length : 0
    const inc = (acc, key) => { const k = key || 'Інше'; acc[k] = (acc[k] || 0) + 1; return acc }
    const categoryStats = {
      listed: listings.reduce((acc, row) => inc(acc, this.plain(row).category), {}),
      sold: sales.reduce((acc, row) => inc(acc, row.listing?.category || row.listing_category_snapshot), {}),
      bought: bought.reduce((acc, row) => inc(acc, row.listing?.category || row.listing_category_snapshot), {})
    }
    const salesTimeline = sales.map((row) => ({
      listingId: row.listing_id ? String(row.listing_id) : null,
      title: row.listing?.title || row.listing_title_snapshot || 'Оголошення',
      description: row.listing?.description || row.listing_description_snapshot || '',
      soldAt: row.created_at,
      price: Number(row.price || row.listing?.price || 0),
      currency: row.listing?.currency || row.listing_currency_snapshot || 'UAH',
      category: row.listing?.category || row.listing_category_snapshot || null,
      imageUrl: this.safeImageUrls(row.listing || {})[0] || row.listing?.image_url || row.listing_image_url_snapshot || ''
    }))
    const purchasesTimeline = bought.map((row) => ({
      listingId: row.listing_id ? String(row.listing_id) : null,
      title: row.listing?.title || row.listing_title_snapshot || 'Оголошення',
      description: row.listing?.description || row.listing_description_snapshot || '',
      purchasedAt: row.created_at,
      price: Number(row.price || row.listing?.price || 0),
      currency: row.listing?.currency || row.listing_currency_snapshot || 'UAH',
      category: row.listing?.category || row.listing_category_snapshot || null,
      imageUrl: this.safeImageUrls(row.listing || {})[0] || row.listing?.image_url || row.listing_image_url_snapshot || ''
    }))
    return {
      user: this.mapUser(user),
      ratingAverage,
      reviewCount: reviews.length,
      listings: listings.map((row) => this.mapPublicListing(row)),
      reviews: reviews.map((row) => this.mapReview(row)),
      salesTimeline,
      purchasesTimeline,
      categoryStats
    }
  }

  async getAllUsers() {
    const rows = await User.findAll({ order: [['id', 'DESC']] })
    return rows.map((row) => this.mapUser(row))
  }

  async getAdminUserDetails(actorId, targetUserId) {
    await this.ensureAdmin(actorId)
    const user = await this.getUserById(targetUserId)
    const listings = await Listing.findAll({ where: { owner_id: targetUserId }, include: this.listingExtras(), order: [['created_at', 'DESC']] })
    const reviews = await SellerReview.findAll({
      where: { buyer_id: targetUserId },
      include: [
        this.listingInclude(false),
        { model: User, as: 'seller', required: false }
      ],
      order: [['created_at', 'DESC']]
    })
    const ownThreads = await ChatThread.findAll({
      where: { [Op.or]: [{ buyer_id: targetUserId }, { seller_id: targetUserId }] },
      include: [
        this.listingInclude(false),
        { model: User, as: 'buyer', required: false },
        { model: User, as: 'seller', required: false },
        { model: ChatMessage, as: 'messages', required: false }
      ]
    })
    const messageRows = await ChatMessage.findAll({ where: { sender_user_id: targetUserId }, raw: true })
    const mentionedRooms = [...new Set(messageRows.map((m) => m.room_id))]
    const extraThreads = mentionedRooms.length
      ? await ChatThread.findAll({
          where: { room_id: { [Op.in]: mentionedRooms } },
          include: [
            this.listingInclude(false),
            { model: User, as: 'buyer', required: false },
            { model: User, as: 'seller', required: false },
            { model: ChatMessage, as: 'messages', required: false }
          ]
        })
      : []
    const threadMap = new Map([...ownThreads, ...extraThreads].map((thread) => [thread.room_id, thread]))
    const threads = [...threadMap.values()].sort((a, b) => {
      const aLast = Math.max(...(a.messages || []).map((m) => new Date(m.created_at).getTime()), new Date(a.created_at).getTime())
      const bLast = Math.max(...(b.messages || []).map((m) => new Date(m.created_at).getTime()), new Date(b.created_at).getTime())
      return bLast - aLast
    })
    const messages = threads.flatMap((thread) => (thread.messages || []).map((m) => ({ ...this.plain(m), room_id: thread.room_id })))
    return {
      user,
      listings: listings.map((l) => ({ id: String(l.id), title: l.title, description: l.description, price: Number(l.price), currency: l.currency || 'UAH', imageUrl: l.image_url, createdAt: l.created_at, status: l.status || 'active', moderationReason: l.moderation_reason || null })),
      reviews: reviews.map((r) => {
        const mapped = this.mapReview(r)
        return { id: mapped.id, comment: mapped.comment, pros: mapped.pros, cons: mapped.cons, rating: mapped.rating, createdAt: mapped.created_at, listingId: mapped.listing_id, listingTitle: mapped.listing_title, sellerId: mapped.seller_id, sellerEmail: mapped.seller_email || null }
      }),
      chats: threads.map((thread) => {
        const t = this.plain(thread)
        const msgs = t.messages || []
        const lastAt = msgs.length ? msgs.map((m) => m.created_at).sort((a, b) => new Date(b) - new Date(a))[0] : null
        return {
          roomId: t.room_id,
          topic: t.topic,
          chatType: t.chat_type,
          listingId: t.listing_id ? String(t.listing_id) : null,
          listingTitle: t.listing?.title || null,
          buyerEmail: t.buyer?.email || null,
          sellerEmail: t.seller?.email || null,
          messageCount: msgs.length,
          lastMessageAt: lastAt
        }
      }),
      messages: messages
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .map((m) => ({ roomId: m.room_id, senderUserId: m.sender_user_id ? String(m.sender_user_id) : null, nickname: m.sender_nickname, text: m.message_text, attachmentUrl: m.attachment_url || '', attachmentName: m.attachment_name || '', selectionJson: m.selection_json || '', createdAt: m.created_at }))
    }
  }

  async banUser(actorId, targetUserId, minutes, permanent = false, reason = '') {
    const actor = await this.ensureAdmin(actorId)
    const target = await User.findByPk(targetUserId)
    if (!target) throw ApiError.BadRequest('Користувача не знайдено')
    if (target.is_super_admin && !actor.is_super_admin) throw ApiError.BadRequest('Лише головний адміністратор може блокувати головного адміністратора')
    const banMinutes = Math.max(1, Number(minutes) || 0)
    const bannedUntil = permanent ? null : new Date(Date.now() + banMinutes * 60 * 1000)
    await target.update({ banned_permanent: !!permanent, banned_until: bannedUntil, ban_reason: reason || null })
    await RefreshToken.destroy({ where: { user_id: targetUserId } })
    const updated = await this.getUserById(targetUserId)
    wsHub.broadcast({ type: 'user-ban', userId: String(targetUserId), user: updated })
    return updated
  }

  async unbanUser(actorId, targetUserId) {
    await this.ensureAdmin(actorId)
    const target = await User.findByPk(targetUserId)
    if (!target) throw ApiError.BadRequest('Користувача не знайдено')
    await target.update({ banned_permanent: false, banned_until: null, ban_reason: null })
    const updated = await this.getUserById(targetUserId)
    wsHub.broadcast({ type: 'user-unban', userId: String(targetUserId), user: updated })
    return updated
  }

  async deleteUser(actorId, targetUserId) {
    await this.ensureAdmin(actorId)
    if (String(actorId) === String(targetUserId)) throw ApiError.BadRequest('Адміністратор не може видалити власний акаунт')
    const target = await User.findByPk(targetUserId)
    if (!target) throw ApiError.BadRequest('Користувача не знайдено')
    if (target.is_super_admin) throw ApiError.BadRequest('Головного адміністратора не можна видалити')

    const threads = await ChatThread.findAll({
      where: { [Op.or]: [{ buyer_id: targetUserId }, { seller_id: targetUserId }] },
      attributes: ['room_id']
    })
    const roomIds = threads.map((thread) => thread.room_id)
    if (roomIds.length) await ChatMessage.destroy({ where: { room_id: { [Op.in]: roomIds } } })

    await Promise.all([
      Favorite.destroy({ where: { user_id: targetUserId } }),
      CartItem.destroy({ where: { user_id: targetUserId } }),
      ViewHistory.destroy({ where: { user_id: targetUserId } }),
      NicknameHistory.destroy({ where: { user_id: targetUserId } }),
      UserNotification.destroy({ where: { user_id: targetUserId } }),
      ChatMessage.destroy({ where: { sender_user_id: targetUserId } }),
      ChatThread.destroy({ where: { [Op.or]: [{ buyer_id: targetUserId }, { seller_id: targetUserId }] } }),
      SellerReview.destroy({ where: { [Op.or]: [{ buyer_id: targetUserId }, { seller_id: targetUserId }] } })
    ])
    await target.destroy()
    return { ok: true }
  }

  async updateNickname(userId, nickname) {
    const nextNickname = String(nickname || '').trim()
    if (nextNickname.length < 2) throw ApiError.BadRequest('Нікнейм має містити щонайменше 2 символи')
    const users = await User.findAll({ attributes: ['id', 'nickname'], raw: true })
    const duplicate = users.find((user) => String(user.id) !== String(userId) && String(user.nickname || '').toLowerCase() === nextNickname.toLowerCase())
    if (duplicate) throw ApiError.BadRequest('Такий нікнейм вже зайнятий. Придумайте інший.')
    const user = await User.findByPk(userId)
    if (!user) throw ApiError.BadRequest('Користувача не знайдено')
    if (user.nickname) {
      await NicknameHistory.create({ user_id: userId, old_nickname: user.nickname })
      const history = await NicknameHistory.findAll({ where: { user_id: userId }, order: [['changed_at', 'DESC'], ['id', 'DESC']] })
      const oldRows = history.slice(5)
      if (oldRows.length) await NicknameHistory.destroy({ where: { id: { [Op.in]: oldRows.map((row) => row.id) } } })
    }
    await user.update({ nickname: nextNickname })
    return this.getUserById(userId)
  }

  async updatePhone(userId, phone) {
    const normalizedPhone = String(phone || '').replace(/(?!^)\+/g, '').replace(/[^\d+]/g, '')
    const user = await User.findByPk(userId)
    if (!user) throw ApiError.BadRequest('Користувача не знайдено')
    await user.update({ phone: normalizedPhone || null })
    return this.getUserById(userId)
  }
  normalizeCurrency(currency) {
    const value = String(currency || '').trim().toUpperCase()
    return /^[A-Z]{3}$/.test(value) ? value : 'UAH'
  }

  async updatePreferredCurrency(userId, currency) {
    const user = await User.findByPk(userId)
    if (!user) throw ApiError.BadRequest('Користувача не знайдено')
    await user.update({ preferred_currency: this.normalizeCurrency(currency) })
    return this.getUserById(userId)
  }

  async updateAvatar(userId, avatarUrl) {
    const user = await User.findByPk(userId)
    if (!user) throw ApiError.BadRequest('Користувача не знайдено')
    await user.update({ avatar_url: avatarUrl || null })
    return this.getUserById(userId)
  }

  async setAdminAccess(actorId, targetUserId, isAdmin) {
    const actor = await User.findByPk(actorId)
    if (!actor?.is_super_admin) throw ApiError.BadRequest('Лише головний адміністратор може змінювати права адміністратора')
    const target = await User.findByPk(targetUserId)
    if (!target) throw ApiError.BadRequest('Користувача не знайдено')
    if (target.is_super_admin) throw ApiError.BadRequest('Неможливо змінювати права головного адміністратора')
    if (isAdmin && !target.is_activated) throw ApiError.BadRequest('Користувач має підтвердити пошту перед отриманням прав адміністратора')
    await target.update({ is_admin: !!isAdmin })
    return this.getUserById(targetUserId)
  }
}

module.exports = new UserService()
