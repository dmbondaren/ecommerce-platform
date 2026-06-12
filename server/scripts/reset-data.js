require('dotenv').config()
const fs = require('fs/promises')
const path = require('path')
const { initializeOrm, sequelize, models, Op } = require('../orm/models')

const {
  User,
  RefreshToken,
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
} = models

async function clearUploads() {
  const uploadsDir = path.resolve(__dirname, '..', 'uploads')
  await fs.mkdir(uploadsDir, { recursive: true })
  const entries = await fs.readdir(uploadsDir, { withFileTypes: true })
  await Promise.all(entries
    .filter((entry) => entry.name !== '.gitkeep')
    .map((entry) => fs.rm(path.join(uploadsDir, entry.name), { recursive: true, force: true })))
  await fs.writeFile(path.join(uploadsDir, '.gitkeep'), '')
}

async function clearRows(Model, transaction) {
  await Model.destroy({ where: {}, transaction })
}

async function resetData() {
  await initializeOrm()

  await sequelize.transaction(async (transaction) => {
    const tables = [
      ReviewVote,
      ReviewReply,
      SellerReview,
      Favorite,
      CartItem,
      ViewHistory,
      ListingImage,
      Purchase,
      Complaint,
      AdminListingAction,
      UserNotification,
      ChatMessage,
      ChatThread,
      NicknameHistory,
      RefreshToken,
      SearchStat,
      Listing
    ]

    for (const table of tables) {
      await clearRows(table, transaction)
    }

    await User.destroy({
      where: {
        [Op.or]: [
          { is_super_admin: false },
          { is_super_admin: null }
        ]
      },
      transaction
    })

    await User.update(
      {
        is_admin: true,
        is_super_admin: true,
        is_activated: true,
        banned_until: null,
        banned_permanent: false,
        ban_reason: null,
        avatar_url: null,
        preferred_currency: 'UAH'
      },
      { where: { is_super_admin: true }, transaction }
    )
  })

  await clearUploads()
  const superAdmins = await User.count({ where: { is_super_admin: true } })
  await sequelize.close()
  console.log(`Дані очищено. Супер-адміністраторів залишилось: ${superAdmins}`)
}

resetData().catch(async (error) => {
  console.error(error)
  try { await sequelize.close() } catch (_) {}
  process.exit(1)
})
