const path = require('path')
const bcrypt = require('bcrypt')
const { Sequelize, DataTypes, Op } = require('sequelize')

const dialect = process.env.DB_DIALECT || process.env.MYSQL_DIALECT || 'mysql'
const dbName = process.env.DB_NAME || process.env.MYSQL_DB || 'ecommerce_platform'
const dbUser = process.env.DB_USER || process.env.MYSQL_USER || 'root'
const dbPassword = process.env.DB_PASSWORD || process.env.MYSQL_PASSWORD || 'root'
const dbHost = process.env.DB_HOST || process.env.MYSQL_HOST || 'localhost'
const dbPort = Number(process.env.DB_PORT || process.env.MYSQL_PORT || 3306)
const storage = process.env.DB_STORAGE || path.resolve(__dirname, '..', 'database.sqlite')

const sequelize = dialect === 'sqlite'
  ? new Sequelize({ dialect, storage, logging: process.env.DB_LOGGING === 'true' ? console.log : false })
  : new Sequelize(dbName, dbUser, dbPassword, {
      host: dbHost,
      port: dbPort,
      dialect,
      logging: process.env.DB_LOGGING === 'true' ? console.log : false,
      pool: {
        max: Number(process.env.DB_POOL_MAX || 10),
        min: 0,
        idle: 10000
      }
    })

const commonOptions = {
  timestamps: false,
  freezeTableName: true
}

const DEFAULT_CATEGORIES = ['Техніка', 'Робота', 'Доставка', 'Цифрові послуги']

const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  email: { type: DataTypes.STRING(255), allowNull: false },
  password: { type: DataTypes.STRING(255), allowNull: false },
  is_activated: { type: DataTypes.BOOLEAN, defaultValue: false },
  activation_link: { type: DataTypes.STRING(255), allowNull: true },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  phone: { type: DataTypes.STRING(40), allowNull: true },
  nickname: { type: DataTypes.STRING(80), allowNull: true },
  is_admin: { type: DataTypes.BOOLEAN, defaultValue: false },
  is_super_admin: { type: DataTypes.BOOLEAN, defaultValue: false },
  banned_until: { type: DataTypes.DATE, allowNull: true },
  banned_permanent: { type: DataTypes.BOOLEAN, defaultValue: false },
  ban_reason: { type: DataTypes.TEXT, allowNull: true },
  password_reset_link: { type: DataTypes.STRING(255), allowNull: true },
  password_reset_expires: { type: DataTypes.DATE, allowNull: true },
  preferred_currency: { type: DataTypes.STRING(8), defaultValue: 'UAH' },
  avatar_url: { type: DataTypes.TEXT, allowNull: true }
}, {
  ...commonOptions,
  tableName: 'users',
  indexes: [{ unique: true, name: 'email', fields: ['email'] }]
})

const RefreshToken = sequelize.define('RefreshToken', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  refresh_token: { type: DataTypes.TEXT, allowNull: false },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  ...commonOptions,
  tableName: 'refresh_tokens',
  indexes: [{ unique: true, name: 'user_id', fields: ['user_id'] }]
})

const Category = sequelize.define('Category', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  name: { type: DataTypes.STRING(64), allowNull: false },
  sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  ...commonOptions,
  tableName: 'categories',
  indexes: [
    { unique: true, name: 'category_name', fields: ['name'] },
    { fields: ['sort_order'] }
  ]
})

