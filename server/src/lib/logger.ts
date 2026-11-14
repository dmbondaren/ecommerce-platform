import pino from 'pino'
import { env, isProduction, isTest } from '../config/env'

export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,
  redact: ['req.headers.authorization', 'req.headers.cookie', 'res.headers["set-cookie"]'],
  transport: isProduction || isTest ? undefined : { target: 'pino-pretty' },
})
