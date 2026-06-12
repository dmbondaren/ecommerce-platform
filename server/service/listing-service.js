const ApiError = require('../exceptions/api-error')
const { models, Op } = require('../db')
const mailService = require('./mail-service')
const wsHub = require('../ws-hub')

const {
  User,
  Listing,
  Category,
  ListingImage,
  Favorite,
  CartItem,
  ChatThread,
  ChatMessage,
  SellerReview,
  ReviewVote,
  ReviewReply,
  Complaint,
  Purchase,
  AdminListingAction,
  UserNotification,
  ViewHistory,
  SearchStat
} = models

class ListingService {
  async ensureImageColumns() {
    return true
  }

  async getCategories() {
    const rows = await Category.findAll({
      where: { is_active: true },
      order: [['sort_order', 'ASC'], ['name', 'ASC']],
      raw: true
    })
    return rows.map((row) => row.name)
  }

  async ensureCategoryName(category) {
    const name = String(category || '').trim()
    if (!name) return null
    await Category.findOrCreate({
      where: { name },
      defaults: { name, sort_order: 999, is_active: true }
    })
    return name
  }

  plain(row) {
    return row?.get ? row.get({ plain: true }) : row
  }

  safeImageUrls(rowLike) {
    const row = this.plain(rowLike) || {}
    const images = Array.isArray(row.images) ? row.images.map((image) => this.plain(image)) : []
    if (images.length) {
      return images
        .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0) || Number(a.id || 0) - Number(b.id || 0))
        .map((image) => image.image_url)
        .filter(Boolean)
    }
    try {
      const parsed = row.image_urls ? JSON.parse(row.image_urls) : null
      if (Array.isArray(parsed) && parsed.length) return parsed.filter(Boolean)
    } catch (_) {}
    return [row.image_url].filter(Boolean)
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

  async saveListingImages(listingId, urls) {
    const cleanUrls = [...new Set((urls || []).filter(Boolean))]
    await ListingImage.destroy({ where: { listing_id: listingId } })
    if (!cleanUrls.length) return
    await ListingImage.bulkCreate(cleanUrls.map((url, index) => ({
      listing_id: listingId,
      image_url: url,
      sort_order: index
    })))
  }

  map(rowLike) {
    const row = this.plain(rowLike) || {}
    const owner = row.owner || {}
    const imageUrls = this.safeImageUrls(row)
    return {
      _id: String(row.id),
      title: row.title,
      description: row.description,
      price: Number(row.price),
      currency: row.currency || 'UAH',
      imageUrl: row.image_url || imageUrls[0] || '',
      imageUrls,
      location: row.location,
      phone: row.phone || null,
      category: row.category || null,
      ownerId: row.owner_id ? String(row.owner_id) : undefined,
      ownerEmail: row.owner_email || owner.email || null,
      ownerNickname: row.owner_nickname || owner.nickname || null,
      ownerAvatarUrl: row.owner_avatar_url || owner.avatar_url || null,
      ownerIsAdmin: !!(row.owner_is_admin || owner.is_admin || owner.is_super_admin),
      ownerIsActivated: !!(row.owner_is_activated || owner.is_activated),
      createdAt: row.created_at,
      status: row.status || 'active',
      moderationReason: row.moderation_reason || null,
      viewCount: Number(row.view_count || 0)
    }
  }

  normalizePhone(phone) {
    return String(phone || '').replace(/(?!^)\+/g, '').replace(/[^\d+]/g, '')
  }

  normalizeCurrency(currency) {
    const value = String(currency || '').toUpperCase()
    return /^[A-Z]{3}$/.test(value) ? value : 'UAH'
  }

  mapPurchaseListing(purchaseRow, listingRow) {
    const purchase = this.plain(purchaseRow) || {}
    const listing = listingRow ? this.map(listingRow) : {
      _id: String(purchase.listing_id || ''),
      title: purchase.listing_title_snapshot || 'Оголошення',
      description: purchase.listing_description_snapshot || '',
      price: Number(purchase.price || 0),
      currency: purchase.listing_currency_snapshot || 'UAH',
      imageUrl: purchase.listing_image_url_snapshot || '',
      imageUrls: [],
      category: purchase.listing_category_snapshot || null,
      ownerId: purchase.seller_id_snapshot ? String(purchase.seller_id_snapshot) : undefined,
      status: 'sold'
    }
    if (!listingRow) {
      try {
        const parsed = purchase.listing_image_urls_snapshot ? JSON.parse(purchase.listing_image_urls_snapshot) : []
        listing.imageUrls = Array.isArray(parsed) && parsed.length ? parsed.filter(Boolean) : [listing.imageUrl].filter(Boolean)
      } catch (_) {
        listing.imageUrls = [listing.imageUrl].filter(Boolean)
      }
    }
    return listing
  }

  async ensureAdmin(userId) {
    const admin = await User.findByPk(userId)
    if (!admin || (!admin.is_admin && !admin.is_super_admin)) throw ApiError.BadRequest('Потрібні права адміністратора')
    return this.plain(admin)
  }

  async getListingModelById(id, options = {}) {
    const listing = await Listing.findByPk(id, {
      ...options,
      include: options.include || this.listingExtras()
    })
    if (!listing) throw ApiError.BadRequest('Оголошення не знайдено')
    return listing
  }

  async getById(id) {
    const listing = await this.getListingModelById(id)
    return this.map(listing)
  }

  async createListing(ownerId, data) {
    const { title, description, price, imageUrl, imageUrls, location } = data
    const phone = this.normalizePhone(data.phone)
    const p = Number(price)
    const currency = this.normalizeCurrency(data.currency)
    const rawCategory = String(data.category || '').trim()
    if (!title || !description || Number.isNaN(p) || p < 0 || !imageUrl || !rawCategory) throw ApiError.BadRequest('Заповніть назву, опис, ціну, категорію та фото')
    const category = await this.ensureCategoryName(rawCategory)
    const row = await Listing.create({
      owner_id: ownerId,
      title,
      description,
      price: p,
      currency,
      image_url: imageUrl,
      image_urls: null,
      location: location || null,
      phone: phone || null,
      category,
      status: 'active'
    })
    await this.saveListingImages(row.id, imageUrls?.length ? imageUrls : [imageUrl])
    const created = await this.getById(row.id)
    wsHub.broadcast({ type: 'listing-upsert', listing: created })
    return created
  }

  async updateMyListing(ownerId, id, data) {
    const listing = await Listing.findOne({
      where: { id, owner_id: ownerId },
      include: [{ model: ListingImage, as: 'images', required: false }]
    })
    if (!listing) throw ApiError.BadRequest('Оголошення не знайдено')
    const current = this.plain(listing)
    const currentUrls = this.safeImageUrls(current)
    const nextUrls = data.imageUrls?.length ? data.imageUrls.filter(Boolean) : currentUrls
    const nextImageUrl = nextUrls[0] || data.imageUrl || current.image_url
    const nextPrice = Number(data.price ?? current.price)
    const rawCategory = String(data.category ?? current.category ?? '').trim()
    if (!data.title || !data.description || Number.isNaN(nextPrice) || nextPrice < 0 || !nextImageUrl || !rawCategory) throw ApiError.BadRequest('Заповніть назву, опис, ціну, категорію та фото правильно')
    const category = await this.ensureCategoryName(rawCategory)
    const nextStatus = current.status === 'deactivated' || current.status === 'pending' ? 'pending' : (current.status || 'active')
    await listing.update({
      title: data.title,
      description: data.description,
      price: nextPrice,
      currency: this.normalizeCurrency(data.currency || current.currency),
      image_url: nextImageUrl,
      image_urls: null,
      location: data.location || null,
      phone: this.normalizePhone(data.phone ?? current.phone) || null,
      category,
      status: nextStatus,
      moderation_reason: nextStatus === 'pending' ? 'Очікує перевірки після редагування користувачем' : current.moderation_reason || null
    })
    await this.saveListingImages(id, nextUrls)
    if (nextPrice < Number(current.price || 0)) this.notifyFavoriteUsersPriceDrop(id, current, { ...this.plain(listing), id }).catch(() => null)
    const updated = await this.getById(id)
    wsHub.broadcast({ type: 'listing-upsert', listing: updated })
    return updated
  }

  async notifyFavoriteUsersPriceDrop(listingId, oldListing, nextListing) {
    const favorites = await Favorite.findAll({
      where: { listing_id: listingId },
      include: [{ model: User, as: 'user', required: true }]
    })
    await Promise.all(favorites.map((favorite) => {
      const user = favorite.user
      return user?.email ? mailService.sendPriceDropMail(user.email, nextListing, Number(oldListing.price), Number(nextListing.price)).catch(() => null) : null
    }))
  }

  async deleteMyListing(ownerId, id) {
    const sold = await Purchase.findOne({ where: { listing_id: id } })
    if (sold) await Listing.update({ status: 'deleted', moderation_reason: null }, { where: { id, owner_id: ownerId } })
    else await Listing.destroy({ where: { id, owner_id: ownerId } })
    wsHub.broadcast({ type: 'listing-remove', listingId: String(id), status: 'deleted' })
  }

  async adminDeleteListing(adminId, id, titleConfirm, reason = '') {
    await this.ensureAdmin(adminId)
    const listing = await Listing.findByPk(id)
    if (!listing) throw ApiError.BadRequest('Оголошення не знайдено')
    if (!titleConfirm || listing.title !== titleConfirm) throw ApiError.BadRequest('Назва оголошення не збігається')
    if (!String(reason || '').trim()) throw ApiError.BadRequest('Вкажіть причину видалення')
    const admin = await User.findByPk(adminId)
    const owner = await User.findByPk(listing.owner_id)
    const cleanReason = String(reason || '').trim()
    await AdminListingAction.create({ admin_id: adminId, listing_id: id, action_type: 'delete', reason: cleanReason })
    await UserNotification.create({
      user_id: listing.owner_id,
      message_text: `Ваше оголошення "${listing.title}" було видалено адміністратором. Причина: ${cleanReason}`
    })
    const roomId = `support-${listing.owner_id}`
    await ChatThread.findOrCreate({
      where: { room_id: roomId },
      defaults: { buyer_id: listing.owner_id, seller_id: adminId, listing_id: null, chat_type: 'support', room_id: roomId, topic: 'support' }
    })
    await ChatThread.update({ hidden_for_buyer: false, hidden_for_seller: false }, { where: { room_id: roomId } })
    const supportMessage = await ChatMessage.create({
      room_id: roomId,
      sender_nickname: admin?.nickname || admin?.email || 'Адміністратор',
      sender_user_id: adminId,
      message_text: `Оголошення "${listing.title}" видалено.\nПричина: ${cleanReason}${owner?.email ? `\nКористувач: ${owner.email}` : ''}`
    })
    const sold = await Purchase.findOne({ where: { listing_id: id } })
    if (sold) await listing.update({ status: 'sold', moderation_reason: cleanReason })
    else await listing.destroy()
    wsHub.broadcast({ type: 'listing-remove', listingId: String(id), status: 'deleted' })
    wsHub.broadcast({ type: 'chat-summary-changed', roomId })
    return { ok: true }
  }

  async adminSetListingStatus(adminId, id, status, titleConfirm, reason = '') {
    await this.ensureAdmin(adminId)
    const listing = await Listing.findByPk(id)
    if (!listing) throw ApiError.BadRequest('Оголошення не знайдено')
    if (status !== 'active' && (!titleConfirm || listing.title !== titleConfirm)) throw ApiError.BadRequest('Назва оголошення не збігається')
    if (status === 'deactivated' && !String(reason || '').trim()) throw ApiError.BadRequest('Вкажіть причину модерації')
    const nextStatus = status === 'active' ? 'active' : 'deactivated'
    await listing.update({
      status: nextStatus,
      moderation_reason: reason || null,
      deactivated_by: nextStatus === 'deactivated' ? adminId : null,
      deactivated_at: nextStatus === 'deactivated' ? new Date() : null
    })
    await AdminListingAction.create({ admin_id: adminId, listing_id: id, action_type: nextStatus === 'active' ? 'activate' : 'deactivate', reason: reason || null })
    await UserNotification.create({
      user_id: listing.owner_id,
      message_text: nextStatus === 'active'
        ? `Ваше оголошення "${listing.title}" активовано.`
        : `Ваше оголошення "${listing.title}" деактивовано адміністратором. Причина: ${reason}`
    })
    const updated = await this.getById(id)
    wsHub.broadcast({ type: 'listing-upsert', listing: updated })
    return updated
  }

  async getModerationListings(adminId) {
    await this.ensureAdmin(adminId)
    const rows = await Listing.findAll({
      where: { status: 'pending' },
      include: this.listingExtras(),
      order: [['deactivated_at', 'DESC'], ['created_at', 'DESC']]
    })
    return rows.map((row) => this.map(row))
  }

  async getListings(search, minPrice, maxPrice, category, sortBy = 'newest') {
    const s = String(search || '').trim()
    const where = { status: 'active' }
    if (s) {
      where.title = { [Op.like]: `%${s}%` }
      await this.trackSearch(s)
    }
    const min = Number(minPrice)
    const max = Number(maxPrice)
    if (minPrice !== undefined && minPrice !== '' && !Number.isNaN(min)) where.price = { ...(where.price || {}), [Op.gte]: min }
    if (maxPrice !== undefined && maxPrice !== '' && !Number.isNaN(max)) where.price = { ...(where.price || {}), [Op.lte]: max }
    if (category) where.category = category
    const orderMap = {
      newest: [['created_at', 'DESC']],
      oldest: [['created_at', 'ASC']],
      price_asc: [['price', 'ASC']],
      price_desc: [['price', 'DESC']]
    }
    const rows = await Listing.findAll({
      where,
      include: this.listingExtras(),
      order: orderMap[sortBy] || orderMap.newest
    })
    const mapped = rows.map((row) => this.map(row))
    if (String(sortBy).startsWith('popular')) {
      const ids = mapped.map((item) => item._id)
      const views = ids.length ? await ViewHistory.findAll({ where: { listing_id: { [Op.in]: ids } }, raw: true }) : []
      const counts = views.reduce((acc, view) => {
        acc[String(view.listing_id)] = (acc[String(view.listing_id)] || 0) + 1
        return acc
      }, {})
      mapped.forEach((item) => { item.viewCount = counts[item._id] || 0 })
      mapped.sort((a, b) => sortBy === 'popular_asc' ? a.viewCount - b.viewCount : b.viewCount - a.viewCount)
    }
    return mapped
  }

  async getMyListings(ownerId) {
    const rows = await Listing.findAll({
      where: { owner_id: ownerId, status: { [Op.ne]: 'deleted' } },
      include: this.listingExtras(),
      order: [['created_at', 'DESC']]
    })
    return rows.map((row) => this.map(row))
  }

  async trackSearch(query) {
    const [stat] = await SearchStat.findOrCreate({
      where: { query_text: query },
      defaults: { query_text: query, search_count: 1, last_searched_at: new Date() }
    })
    if (stat.search_count !== 1 || new Date(stat.last_searched_at).getTime() < Date.now() - 1000) {
      await stat.update({ search_count: Number(stat.search_count || 0) + 1, last_searched_at: new Date() })
    }
  }

  async getTopSearches(limit = 5) {
    const rows = await SearchStat.findAll({
      order: [['search_count', 'DESC'], ['last_searched_at', 'DESC']],
      limit: Number(limit) || 5,
      raw: true
    })
    return rows.map((row) => ({ query_text: row.query_text, search_count: row.search_count }))
  }

  async addFavorite(userId, listingId) {
    await Favorite.findOrCreate({ where: { user_id: userId, listing_id: listingId }, defaults: { user_id: userId, listing_id: listingId } })
    return { ok: true }
  }

  async addToCart(userId, listingId) {
    await CartItem.findOrCreate({ where: { user_id: userId, listing_id: listingId }, defaults: { user_id: userId, listing_id: listingId } })
    return { ok: true }
  }

  async toggleFavorite(userId, listingId) {
    const row = await Favorite.findOne({ where: { user_id: userId, listing_id: listingId } })
    if (row) await row.destroy()
    else await Favorite.create({ user_id: userId, listing_id: listingId })
    return { ok: true }
  }

  async toggleCart(userId, listingId) {
    const row = await CartItem.findOne({ where: { user_id: userId, listing_id: listingId } })
    if (row) await row.destroy()
    else await CartItem.create({ user_id: userId, listing_id: listingId })
    return { ok: true }
  }

  async addView(userId, listingId) {
    await ViewHistory.create({ user_id: userId, listing_id: listingId })
    return { ok: true }
  }

  async getHistory(userId) {
    const rows = await ViewHistory.findAll({
      where: { user_id: userId },
      include: [this.listingInclude(false)],
      order: [['viewed_at', 'DESC']]
    })
    return rows.map((row) => ({ ...this.map(row.listing), viewedAt: row.viewed_at }))
  }

  async getFavorites(userId) {
    const rows = await Favorite.findAll({
      where: { user_id: userId },
      include: [this.listingInclude(true)],
      order: [['created_at', 'DESC']]
    })
    return rows.map((row) => this.map(row.listing))
  }

  async getCart(userId) {
    const rows = await CartItem.findAll({
      where: { user_id: userId },
      include: [this.listingInclude(true)],
      order: [['created_at', 'DESC']]
    })
    return rows.map((row) => this.map(row.listing))
  }

  async startChat(userId, listingId, chatType = 'buy') {
    const listing = await this.getListingModelById(listingId)
    const sellerId = listing.owner_id
    const buyerId = chatType === 'buy' ? userId : sellerId
    const seller = chatType === 'buy' ? sellerId : userId
    const roomId = `${chatType}-${listingId}-${buyerId}-${seller}`
    await ChatThread.findOrCreate({
      where: { room_id: roomId },
      defaults: { buyer_id: buyerId, seller_id: seller, listing_id: listingId, chat_type: chatType, room_id: roomId, topic: 'listing' }
    })
    await ChatThread.update({ hidden_for_buyer: false, hidden_for_seller: false }, { where: { room_id: roomId } })
    return { roomId, listingTitle: listing.title, chatType }
  }

  async startSupportChat(userId, targetUserId = null) {
    const me = await User.findByPk(userId)
    const isAdmin = !!(me?.is_admin || me?.is_super_admin)
    if (isAdmin && !targetUserId) {
      await ChatThread.findOrCreate({
        where: { room_id: 'admin-support' },
        defaults: { buyer_id: userId, seller_id: null, listing_id: null, chat_type: 'support', room_id: 'admin-support', topic: 'admin_support' }
      })
      return { roomId: 'admin-support', chatType: 'admin_support' }
    }
    const otherUserId = isAdmin && targetUserId ? targetUserId : userId
    const roomId = `support-${otherUserId}`
    await ChatThread.findOrCreate({
      where: { room_id: roomId },
      defaults: { buyer_id: otherUserId, seller_id: isAdmin ? userId : null, listing_id: null, chat_type: 'support', room_id: roomId, topic: 'support' }
    })
    await ChatThread.update({ hidden_for_buyer: false, hidden_for_seller: false }, { where: { room_id: roomId } })
    return { roomId, chatType: 'support' }
  }

  activeMessages(thread) {
    return (thread.messages || []).map((message) => this.plain(message)).filter((message) => !message.deleted_at)
  }

  lastThreadTime(thread) {
    const times = this.activeMessages(thread).map((message) => new Date(message.created_at).getTime())
    times.push(new Date(thread.created_at).getTime())
    return Math.max(...times)
  }

  unreadInThread(thread, userId) {
    return this.activeMessages(thread).filter((message) => String(message.sender_user_id) !== String(userId) && !message.read_at).length
  }

  async getChatThreads(userId, type = 'buy') {
    const where = type === 'sell'
      ? { seller_id: userId, topic: 'listing', hidden_for_seller: false }
      : { buyer_id: userId, topic: 'listing', hidden_for_buyer: false }
    const threads = await ChatThread.findAll({
      where,
      include: [
        this.listingInclude(false),
        { model: User, as: 'buyer', required: false },
        { model: User, as: 'seller', required: false },
        { model: ChatMessage, as: 'messages', required: false }
      ]
    })
    return threads
      .filter((thread) => {
        if (type !== 'sell' && (String(thread.seller_id) === String(userId) || String(thread.listing?.owner_id) === String(userId))) return false
        return this.activeMessages(thread).length > 0
      })
      .sort((a, b) => this.lastThreadTime(b) - this.lastThreadTime(a))
      .map((thread) => ({
        roomId: thread.room_id,
        type,
        title: thread.listing?.title || 'Оголошення',
        imageUrl: this.safeImageUrls(thread.listing)[0] || thread.listing?.image_url || '',
        userId: type === 'sell'
          ? (thread.buyer_id ? String(thread.buyer_id) : null)
          : (thread.seller_id ? String(thread.seller_id) : null),
        userTitle: type === 'sell'
          ? (thread.buyer?.nickname || thread.buyer?.email || '')
          : (thread.seller?.nickname || thread.seller?.email || ''),
        messageCount: this.activeMessages(thread).length,
        unreadCount: this.unreadInThread(thread, userId)
      }))
  }

  async getSupportThreads(userId) {
    const me = await User.findByPk(userId)
    const isAdmin = !!(me?.is_admin || me?.is_super_admin)
    if (isAdmin) {
      await ChatThread.findOrCreate({
        where: { room_id: 'admin-support' },
        defaults: { buyer_id: userId, seller_id: null, listing_id: null, chat_type: 'support', room_id: 'admin-support', topic: 'admin_support' }
      })
    }
    const where = isAdmin
      ? { topic: { [Op.in]: ['support', 'admin_support'] } }
      : { topic: 'support', hidden_for_buyer: false, [Op.or]: [{ buyer_id: userId }, { seller_id: userId }] }
    const threads = await ChatThread.findAll({
      where,
      include: [
        { model: User, as: 'buyer', required: false },
        { model: ChatMessage, as: 'messages', required: false }
      ]
    })
    const seen = new Set()
    const rows = []
    for (const thread of threads) {
      const buyer = thread.buyer
      if (isAdmin && thread.topic === 'support' && (thread.hidden_for_seller || buyer?.is_admin || buyer?.is_super_admin)) continue
      const msgCount = this.activeMessages(thread).length
      if (!isAdmin && !msgCount) continue
      if (isAdmin && thread.topic !== 'admin_support' && !msgCount) continue
      const key = thread.topic === 'admin_support' ? 'admin-support' : String(thread.buyer_id || thread.room_id)
      if (seen.has(key)) continue
      seen.add(key)
      rows.push({
        roomId: thread.topic === 'admin_support' ? 'admin-support' : thread.room_id,
        userId: thread.buyer_id ? String(thread.buyer_id) : null,
        type: 'support',
        title: thread.topic === 'admin_support' ? 'Чат адміністраторів' : (isAdmin ? (buyer?.email || 'Користувач') : 'Підтримка'),
        imageUrl: '',
        messageCount: msgCount,
        unreadCount: this.unreadInThread(thread, userId),
        lastMessageAt: msgCount ? new Date(this.lastThreadTime(thread)) : null
      })
    }
    return rows.sort((a, b) => new Date(b.lastMessageAt || 0) - new Date(a.lastMessageAt || 0))
  }

  async getChatSummary(userId) {
    const me = await User.findByPk(userId)
    const isAdmin = !!(me?.is_admin || me?.is_super_admin)
    const listingThreads = await ChatThread.findAll({
      where: { topic: 'listing', [Op.or]: [{ buyer_id: userId }, { seller_id: userId }] },
      include: [{ model: ChatMessage, as: 'messages', required: false }]
    })
    const listingCount = listingThreads
      .filter((thread) => (String(thread.buyer_id) === String(userId) && !thread.hidden_for_buyer) || (String(thread.seller_id) === String(userId) && !thread.hidden_for_seller))
      .reduce((sum, thread) => sum + this.unreadInThread(thread, userId), 0)
    const supportCount = (await this.getSupportThreads(userId))
      .reduce((sum, thread) => sum + Number(thread.unreadCount || 0), 0)
    return { listingCount, supportCount, total: listingCount + supportCount, isAdmin }
  }

  async saveChatMessage(roomId, nickname, text, senderUserId = null, attachmentUrl = '', attachmentName = '', selectionJson = '') {
    const normalizedRoomId = String(roomId || 'support-general')
    let cleanSenderUserId = senderUserId || null
    if (cleanSenderUserId) {
      const sender = await User.findByPk(cleanSenderUserId, { attributes: ['id'] })
      cleanSenderUserId = sender ? cleanSenderUserId : null
    }
    const isSupportRoom = normalizedRoomId.includes('support')
    await ChatThread.findOrCreate({
      where: { room_id: normalizedRoomId },
      defaults: {
        buyer_id: cleanSenderUserId,
        seller_id: null,
        listing_id: null,
        chat_type: isSupportRoom ? 'support' : 'buy',
        room_id: normalizedRoomId,
        topic: isSupportRoom ? 'support' : 'listing'
      }
    })
    const row = await ChatMessage.create({
      room_id: normalizedRoomId,
      sender_nickname: nickname || 'Користувач',
      message_text: text || '',
      sender_user_id: cleanSenderUserId,
      attachment_url: attachmentUrl || null,
      attachment_name: attachmentName || null,
      selection_json: selectionJson || null
    })
    await ChatThread.update({ hidden_for_buyer: false, hidden_for_seller: false }, { where: { room_id: normalizedRoomId } })
    wsHub.broadcast({ type: 'chat-summary-changed', roomId: normalizedRoomId })
    return this.plain(row)
  }

  async getChatMessages(userId, roomId) {
    const me = await User.findByPk(userId)
    const thread = await ChatThread.findOne({ where: { room_id: roomId } })
    const isAdmin = !!(me?.is_admin || me?.is_super_admin)
    const hasAccess = thread && (String(thread.buyer_id) === String(userId) || String(thread.seller_id) === String(userId) || (isAdmin && ['support', 'admin_support'].includes(thread.topic)))
    if (!hasAccess) return []
    const rows = await ChatMessage.findAll({
      where: { room_id: roomId },
      include: [{ model: User, as: 'sender', required: false }],
      order: [['created_at', 'ASC']]
    })
    return rows.map((row) => {
      const r = this.plain(row)
      const sender = r.sender || {}
      return {
        id: String(r.id),
        roomId: r.room_id,
        nickname: r.sender_nickname,
        senderUserId: r.sender_user_id ? String(r.sender_user_id) : null,
        text: r.deleted_at ? 'Повідомлення видалено' : r.message_text,
        attachmentUrl: r.deleted_at ? '' : (r.attachment_url || ''),
        attachmentName: r.deleted_at ? '' : (r.attachment_name || ''),
        selectionJson: r.deleted_at ? '' : (r.selection_json || ''),
        senderIsAdmin: !!(sender.is_admin || sender.is_super_admin),
        senderIsActivated: !!sender.is_activated,
        createdAt: r.created_at,
        editedAt: r.edited_at || null,
        deletedAt: r.deleted_at || null,
        readAt: r.read_at || null
      }
    })
  }

  async markChatRead(userId, roomId) {
    const me = await User.findByPk(userId)
    const thread = await ChatThread.findOne({ where: { room_id: roomId } })
    const isAdmin = !!(me?.is_admin || me?.is_super_admin)
    const hasAccess = thread && (String(thread.buyer_id) === String(userId) || String(thread.seller_id) === String(userId) || (isAdmin && ['support', 'admin_support'].includes(thread.topic)))
    if (!hasAccess) return { ok: false, count: 0 }
    const readAt = new Date()
    const [count] = await ChatMessage.update(
      { read_at: readAt },
      { where: { room_id: roomId, [Op.or]: [{ sender_user_id: { [Op.ne]: userId } }, { sender_user_id: null }], deleted_at: null, read_at: null } }
    )
    if (count) wsHub.broadcast({ type: 'chat-read', roomId, readerUserId: String(userId), readAt })
    return { ok: true, count }
  }

  async editChatMessage(userId, messageId, text) {
    if (!String(text || '').trim()) throw ApiError.BadRequest('Вкажіть текст повідомлення')
    const row = await ChatMessage.findOne({ where: { id: messageId, sender_user_id: userId, deleted_at: null } })
    if (!row) throw ApiError.BadRequest('Повідомлення не знайдено')
    await row.update({ message_text: String(text).trim(), edited_at: new Date() })
    wsHub.broadcast({ type: 'message-edited', roomId: row.room_id, messageId: String(row.id), text: row.message_text, editedAt: row.edited_at })
    return { ok: true }
  }

  async deleteChatMessage(userId, messageId) {
    const row = await ChatMessage.findOne({ where: { id: messageId, sender_user_id: userId, deleted_at: null } })
    if (!row) throw ApiError.BadRequest('Повідомлення не знайдено')
    await row.update({ deleted_at: new Date(), message_text: '' })
    wsHub.broadcast({ type: 'message-deleted', roomId: row.room_id, messageId: String(row.id), deletedAt: row.deleted_at })
    return { ok: true }
  }

  async hideChatThread(userId, roomId) {
    const thread = await ChatThread.findOne({ where: { room_id: roomId } })
    if (!thread) throw ApiError.BadRequest('Чат не знайдено')
    if (thread.topic === 'support' || thread.topic === 'admin_support') throw ApiError.BadRequest('Чати підтримки не можна видаляти')
    const msgCount = await ChatMessage.count({ where: { room_id: roomId, deleted_at: null } })
    if (!msgCount) {
      if (String(thread.buyer_id) === String(userId) || String(thread.seller_id) === String(userId)) {
        await ChatMessage.destroy({ where: { room_id: roomId } })
        await thread.destroy()
      }
      return { ok: true }
    }
    if (String(thread.buyer_id) === String(userId)) await thread.update({ hidden_for_buyer: true })
    else if (String(thread.seller_id) === String(userId)) await thread.update({ hidden_for_seller: true })
    else {
      const me = await User.findByPk(userId)
      if (!me?.is_admin && !me?.is_super_admin) throw ApiError.BadRequest('Немає доступу до чату')
      await thread.update({ hidden_for_seller: true })
    }
    return { ok: true }
  }

  async addReview(buyerId, sellerId, rating, comment, listingId = null, pros = '', cons = '', purchaseId = null) {
    if (!listingId) throw ApiError.BadRequest('Відгук доступний лише після покупки')
    const purchaseWhere = { buyer_id: buyerId, listing_id: listingId }
    if (purchaseId) purchaseWhere.id = purchaseId
    const purchase = await Purchase.findOne({
      where: purchaseWhere,
      include: [this.listingInclude(true)]
    })
    if (!purchase || String(purchase.listing.owner_id) !== String(sellerId)) throw ApiError.BadRequest('Відгук можна залишити лише після покупки цього товару')
    const existing = await SellerReview.findOne({ where: { buyer_id: buyerId, purchase_id: purchase.id } })
    if (existing) throw ApiError.BadRequest('Відгук для цієї покупки вже існує')
    const listing = purchase.listing
    await SellerReview.create({
      seller_id: sellerId,
      buyer_id: buyerId,
      listing_id: listingId,
      purchase_id: purchase.id,
      rating: Math.max(1, Math.min(5, Number(rating) || 5)),
      comment: comment || null,
      pros: pros || null,
      cons: cons || null,
      listing_title_snapshot: listing.title || null,
      listing_image_url_snapshot: listing.image_url || null,
      listing_price_snapshot: listing.price || null
    })
    return { ok: true }
  }

  mapReview(rowLike, viewerId = null) {
    const r = this.plain(rowLike) || {}
    const buyer = r.buyer || {}
    const seller = r.seller || {}
    const listing = r.listing || {}
    const votes = (r.votes || []).map((vote) => this.plain(vote))
    const replies = (r.replies || []).map((reply) => {
      const rr = this.plain(reply)
      const user = rr.user || {}
      return {
        id: String(rr.id),
        reviewId: String(rr.review_id),
        userId: String(rr.user_id),
        email: user.email,
        nickname: user.nickname || String(user.email || '').split('@')[0],
        isAdmin: !!(user.is_admin || user.is_super_admin),
        isActivated: !!user.is_activated,
        text: rr.reply_text,
        createdAt: rr.created_at
      }
    })
    return {
      ...r,
      id: String(r.id),
      seller_id: String(r.seller_id),
      buyer_id: String(r.buyer_id),
      listing_id: r.listing_id ? String(r.listing_id) : null,
      listing_title: listing.title || r.listing_title_snapshot || null,
      listing_image_url: listing.image_url || r.listing_image_url_snapshot || '',
      listing_price: listing.price !== null && listing.price !== undefined ? Number(listing.price) : (r.listing_price_snapshot !== null && r.listing_price_snapshot !== undefined ? Number(r.listing_price_snapshot) : null),
      buyer_email: buyer.email || '',
      buyer_nickname: buyer.nickname || String(buyer.email || '').split('@')[0],
      buyer_is_admin: !!(buyer.is_admin || buyer.is_super_admin),
      buyer_is_activated: !!buyer.is_activated,
      seller_email: seller.email || '',
      seller_nickname: seller.nickname || String(seller.email || '').split('@')[0],
      seller_is_admin: !!(seller.is_admin || seller.is_super_admin),
      seller_is_activated: !!seller.is_activated,
      likes: votes.filter((vote) => vote.vote_type === 'like').length,
      dislikes: votes.filter((vote) => vote.vote_type === 'dislike').length,
      my_vote: viewerId ? (votes.find((vote) => String(vote.user_id) === String(viewerId))?.vote_type || null) : null,
      replies
    }
  }

  async getSellerReviews(sellerId, viewerId = null) {
    const rows = await SellerReview.findAll({
      where: { seller_id: sellerId },
      include: [
        { model: User, as: 'buyer', required: false },
        this.listingInclude(false),
        { model: ReviewVote, as: 'votes', required: false },
        { model: ReviewReply, as: 'replies', required: false, include: [{ model: User, as: 'user', required: false }] }
      ],
      order: [['created_at', 'DESC']]
    })
    return rows.map((row) => this.mapReview(row, viewerId))
  }

  async voteReview(userId, reviewId, voteType) {
    const vote = voteType === 'like' || voteType === 'dislike' ? voteType : null
    const review = await SellerReview.findByPk(reviewId)
    if (!review) throw ApiError.BadRequest('Відгук не знайдено')
    const prev = await ReviewVote.findOne({ where: { review_id: reviewId, user_id: userId } })
    if (!vote || prev?.vote_type === vote) {
      if (prev) await prev.destroy()
    } else if (prev) {
      await prev.update({ vote_type: vote, updated_at: new Date() })
    } else {
      await ReviewVote.create({ review_id: reviewId, user_id: userId, vote_type: vote })
    }
    const votes = await ReviewVote.findAll({ where: { review_id: reviewId }, raw: true })
    return {
      reviewId: String(reviewId),
      likes: votes.filter((v) => v.vote_type === 'like').length,
      dislikes: votes.filter((v) => v.vote_type === 'dislike').length,
      myVote: votes.find((v) => String(v.user_id) === String(userId))?.vote_type || null
    }
  }

  async addReviewReply(userId, reviewId, text) {
    if (!String(text || '').trim()) throw ApiError.BadRequest('Вкажіть текст відповіді')
    const review = await SellerReview.findByPk(reviewId)
    if (!review) throw ApiError.BadRequest('Відгук не знайдено')
    const result = await ReviewReply.create({ review_id: reviewId, user_id: userId, reply_text: String(text).trim() })
    return { ok: true, id: String(result.id) }
  }

  async addComplaint(userId, listingId, message, attachments = [], selectionJson = '') {
    const cleanMessage = String(message || '').trim()
    if (!cleanMessage) throw ApiError.BadRequest('Вкажіть текст скарги')
    if (cleanMessage.length > 1000) throw ApiError.BadRequest('Скарга не може бути довшою за 1000 символів')
    if (userId) {
      const recent = await Complaint.findAll({
        where: { user_id: userId, created_at: { [Op.gte]: new Date(Date.now() - 5 * 60 * 1000) } },
        attributes: ['message_text']
      })
      const usedChars = recent.reduce((sum, row) => sum + String(row.message_text || '').length, 0)
      if (usedChars + cleanMessage.length > 5000) throw ApiError.BadRequest('Забагато тексту у скаргах за 5 хвилин')
    }
    const item = await this.getById(listingId)
    const room = userId ? await this.startSupportChat(userId) : { roomId: null }
    const firstAttachment = attachments[0] || { url: '', name: '' }
    await Complaint.create({
      user_id: userId || null,
      listing_id: listingId,
      message_text: cleanMessage,
      room_id: room.roomId || null,
      attachment_url: firstAttachment.url || null,
      selection_json: selectionJson || null
    })
    if (room.roomId) {
      await this.saveChatMessage(room.roomId, 'complaint', `Скарга на оголошення "${item.title}": ${cleanMessage}`, userId, firstAttachment.url || '', firstAttachment.name || '', selectionJson)
      for (const attachment of attachments.slice(1)) {
        await this.saveChatMessage(room.roomId, 'complaint', 'Фото до скарги', userId, attachment.url || '', attachment.name || '', '')
      }
    }
    return { ok: true, roomId: room.roomId }
  }

  async getComplaints(userId) {
    const me = await User.findByPk(userId)
    const isAdmin = !!(me?.is_admin || me?.is_super_admin)
    const rows = await Complaint.findAll({
      where: isAdmin ? { status: { [Op.ne]: 'resolved' } } : { user_id: userId, status: { [Op.ne]: 'resolved' } },
      include: [
        this.listingInclude(false),
        { model: User, as: 'user', required: false }
      ],
      order: [['created_at', 'DESC']]
    })
    return Promise.all(rows.map(async (row) => {
      const r = this.plain(row)
      const fallbackAttachment = r.attachment_url ? null : await ChatMessage.findOne({
        where: { room_id: r.room_id || '', attachment_url: { [Op.ne]: null }, deleted_at: null },
        order: [['created_at', 'ASC']]
      })
      return {
        id: String(r.id),
        userId: r.user_id ? String(r.user_id) : null,
        listingId: r.listing_id ? String(r.listing_id) : '',
        listingTitle: r.listing?.title || '',
        userEmail: r.user?.email || '',
        text: r.message_text,
        roomId: r.room_id || '',
        attachmentUrl: r.attachment_url || fallbackAttachment?.attachment_url || '',
        selectionJson: r.selection_json || '',
        status: r.status || 'open',
        createdAt: r.created_at
      }
    }))
  }

  async resolveComplaint(userId, complaintId) {
    await this.ensureAdmin(userId)
    await Complaint.update({ status: 'resolved' }, { where: { id: complaintId } })
    return { ok: true }
  }

  async createPurchase(buyerId, listingIds) {
    const ids = Array.isArray(listingIds) ? listingIds.filter(Boolean) : [listingIds].filter(Boolean)
    if (!ids.length) throw ApiError.BadRequest('Немає товарів для покупки')
    const buyer = await User.findByPk(buyerId, { raw: true })
    if (!buyer) throw ApiError.BadRequest('Користувача не знайдено')
    const rows = await Listing.findAll({
      where: { id: { [Op.in]: ids } },
      include: this.listingExtras()
    })
    const activeRows = rows.filter((row) => (row.status || 'active') === 'active' && String(row.owner_id) !== String(buyerId))
    if (!activeRows.length) throw ApiError.BadRequest('Немає активних товарів для покупки')
    for (const row of activeRows) {
      const listing = this.plain(row)
      const seller = listing.owner || {}
      const imageUrls = this.safeImageUrls(listing)
      await Purchase.create({
        buyer_id: buyerId,
        listing_id: listing.id,
        price: listing.price,
        listing_title_snapshot: listing.title,
        listing_description_snapshot: listing.description,
        listing_image_url_snapshot: imageUrls[0] || listing.image_url,
        listing_image_urls_snapshot: JSON.stringify(imageUrls),
        listing_currency_snapshot: listing.currency || 'UAH',
        listing_category_snapshot: listing.category || null,
        seller_id_snapshot: listing.owner_id
      })
      await row.update({ status: 'sold', moderation_reason: null })
      await CartItem.destroy({ where: { listing_id: listing.id } })
      wsHub.broadcast({ type: 'listing-remove', listingId: String(listing.id), status: 'sold' })
      const mailListing = { ...listing, seller_email: seller.email || '', seller_nickname: seller.nickname || '' }
      mailService.sendPurchaseBuyerMail(buyer.email, buyer, mailListing).catch(() => null)
      mailService.sendPurchaseSellerMail(seller.email, buyer, mailListing).catch(() => null)
    }
    return { ok: true, count: activeRows.length }
  }

  async relistMyListing(ownerId, id) {
    const row = await Listing.findOne({ where: { id, owner_id: ownerId, status: 'sold' } })
    if (!row) throw ApiError.BadRequest('Продане оголошення не знайдено')
    await row.update({ status: 'active', moderation_reason: null })
    const updated = await this.getById(id)
    wsHub.broadcast({ type: 'listing-upsert', listing: updated })
    return updated
  }

  async getPendingReviews(userId) {
    const purchases = await Purchase.findAll({
      where: { buyer_id: userId },
      include: [this.listingInclude(true)],
      order: [['created_at', 'DESC']]
    })
    const reviews = await SellerReview.findAll({ where: { buyer_id: userId }, raw: true })
    return purchases
      .filter((purchase) => !reviews.some((review) => String(review.purchase_id) === String(purchase.id) || (!review.purchase_id && String(review.listing_id) === String(purchase.listing_id))))
      .map((purchase) => ({ ...this.mapPurchaseListing(purchase, purchase.listing), purchasedAt: purchase.created_at, purchaseId: String(purchase.id) }))
  }

  async getMyReviews(userId) {
    const include = [
      { model: User, as: 'buyer', required: false },
      { model: User, as: 'seller', required: false },
      this.listingInclude(false),
      { model: ReviewVote, as: 'votes', required: false },
      { model: ReviewReply, as: 'replies', required: false, include: [{ model: User, as: 'user', required: false }] }
    ]
    const [received, given] = await Promise.all([
      SellerReview.findAll({ where: { seller_id: userId }, include, order: [['created_at', 'DESC']] }),
      SellerReview.findAll({ where: { buyer_id: userId }, include, order: [['created_at', 'DESC']] })
    ])
    return { received: received.map((row) => this.mapReview(row, userId)), given: given.map((row) => this.mapReview(row, userId)) }
  }

  async getMyPurchases(userId) {
    const rows = await Purchase.findAll({
      where: { buyer_id: userId },
      include: [this.listingInclude(false)],
      order: [['created_at', 'DESC']]
    })
    return rows.map((purchase) => ({ ...this.mapPurchaseListing(purchase, purchase.listing), purchasedAt: purchase.created_at, purchaseId: String(purchase.id) }))
  }

  async getMySales(userId) {
    const rows = await Purchase.findAll({
      include: [
        this.listingInclude(false),
        { model: User, as: 'buyer', required: false }
      ],
      order: [['created_at', 'DESC']]
    })
    return rows.filter((purchase) => String(purchase.listing?.owner_id || purchase.seller_id_snapshot || '') === String(userId)).map((purchase) => ({
      ...this.mapPurchaseListing(purchase, purchase.listing),
      soldAt: purchase.created_at,
      soldPrice: Number(purchase.price),
      buyerId: purchase.buyer_id ? String(purchase.buyer_id) : null,
      buyerEmail: purchase.buyer?.email || null,
      buyerNickname: purchase.buyer?.nickname || null
    }))
  }
}

module.exports = new ListingService()