const Listing = sequelize.define('Listing', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  owner_id: { type: DataTypes.INTEGER, allowNull: false },
  title: { type: DataTypes.STRING(255), allowNull: false },
  description: { type: DataTypes.TEXT, allowNull: false },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  currency: { type: DataTypes.STRING(8), defaultValue: 'UAH' },
  image_url: { type: DataTypes.TEXT, allowNull: false },
  image_urls: { type: DataTypes.TEXT('long'), allowNull: true },
  location: { type: DataTypes.STRING(255), allowNull: true },
  phone: { type: DataTypes.STRING(40), allowNull: true },
  category: { type: DataTypes.STRING(64), allowNull: true },
  status: { type: DataTypes.STRING(20), defaultValue: 'active' },
  moderation_reason: { type: DataTypes.TEXT, allowNull: true },
  deactivated_by: { type: DataTypes.INTEGER, allowNull: true },
  deactivated_at: { type: DataTypes.DATE, allowNull: true },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  ...commonOptions,
  tableName: 'listings',
  indexes: [
    { fields: ['owner_id'] },
    { fields: ['status'] },
    { fields: ['category'] }
  ]
})

const ListingImage = sequelize.define('ListingImage', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  listing_id: { type: DataTypes.INTEGER, allowNull: false },
  image_url: { type: DataTypes.TEXT, allowNull: false },
  sort_order: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  ...commonOptions,
  tableName: 'listing_images',
  indexes: [
    { fields: ['listing_id', 'sort_order'] }
  ]
})

const Favorite = sequelize.define('Favorite', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  listing_id: { type: DataTypes.INTEGER, allowNull: false },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  ...commonOptions,
  tableName: 'favorites',
  indexes: [{ unique: true, fields: ['user_id', 'listing_id'] }]
})

const CartItem = sequelize.define('CartItem', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  listing_id: { type: DataTypes.INTEGER, allowNull: false },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  ...commonOptions,
  tableName: 'cart_items',
  indexes: [{ unique: true, fields: ['user_id', 'listing_id'] }]
})

const ChatThread = sequelize.define('ChatThread', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  buyer_id: { type: DataTypes.INTEGER, allowNull: true },
  seller_id: { type: DataTypes.INTEGER, allowNull: true },
  listing_id: { type: DataTypes.INTEGER, allowNull: true },
  chat_type: { type: DataTypes.STRING(16), allowNull: false },
  room_id: { type: DataTypes.STRING(80), allowNull: false },
  topic: { type: DataTypes.STRING(32), defaultValue: 'listing' },
  hidden_for_buyer: { type: DataTypes.BOOLEAN, defaultValue: false },
  hidden_for_seller: { type: DataTypes.BOOLEAN, defaultValue: false },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  ...commonOptions,
  tableName: 'chat_threads',
  indexes: [
    { unique: true, name: 'room_id', fields: ['room_id'] },
    { fields: ['buyer_id'] },
    { fields: ['seller_id'] },
    { fields: ['topic'] }
  ]
})

const ChatMessage = sequelize.define('ChatMessage', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  room_id: { type: DataTypes.STRING(80), allowNull: false },
  sender_nickname: { type: DataTypes.STRING(80), allowNull: false },
  sender_user_id: { type: DataTypes.INTEGER, allowNull: true },
  message_text: { type: DataTypes.TEXT, allowNull: false },
  attachment_url: { type: DataTypes.TEXT, allowNull: true },
  attachment_name: { type: DataTypes.STRING(255), allowNull: true },
  selection_json: { type: DataTypes.TEXT, allowNull: true },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  edited_at: { type: DataTypes.DATE, allowNull: true },
  deleted_at: { type: DataTypes.DATE, allowNull: true },
  read_at: { type: DataTypes.DATE, allowNull: true }
}, {
  ...commonOptions,
  tableName: 'chat_messages',
  indexes: [
    { fields: ['room_id', 'created_at'] },
    { fields: ['sender_user_id'] },
    { fields: ['read_at'] }
  ]
})

