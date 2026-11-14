import type { AuditAction } from '@prisma/client'
import { prisma } from '../../lib/prisma'

interface AuditEntry {
  actorId: string
  action: AuditAction
  targetType: 'listing' | 'user' | 'report'
  targetId: string
  reason?: string | null
}

/** Every moderation action is recorded: who did what to whom, and why. */
export const recordAudit = (entry: AuditEntry) => prisma.auditLog.create({ data: entry })
