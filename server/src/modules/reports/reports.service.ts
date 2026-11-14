import type { Prisma, ReportStatus } from '@prisma/client'
import { z } from 'zod'
import { conflict, notFound } from '../../lib/errors'
import { prisma } from '../../lib/prisma'
import { recordAudit } from '../admin/audit'
import { uploadUrlSchema } from '../listings/listing.schemas'
import { notificationService } from '../notifications/notifications.service'
import { publicUserSelect, toPublicUser } from '../users/user.dto'

export const reportInputSchema = z.object({
  message: z.string().trim().min(10, 'Describe the problem in at least 10 characters').max(1000),
  attachmentUrls: z.array(uploadUrlSchema).max(5).default([]),
})
export type ReportInput = z.infer<typeof reportInputSchema>

const reportInclude = {
  listing: { select: { id: true, title: true, status: true } },
  reporter: { select: publicUserSelect },
} satisfies Prisma.ReportInclude

type ReportRow = Prisma.ReportGetPayload<{ include: typeof reportInclude }>

const toReport = (report: ReportRow) => ({
  id: report.id,
  message: report.message,
  attachmentUrls: report.attachmentUrls,
  status: report.status,
  listing: report.listing,
  reporter: report.reporter ? toPublicUser(report.reporter) : null,
  createdAt: report.createdAt,
  resolvedAt: report.resolvedAt,
})

export const reportService = {
  async create(reporterId: string, listingId: string, input: ReportInput) {
    const listing = await prisma.listing.findUnique({ where: { id: listingId }, select: { ownerId: true } })
    if (!listing) throw notFound('Listing')
    if (listing.ownerId === reporterId) throw conflict('You cannot report your own listing')
    const open = await prisma.report.findFirst({
      where: { reporterId, listingId, status: 'OPEN' },
      select: { id: true },
    })
    if (open) throw conflict('You have already reported this listing; our team is looking into it')

    const report = await prisma.report.create({
      data: { reporterId, listingId, message: input.message, attachmentUrls: input.attachmentUrls },
      include: reportInclude,
    })
    return toReport(report)
  },

  async mine(reporterId: string) {
    const rows = await prisma.report.findMany({
      where: { reporterId },
      include: reportInclude,
      orderBy: { createdAt: 'desc' },
      take: 100,
    })
    return rows.map(toReport)
  },

  async list(status: ReportStatus) {
    const rows = await prisma.report.findMany({
      where: { status },
      include: reportInclude,
      orderBy: { createdAt: 'desc' },
      take: 200,
    })
    return rows.map(toReport)
  },

  async resolve(adminId: string, id: string) {
    const resolved = await prisma.report.updateMany({
      where: { id, status: 'OPEN' },
      data: { status: 'RESOLVED', resolvedById: adminId, resolvedAt: new Date() },
    })
    if (resolved.count === 0) throw notFound('Open report')
    const report = await prisma.report.findUniqueOrThrow({ where: { id }, include: reportInclude })
    await recordAudit({ actorId: adminId, action: 'REPORT_RESOLVED', targetType: 'report', targetId: id })
    if (report.reporterId) {
      notificationService.notifyInBackground(
        report.reporterId,
        `Your report about "${report.listing.title}" has been reviewed. Thank you.`,
      )
    }
    return toReport(report)
  },
}
