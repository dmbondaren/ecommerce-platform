import { z } from 'zod'
import { notFound } from './errors'

/** A route parameter as a string. An absent one can only mean a wrong URL, hence 404. */
export function param(req: { params: Record<string, unknown> }, name: string): string {
  const value = req.params[name]
  if (typeof value !== 'string' || value === '') throw notFound()
  return value
}

export const pageSchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
})

export const paginated = <T>(items: T[], total: number, page: number, pageSize: number) => ({
  items,
  page,
  pageSize,
  total,
  totalPages: Math.max(1, Math.ceil(total / pageSize)),
})
