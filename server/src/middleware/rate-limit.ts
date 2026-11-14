import rateLimit from 'express-rate-limit'
import { isTest } from '../config/env'

const tooMany = {
  error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests, please try again later' },
}

const limiter = (limit: number, windowMs: number) =>
  rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    message: tooMany,
    skip: () => isTest,
  })

/** Baseline for the whole API. */
export const apiLimiter = limiter(600, 60_000)
/** Credential endpoints: slows down password guessing and e-mail flooding. */
export const authLimiter = limiter(20, 15 * 60_000)
/** Chat messages and reports. */
export const writeLimiter = limiter(40, 60_000)