const SellerReview = sequelize.define('SellerReview', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  seller_id: { type: DataTypes.INTEGER, allowNull: false },
  buyer_id: { type: DataTypes.INTEGER, allowNull: false },
  listing_id: { type: DataTypes.INTEGER, allowNull: true },
  purchase_id: { type: DataTypes.INTEGER, allowNull: true },
  rating: { type: DataTypes.INTEGER, allowNull: false },
  comment: { type: DataTypes.TEXT, allowNull: true },
  pros: { type: DataTypes.TEXT, allowNull: true },
  cons: { type: DataTypes.TEXT, allowNull: true },
  listing_title_snapshot: { type: DataTypes.STRING(255), allowNull: true },
  listing_image_url_snapshot: { type: DataTypes.TEXT, allowNull: true },
  listing_price_snapshot: { type: DataTypes.DECIMAL(10, 2), allowNull: true },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  ...commonOptions,
  tableName: 'seller_reviews',
  indexes: [
    { fields: ['seller_id', 'created_at'] },
    { fields: ['buyer_id'] },
    { fields: ['purchase_id'] }
  ]
})

const ReviewVote = sequelize.define('ReviewVote', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  review_id: { type: DataTypes.INTEGER, allowNull: false },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  vote_type: { type: DataTypes.STRING(8), allowNull: false },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW },
  updated_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  ...commonOptions,
  tableName: 'review_votes',
  indexes: [{ unique: true, fields: ['review_id', 'user_id'] }]
})

const ReviewReply = sequelize.define('ReviewReply', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  review_id: { type: DataTypes.INTEGER, allowNull: false },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  reply_text: { type: DataTypes.TEXT, allowNull: false },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  ...commonOptions,
  tableName: 'review_replies',
  indexes: [{ fields: ['review_id', 'created_at'] }]
})

const Complaint = sequelize.define('Complaint', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  user_id: { type: DataTypes.INTEGER, allowNull: true },
  listing_id: { type: DataTypes.INTEGER, allowNull: true },
  message_text: { type: DataTypes.TEXT, allowNull: false },
  room_id: { type: DataTypes.STRING(80), allowNull: true },
  attachment_url: { type: DataTypes.TEXT, allowNull: true },
  selection_json: { type: DataTypes.TEXT, allowNull: true },
  status: { type: DataTypes.STRING(20), defaultValue: 'open' },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  ...commonOptions,
  tableName: 'complaints',
  indexes: [
    { fields: ['user_id'] },
    { fields: ['status'] }
  ]
})

const Purchase = sequelize.define('Purchase', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  buyer_id: { type: DataTypes.INTEGER, allowNull: true },
  listing_id: { type: DataTypes.INTEGER, allowNull: true },
  price: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
  listing_title_snapshot: { type: DataTypes.STRING(255), allowNull: true },
  listing_description_snapshot: { type: DataTypes.TEXT, allowNull: true },
  listing_image_url_snapshot: { type: DataTypes.TEXT, allowNull: true },
  listing_image_urls_snapshot: { type: DataTypes.TEXT('long'), allowNull: true },
  listing_currency_snapshot: { type: DataTypes.STRING(8), allowNull: true },
  listing_category_snapshot: { type: DataTypes.STRING(64), allowNull: true },
  seller_id_snapshot: { type: DataTypes.INTEGER, allowNull: true },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  ...commonOptions,
  tableName: 'purchases',
  indexes: [
    { fields: ['buyer_id', 'created_at'] },
    { fields: ['listing_id'] }
  ]
})

const NicknameHistory = sequelize.define('NicknameHistory', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  old_nickname: { type: DataTypes.STRING(80), allowNull: false },
  changed_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  ...commonOptions,
  tableName: 'nickname_history',
  indexes: [{ fields: ['user_id', 'changed_at'] }]
})

const AdminListingAction = sequelize.define('AdminListingAction', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  admin_id: { type: DataTypes.INTEGER, allowNull: true },
  listing_id: { type: DataTypes.INTEGER, allowNull: true },
  action_type: { type: DataTypes.STRING(32), allowNull: false },
  reason: { type: DataTypes.TEXT, allowNull: true },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, { ...commonOptions, tableName: 'admin_listing_actions' })

const UserNotification = sequelize.define('UserNotification', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  message_text: { type: DataTypes.TEXT, allowNull: false },
  is_read: { type: DataTypes.BOOLEAN, defaultValue: false },
  created_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  ...commonOptions,
  tableName: 'user_notifications',
  indexes: [{ fields: ['user_id', 'created_at'] }]
})

