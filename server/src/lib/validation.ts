import type { z } from 'zod'
import { badRequest } from './errors'

/** Validates untrusted input and returns the typed result, or throws a 400. */
export function parse<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  const result = schema.safeParse(data)
  if (!result.success) {
    throw badRequest('Validation failed', result.error.flatten().fieldErrors)
  }
  return result.data
}
