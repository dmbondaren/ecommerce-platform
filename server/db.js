const { initializeOrm, sequelize, models, Op, dbName, DEFAULT_CATEGORIES } = require('./orm/models')

async function initDb() {
  await initializeOrm()
}

module.exports = {
  initDb,
  sequelize,
  models,
  Op,
  dbName,
  DEFAULT_CATEGORIES
}