const ViewHistory = sequelize.define('ViewHistory', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  listing_id: { type: DataTypes.INTEGER, allowNull: false },
  viewed_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  ...commonOptions,
  tableName: 'view_history',
  indexes: [{ fields: ['user_id', 'viewed_at'] }]
})

const SearchStat = sequelize.define('SearchStat', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  query_text: { type: DataTypes.STRING(255), allowNull: false },
  search_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  last_searched_at: { type: DataTypes.DATE, defaultValue: DataTypes.NOW }
}, {
  ...commonOptions,
  tableName: 'search_stats',
  indexes: [{ unique: true, name: 'query_text', fields: ['query_text'] }]
})

const cascade = { onDelete: 'CASCADE', onUpdate: 'CASCADE' }
const setNull = { onDelete: 'SET NULL', onUpdate: 'CASCADE' }

User.hasMany(RefreshToken, { foreignKey: 'user_id', as: 'refreshTokens', ...cascade })
RefreshToken.belongsTo(User, { foreignKey: 'user_id', as: 'user', ...cascade })

User.hasMany(Listing, { foreignKey: 'owner_id', as: 'listings', ...cascade })
Listing.belongsTo(User, { foreignKey: 'owner_id', as: 'owner', ...cascade })
Listing.belongsTo(User, { foreignKey: 'deactivated_by', as: 'deactivatedBy', ...setNull })
Listing.hasMany(ListingImage, { foreignKey: 'listing_id', as: 'images', ...cascade })
ListingImage.belongsTo(Listing, { foreignKey: 'listing_id', as: 'listing', ...cascade })

Favorite.belongsTo(User, { foreignKey: 'user_id', as: 'user', ...cascade })
Favorite.belongsTo(Listing, { foreignKey: 'listing_id', as: 'listing', ...cascade })
CartItem.belongsTo(User, { foreignKey: 'user_id', as: 'user', ...cascade })
CartItem.belongsTo(Listing, { foreignKey: 'listing_id', as: 'listing', ...cascade })
ViewHistory.belongsTo(User, { foreignKey: 'user_id', as: 'user', ...cascade })
ViewHistory.belongsTo(Listing, { foreignKey: 'listing_id', as: 'listing', ...cascade })

ChatThread.belongsTo(Listing, { foreignKey: 'listing_id', as: 'listing', ...setNull })
ChatThread.belongsTo(User, { foreignKey: 'buyer_id', as: 'buyer', ...setNull })
ChatThread.belongsTo(User, { foreignKey: 'seller_id', as: 'seller', ...setNull })
ChatThread.hasMany(ChatMessage, { foreignKey: 'room_id', sourceKey: 'room_id', as: 'messages', ...cascade })
ChatMessage.belongsTo(ChatThread, { foreignKey: 'room_id', targetKey: 'room_id', as: 'thread', ...cascade })
ChatMessage.belongsTo(User, { foreignKey: 'sender_user_id', as: 'sender', ...setNull })

SellerReview.belongsTo(User, { foreignKey: 'buyer_id', as: 'buyer', ...cascade })
SellerReview.belongsTo(User, { foreignKey: 'seller_id', as: 'seller', ...cascade })
SellerReview.belongsTo(Listing, { foreignKey: 'listing_id', as: 'listing', ...setNull })
SellerReview.belongsTo(Purchase, { foreignKey: 'purchase_id', as: 'purchase', ...setNull })
SellerReview.hasMany(ReviewVote, { foreignKey: 'review_id', as: 'votes', ...cascade })
SellerReview.hasMany(ReviewReply, { foreignKey: 'review_id', as: 'replies', ...cascade })
ReviewVote.belongsTo(SellerReview, { foreignKey: 'review_id', as: 'review', ...cascade })
ReviewVote.belongsTo(User, { foreignKey: 'user_id', as: 'user', ...cascade })
ReviewReply.belongsTo(SellerReview, { foreignKey: 'review_id', as: 'review', ...cascade })
ReviewReply.belongsTo(User, { foreignKey: 'user_id', as: 'user', ...cascade })

