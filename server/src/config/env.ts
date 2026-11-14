import 'dotenv/config'
import { z } from 'zod'

/** Docker Compose passes unset variables as empty strings; treat those as absent. */
const optional = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess((value) => (value === '' ? undefined : value), schema.optional())

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(5000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  DATABASE_URL: z.string().min(1),
  CLIENT_URL: z.string().url().default('http://localhost:5173'),
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 characters'),
  ACCESS_TOKEN_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().positive().default(30),
  UPLOAD_DIR: z.string().default('uploads'),
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
