// Runs before any test file imports the application, so the configuration
// module sees these values. A dedicated database keeps tests away from
// development data: the integration suite empties the tables it uses.
process.env.NODE_ENV = 'test'
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://marketplace:marketplace@localhost:5432/marketplace_test?schema=public'
process.env.JWT_ACCESS_SECRET = 'test-secret-that-is-at-least-32-characters-long'
process.env.CLIENT_URL = 'http://localhost:5173'
process.env.UPLOAD_DIR = 'uploads'
process.env.SMTP_HOST = ''