Complaint.belongsTo(User, { foreignKey: 'user_id', as: 'user', ...setNull })
Complaint.belongsTo(Listing, { foreignKey: 'listing_id', as: 'listing', ...setNull })
Purchase.belongsTo(User, { foreignKey: 'buyer_id', as: 'buyer', ...setNull })
Purchase.belongsTo(User, { foreignKey: 'seller_id_snapshot', as: 'sellerSnapshot', ...setNull })
Purchase.belongsTo(Listing, { foreignKey: 'listing_id', as: 'listing', ...setNull })
NicknameHistory.belongsTo(User, { foreignKey: 'user_id', as: 'user', ...cascade })
AdminListingAction.belongsTo(User, { foreignKey: 'admin_id', as: 'admin', ...setNull })
AdminListingAction.belongsTo(Listing, { foreignKey: 'listing_id', as: 'listing', ...setNull })
UserNotification.belongsTo(User, { foreignKey: 'user_id', as: 'user', ...cascade })

const models = {
  User,
  RefreshToken,
  Category,
  Listing,
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
  NicknameHistory,
  AdminListingAction,
  UserNotification,
  ViewHistory,
  SearchStat
}

async function ensureSuperAdmin() {
  const adminEmail = process.env.SUPER_ADMIN_EMAIL || 'admin@admin-ch'
  const adminPass = process.env.SUPER_ADMIN_PASSWORD || 'Admin123!'
  const existing = await User.findOne({ where: { email: adminEmail } })
  if (existing) {
    await existing.update({ is_admin: true, is_super_admin: true, is_activated: true })
    return
  }
  const hash = await bcrypt.hash(adminPass, 10)
  await User.create({
    email: adminEmail,
    password: hash,
    is_activated: true,
    nickname: 'superadmin',
    is_admin: true,
    is_super_admin: true
  })
}

function normalizeTableName(table) {
  if (typeof table === 'string') return table
  return table?.tableName || table?.name || ''
}

