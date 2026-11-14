import 'dotenv/config'
import { z } from 'zod'

/** Docker Compose passes unset variables as empty strings; treat those as absent. */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional())

const flag = z.enum(['true', 'false']).default('false').transform((value) => value === 'true')

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  // Render tells a service its own public address; there it is also the client's address.
  CLIENT_URL: z.preprocess(
    (value) => value || process.env.RENDER_EXTERNAL_URL || undefined,
    z.string().url().default('http://localhost:5173'),
  ),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  UPLOAD_DIR: z.string().default('uploads'),
  /** `database` keeps uploads in PostgreSQL, for hosts whose disk is wiped on every restart. */
  STORAGE_DRIVER: z.enum(['disk', 'database']).default('disk'),
  /** Folder with the built web client; when set, the API serves it too (single-service deployment). */
  CLIENT_DIST: optional(z.string()),
  /** Demo deployments without e-mail delivery: new accounts count as confirmed. */
  AUTO_VERIFY_EMAIL: flag,
  /** Adds demo users and listings at start-up when they are missing. */
  SEED_DEMO_DATA: flag,
  // Payments are simulated: buyers get these transfer details and confirm the payment themselves.
  PAYMENT_RECIPIENT: z.string().default('Marketplace Escrow (demo)'),
  PAYMENT_IBAN: z.string().default('CH93 0076 2011 6238 5295 7'),
  PAYMENT_WINDOW_MINUTES: z.coerce.number().int().min(1).max(24 * 60).default(15),
  SMTP_HOST: optional(z.string()),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: optional(z.string()),
  SMTP_PASSWORD: optional(z.string()),
  MAIL_FROM: z.string().default('Marketplace <no-reply@example.com>'),
  SUPER_ADMIN_EMAIL: optional(z.string().email()),
  SUPER_ADMIN_PASSWORD: optional(z.string().min(12, 'SUPER_ADMIN_PASSWORD must be at least 12 characters')),
})

const parsed = schema.safeParse(process.env)

if (!parsed.success) {
  // The logger depends on this module, so report with plain stderr and stop:
  // running with a half-valid configuration is worse than not starting.
  process.stderr.write(
    `Invalid environment configuration:\n${JSON.stringify(parsed.error.flatten().fieldErrors, null, 2)}\n`,
  )
  process.exit(1)
}

export const env = parsed.data
export const isProduction = env.NODE_ENV === 'production'
export const isTest = env.NODE_ENV === 'test'