async function prepareExistingDataForForeignKeys() {
  if (dialect !== 'mysql') return
  const queryInterface = sequelize.getQueryInterface()
  const tableNames = new Set((await queryInterface.showAllTables()).map(normalizeTableName).filter(Boolean))
  const hasTables = (...names) => names.every((name) => tableNames.has(name))
  const run = async (tables, sql) => {
    if (!hasTables(...tables)) return
    try {
      await sequelize.query(sql)
    } catch (error) {
      const code = error?.parent?.code || error?.original?.code
      if (code === 'ER_BAD_FIELD_ERROR') return
      throw error
    }
  }
  const makeNullableInt = async (table, column) => {
    if (!hasTables(table)) return
    const [columns] = await sequelize.query(
      'SELECT IS_NULLABLE FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
      { replacements: [table, column] }
    )
    if (!columns.length) return
    if (columns[0]?.IS_NULLABLE !== 'YES') await sequelize.query(`ALTER TABLE \`${table}\` MODIFY \`${column}\` INT NULL`)
  }
  const trimDuplicateIndexes = async (table, column, keepName) => {
    if (!hasTables(table)) return
    const [indexes] = await sequelize.query(
      'SELECT INDEX_NAME, MIN(NON_UNIQUE) AS NON_UNIQUE FROM INFORMATION_SCHEMA.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? GROUP BY INDEX_NAME HAVING COUNT(*) = 1 AND SUM(CASE WHEN COLUMN_NAME = ? THEN 1 ELSE 0 END) = 1',
      { replacements: [table, column] }
    )
    const uniqueNames = [...new Set(indexes.map((row) => row.INDEX_NAME).filter((name) => name && name !== 'PRIMARY'))]
    if (uniqueNames.length <= 1) return
    const preferred = uniqueNames.includes(keepName)
      ? keepName
      : indexes.find((row) => row.NON_UNIQUE === 0 && uniqueNames.includes(row.INDEX_NAME))?.INDEX_NAME || uniqueNames[0]
    for (const indexName of uniqueNames) {
      if (indexName === preferred) continue
      try {
        await sequelize.query(`ALTER TABLE \`${table}\` DROP INDEX \`${String(indexName).replace(/`/g, '``')}\``)
      } catch (error) {
        const code = error?.parent?.code || error?.original?.code
        if (!['ER_CANT_DROP_FIELD_OR_KEY', 'ER_DROP_INDEX_FK'].includes(code)) throw error
      }
    }
  }

  await trimDuplicateIndexes('users', 'email', 'email')
  await trimDuplicateIndexes('chat_threads', 'room_id', 'room_id')
  await trimDuplicateIndexes('refresh_tokens', 'user_id', 'user_id')
  await trimDuplicateIndexes('search_stats', 'query_text', 'query_text')

  await Promise.all([
    makeNullableInt('chat_threads', 'buyer_id'),
    makeNullableInt('chat_threads', 'seller_id'),
    makeNullableInt('chat_threads', 'listing_id'),
    makeNullableInt('complaints', 'listing_id'),
    makeNullableInt('purchases', 'buyer_id'),
    makeNullableInt('purchases', 'listing_id'),
    makeNullableInt('purchases', 'seller_id_snapshot'),
    makeNullableInt('admin_listing_actions', 'admin_id'),
    makeNullableInt('admin_listing_actions', 'listing_id'),
    makeNullableInt('seller_reviews', 'listing_id'),
    makeNullableInt('seller_reviews', 'purchase_id')
  ])

  await run(['listings', 'users'], 'UPDATE `listings` l LEFT JOIN `users` u ON u.`id` = l.`deactivated_by` SET l.`deactivated_by` = NULL WHERE l.`deactivated_by` IS NOT NULL AND u.`id` IS NULL')
  await run(['listings', 'users'], 'DELETE l FROM `listings` l LEFT JOIN `users` u ON u.`id` = l.`owner_id` WHERE u.`id` IS NULL')
  await run(['listing_images', 'listings'], 'DELETE li FROM `listing_images` li LEFT JOIN `listings` l ON l.`id` = li.`listing_id` WHERE l.`id` IS NULL')
  await run(['refresh_tokens', 'users'], 'DELETE rt FROM `refresh_tokens` rt LEFT JOIN `users` u ON u.`id` = rt.`user_id` WHERE u.`id` IS NULL')

  await run(['chat_threads'], 'UPDATE `chat_threads` SET `buyer_id` = NULL WHERE `buyer_id` = 0')
  await run(['chat_threads'], 'UPDATE `chat_threads` SET `seller_id` = NULL WHERE `seller_id` = 0')
  await run(['chat_threads'], 'UPDATE `chat_threads` SET `listing_id` = NULL WHERE `listing_id` = 0')
  await run(['chat_threads', 'users'], 'UPDATE `chat_threads` ct LEFT JOIN `users` u ON u.`id` = ct.`buyer_id` SET ct.`buyer_id` = NULL WHERE ct.`buyer_id` IS NOT NULL AND u.`id` IS NULL')
  await run(['chat_threads', 'users'], 'UPDATE `chat_threads` ct LEFT JOIN `users` u ON u.`id` = ct.`seller_id` SET ct.`seller_id` = NULL WHERE ct.`seller_id` IS NOT NULL AND u.`id` IS NULL')
  await run(['chat_threads', 'listings'], 'UPDATE `chat_threads` ct LEFT JOIN `listings` l ON l.`id` = ct.`listing_id` SET ct.`listing_id` = NULL WHERE ct.`listing_id` IS NOT NULL AND l.`id` IS NULL')
  await run(['chat_messages', 'users'], 'UPDATE `chat_messages` cm LEFT JOIN `users` u ON u.`id` = cm.`sender_user_id` SET cm.`sender_user_id` = NULL WHERE cm.`sender_user_id` IS NOT NULL AND u.`id` IS NULL')
  await run(['chat_messages', 'chat_threads'], "INSERT INTO `chat_threads` (`buyer_id`, `seller_id`, `listing_id`, `chat_type`, `room_id`, `topic`, `created_at`) SELECT NULL, NULL, NULL, CASE WHEN cm.`room_id` LIKE 'support%' THEN 'support' ELSE 'buy' END, cm.`room_id`, CASE WHEN cm.`room_id` LIKE 'support%' THEN 'support' ELSE 'listing' END, MIN(COALESCE(cm.`created_at`, NOW())) FROM `chat_messages` cm LEFT JOIN `chat_threads` ct ON ct.`room_id` = cm.`room_id` WHERE ct.`room_id` IS NULL GROUP BY cm.`room_id`")

  await run(['favorites', 'users'], 'DELETE f FROM `favorites` f LEFT JOIN `users` u ON u.`id` = f.`user_id` WHERE u.`id` IS NULL')
  await run(['favorites', 'listings'], 'DELETE f FROM `favorites` f LEFT JOIN `listings` l ON l.`id` = f.`listing_id` WHERE l.`id` IS NULL')
  await run(['cart_items', 'users'], 'DELETE c FROM `cart_items` c LEFT JOIN `users` u ON u.`id` = c.`user_id` WHERE u.`id` IS NULL')
  await run(['cart_items', 'listings'], 'DELETE c FROM `cart_items` c LEFT JOIN `listings` l ON l.`id` = c.`listing_id` WHERE l.`id` IS NULL')
  await run(['view_history', 'users'], 'DELETE vh FROM `view_history` vh LEFT JOIN `users` u ON u.`id` = vh.`user_id` WHERE u.`id` IS NULL')
  await run(['view_history', 'listings'], 'DELETE vh FROM `view_history` vh LEFT JOIN `listings` l ON l.`id` = vh.`listing_id` WHERE l.`id` IS NULL')
  await run(['nickname_history', 'users'], 'DELETE nh FROM `nickname_history` nh LEFT JOIN `users` u ON u.`id` = nh.`user_id` WHERE u.`id` IS NULL')
  await run(['user_notifications', 'users'], 'DELETE un FROM `user_notifications` un LEFT JOIN `users` u ON u.`id` = un.`user_id` WHERE u.`id` IS NULL')

  await run(['seller_reviews', 'users'], 'DELETE sr FROM `seller_reviews` sr LEFT JOIN `users` buyer ON buyer.`id` = sr.`buyer_id` LEFT JOIN `users` seller ON seller.`id` = sr.`seller_id` WHERE buyer.`id` IS NULL OR seller.`id` IS NULL')
  await run(['seller_reviews', 'listings'], 'UPDATE `seller_reviews` sr LEFT JOIN `listings` l ON l.`id` = sr.`listing_id` SET sr.`listing_id` = NULL WHERE sr.`listing_id` IS NOT NULL AND l.`id` IS NULL')
  await run(['seller_reviews', 'purchases'], 'UPDATE `seller_reviews` sr LEFT JOIN `purchases` p ON p.`id` = sr.`purchase_id` SET sr.`purchase_id` = NULL WHERE sr.`purchase_id` IS NOT NULL AND p.`id` IS NULL')
  await run(['review_votes', 'seller_reviews'], 'DELETE rv FROM `review_votes` rv LEFT JOIN `seller_reviews` sr ON sr.`id` = rv.`review_id` WHERE sr.`id` IS NULL')
  await run(['review_votes', 'users'], 'DELETE rv FROM `review_votes` rv LEFT JOIN `users` u ON u.`id` = rv.`user_id` WHERE u.`id` IS NULL')
  await run(['review_replies', 'seller_reviews'], 'DELETE rr FROM `review_replies` rr LEFT JOIN `seller_reviews` sr ON sr.`id` = rr.`review_id` WHERE sr.`id` IS NULL')
  await run(['review_replies', 'users'], 'DELETE rr FROM `review_replies` rr LEFT JOIN `users` u ON u.`id` = rr.`user_id` WHERE u.`id` IS NULL')

  await run(['complaints', 'users'], 'UPDATE `complaints` c LEFT JOIN `users` u ON u.`id` = c.`user_id` SET c.`user_id` = NULL WHERE c.`user_id` IS NOT NULL AND u.`id` IS NULL')
  await run(['complaints', 'listings'], 'UPDATE `complaints` c LEFT JOIN `listings` l ON l.`id` = c.`listing_id` SET c.`listing_id` = NULL WHERE c.`listing_id` IS NOT NULL AND l.`id` IS NULL')
  await run(['purchases', 'users'], 'UPDATE `purchases` p LEFT JOIN `users` u ON u.`id` = p.`buyer_id` SET p.`buyer_id` = NULL WHERE p.`buyer_id` IS NOT NULL AND u.`id` IS NULL')
  await run(['purchases', 'users'], 'UPDATE `purchases` p LEFT JOIN `users` u ON u.`id` = p.`seller_id_snapshot` SET p.`seller_id_snapshot` = NULL WHERE p.`seller_id_snapshot` IS NOT NULL AND u.`id` IS NULL')
  await run(['purchases', 'listings'], 'UPDATE `purchases` p LEFT JOIN `listings` l ON l.`id` = p.`listing_id` SET p.`listing_id` = NULL WHERE p.`listing_id` IS NOT NULL AND l.`id` IS NULL')
  await run(['admin_listing_actions', 'users'], 'UPDATE `admin_listing_actions` a LEFT JOIN `users` u ON u.`id` = a.`admin_id` SET a.`admin_id` = NULL WHERE a.`admin_id` IS NOT NULL AND u.`id` IS NULL')
  await run(['admin_listing_actions', 'listings'], 'UPDATE `admin_listing_actions` a LEFT JOIN `listings` l ON l.`id` = a.`listing_id` SET a.`listing_id` = NULL WHERE a.`listing_id` IS NOT NULL AND l.`id` IS NULL')
}

async function ensureListingImages() {
  const listings = await Listing.findAll({
    include: [{ model: ListingImage, as: 'images', required: false }]
  })
  for (const listing of listings) {
    if (listing.images?.length) continue
    const urls = []
    try {
      const parsed = listing.image_urls ? JSON.parse(listing.image_urls) : []
      if (Array.isArray(parsed)) urls.push(...parsed)
    } catch (_) {}
    if (listing.image_url) urls.unshift(listing.image_url)
    const cleanUrls = [...new Set(urls.filter(Boolean))]
    if (!cleanUrls.length) continue
    await ListingImage.bulkCreate(cleanUrls.map((url, index) => ({
      listing_id: listing.id,
      image_url: url,
      sort_order: index
    })))
  }
}

async function ensureCategories() {
  await Promise.all(DEFAULT_CATEGORIES.map((name, index) => Category.findOrCreate({
    where: { name },
    defaults: { name, sort_order: index, is_active: true }
  })))
}

async function waitForDatabase(retries = 20) {
  let lastError = null
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      await sequelize.authenticate()
      return
    } catch (error) {
      lastError = error
      if (attempt === retries) break
      await new Promise((resolve) => setTimeout(resolve, 1500))
    }
  }
  throw lastError
}

async function initializeOrm() {
  await waitForDatabase()
  await prepareExistingDataForForeignKeys()
  await sequelize.sync({ alter: process.env.DB_SYNC_ALTER !== 'false' })
  await ensureCategories()
  await ensureListingImages()
  await ensureSuperAdmin()
}

module.exports = {
  sequelize,
  models,
  Op,
  dbName,
  DEFAULT_CATEGORIES,
  initializeOrm
}
