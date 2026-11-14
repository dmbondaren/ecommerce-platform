import { Prisma, type Conversation } from '@prisma/client'
import { z } from 'zod'
import { badRequest, notFound } from '../../lib/errors'
import { prisma } from '../../lib/prisma'
import { isAdminRole, type AuthContext } from '../../middleware/auth'
import { hub, type ServerEvent } from '../../realtime/hub'
import { uploadUrlSchema } from '../listings/listing.schemas'
import { publicUserSelect, toPublicUser } from '../users/user.dto'

const PAGE_SIZE = 50
const ADMIN_ROOM_KEY = 'admin-room'

export const openConversationSchema = z.union([
  z.object({ listingId: z.string().min(1).max(40) }),
  // `userId` lets staff open the support chat of a particular user.
  z.object({ support: z.literal(true), userId: z.string().min(1).max(40).optional() }),
])
export type OpenConversationInput = z.infer<typeof openConversationSchema>

export const messageInputSchema = z
  .object({
    body: z.string().trim().max(4000).default(''),
    attachmentUrl: uploadUrlSchema.optional(),
    attachmentName: z.string().trim().max(255).optional(),
  })
  .refine((value) => value.body !== '' || value.attachmentUrl !== undefined, {
    message: 'A message needs text or an attachment',
    path: ['body'],
  })
export type MessageInput = z.infer<typeof messageInputSchema>

export const editMessageSchema = z.object({ body: z.string().trim().min(1).max(4000) })
export const historyQuerySchema = z.object({ before: z.coerce.date().optional() })

const conversationInclude = {
  listing: {
    select: { id: true, title: true, status: true, images: { orderBy: { position: 'asc' }, take: 1 } },
  },
  buyer: { select: publicUserSelect },
  seller: { select: publicUserSelect },
  messages: { orderBy: { createdAt: 'desc' }, take: 1 },
} satisfies Prisma.ConversationInclude

type ConversationRow = Prisma.ConversationGetPayload<{ include: typeof conversationInclude }>

const messageInclude = { sender: { select: publicUserSelect } } satisfies Prisma.MessageInclude
type MessageRow = Prisma.MessageGetPayload<{ include: typeof messageInclude }>

/** A deleted message keeps its place in the history but loses its content. */
const toMessage = (message: MessageRow) => {
  const deleted = message.deletedAt !== null
  return {
    id: message.id,
    conversationId: message.conversationId,
    sender: message.sender ? toPublicUser(message.sender) : null,
    body: deleted ? '' : message.body,
    attachmentUrl: deleted ? null : message.attachmentUrl,
    attachmentName: deleted ? null : message.attachmentName,
    createdAt: message.createdAt,
    editedAt: message.editedAt,
    deleted,
  }
}

const toConversation = (row: ConversationRow, unreadCount: number) => {
  const last = row.messages[0]
  return {
    id: row.id,
    type: row.type,
    listing: row.listing
      ? {
          id: row.listing.id,
          title: row.listing.title,
          status: row.listing.status,
          imageUrl: row.listing.images[0]?.url ?? null,
        }
      : null,
    buyer: row.buyer ? toPublicUser(row.buyer) : null,
    seller: row.seller ? toPublicUser(row.seller) : null,
    lastMessage: last
      ? {
          body: last.deletedAt ? '' : last.body,
          hasAttachment: !last.deletedAt && last.attachmentUrl !== null,
          senderId: last.senderId,
          createdAt: last.createdAt,
        }
      : null,
    lastMessageAt: row.lastMessageAt,
    unreadCount,
  }
}

type Participants = Pick<Conversation, 'type' | 'buyerId' | 'sellerId'>

function canAccess(conversation: Participants, auth: AuthContext): boolean {
  switch (conversation.type) {
    case 'LISTING':
      // Staff cannot read private chats between a buyer and a seller.
      return conversation.buyerId === auth.userId || conversation.sellerId === auth.userId
    case 'SUPPORT':
      return conversation.buyerId === auth.userId || isAdminRole(auth.role)
    case 'ADMIN_ROOM':
      return isAdminRole(auth.role)
  }
}

async function findAccessible(id: string, auth: AuthContext) {
  const conversation = await prisma.conversation.findUnique({ where: { id } })
  if (!conversation || !canAccess(conversation, auth)) throw notFound('Conversation')
  return conversation
}

const emit = (conversation: Participants, event: ServerEvent) =>
  hub.toUsers([conversation.buyerId, conversation.sellerId], event, {
    includeStaff: conversation.type !== 'LISTING',
  })

/** Unread messages per conversation for one user, in a single query. */
async function unreadCounts(userId: string, conversationIds: string[]): Promise<Map<string, number>> {
  if (conversationIds.length === 0) return new Map()
  const rows = await prisma.$queryRaw<{ id: string; unread: number }[]>`
    SELECT m."conversationId" AS id, COUNT(*)::int AS unread
    FROM "Message" m
    LEFT JOIN "ConversationRead" r
      ON r."conversationId" = m."conversationId" AND r."userId" = ${userId}
    WHERE m."conversationId" IN (${Prisma.join(conversationIds)})
      AND m."deletedAt" IS NULL
      AND (m."senderId" IS NULL OR m."senderId" <> ${userId})
      AND (r."lastReadAt" IS NULL OR m."createdAt" > r."lastReadAt")
    GROUP BY m."conversationId"`
  return new Map(rows.map((row) => [row.id, row.unread]))
}

export const conversationService = {
  /** Returns the existing conversation or creates it; the unique `key` makes that race-free. */
  async open(auth: AuthContext, input: OpenConversationInput) {
    let conversation: Conversation
    if ('listingId' in input) {
      const listing = await prisma.listing.findUnique({
        where: { id: input.listingId },
        select: { id: true, ownerId: true, status: true },
      })
      if (!listing || (listing.status !== 'ACTIVE' && listing.status !== 'SOLD')) throw notFound('Listing')
      if (listing.ownerId === auth.userId) throw badRequest('This is your own listing')
      conversation = await prisma.conversation.upsert({
        where: { key: `listing:${listing.id}:${auth.userId}` },
        create: {
          key: `listing:${listing.id}:${auth.userId}`,
          type: 'LISTING',
          listingId: listing.id,
          buyerId: auth.userId,
          sellerId: listing.ownerId,
        },
        update: { hiddenForBuyer: false },
      })
    } else if (isAdminRole(auth.role) && !input.userId) {
      conversation = await prisma.conversation.upsert({
        where: { key: ADMIN_ROOM_KEY },
        create: { key: ADMIN_ROOM_KEY, type: 'ADMIN_ROOM' },
        update: {},
      })
    } else {
      const userId = isAdminRole(auth.role) && input.userId ? input.userId : auth.userId
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
      if (!user) throw notFound('User')
      conversation = await prisma.conversation.upsert({
        where: { key: `support:${userId}` },
        create: { key: `support:${userId}`, type: 'SUPPORT', buyerId: userId },
        update: {},
      })
    }
    return this.get(auth, conversation.id)
  },

  async get(auth: AuthContext, id: string) {
    const row = await prisma.conversation.findUnique({ where: { id }, include: conversationInclude })
    if (!row || !canAccess(row, auth)) throw notFound('Conversation')
    const unread = await unreadCounts(auth.userId, [id])
    return toConversation(row, unread.get(id) ?? 0)
  },

  async list(auth: AuthContext) {
    const where: Prisma.ConversationWhereInput[] = [
      { buyerId: auth.userId, hiddenForBuyer: false },
      { sellerId: auth.userId, hiddenForSeller: false },
    ]
    if (isAdminRole(auth.role)) where.push({ type: 'SUPPORT' }, { type: 'ADMIN_ROOM' })

    const rows = await prisma.conversation.findMany({
      where: { OR: where },
      include: conversationInclude,
      orderBy: { lastMessageAt: 'desc' },
      take: 100,
    })
    const unread = await unreadCounts(
      auth.userId,
      rows.map((row) => row.id),
    )
    return rows.map((row) => toConversation(row, unread.get(row.id) ?? 0))
  },

  async unreadTotal(auth: AuthContext) {
    const conversations = await this.list(auth)
    return conversations.reduce((sum, conversation) => sum + conversation.unreadCount, 0)
  },

  /** One page of history, oldest first. Pass the first message's time as `before` for the previous page. */
  async messages(auth: AuthContext, id: string, before?: Date) {
    await findAccessible(id, auth)
    const rows = await prisma.message.findMany({
      where: { conversationId: id, createdAt: before ? { lt: before } : undefined },
      include: messageInclude,
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
    })
    return { items: rows.reverse().map(toMessage), hasMore: rows.length === PAGE_SIZE }
  },

  async send(auth: AuthContext, id: string, input: MessageInput) {
    const conversation = await findAccessible(id, auth)
    const now = new Date()
    const [message] = await prisma.$transaction([
      prisma.message.create({
        data: {
          conversationId: id,
          senderId: auth.userId,
          body: input.body,
          attachmentUrl: input.attachmentUrl,
          attachmentName: input.attachmentName,
          createdAt: now,
        },
        include: messageInclude,
      }),
      // A new message brings the chat back for whoever removed it from their list.
      prisma.conversation.update({
        where: { id },
        data: { lastMessageAt: now, hiddenForBuyer: false, hiddenForSeller: false },
      }),
      prisma.conversationRead.upsert({
        where: { conversationId_userId: { conversationId: id, userId: auth.userId } },
        create: { conversationId: id, userId: auth.userId, lastReadAt: now },
        update: { lastReadAt: now },
      }),
    ])
    const dto = toMessage(message)
    emit(conversation, { type: 'message.created', conversationId: id, message: dto })
    return dto
  },

  async markRead(auth: AuthContext, id: string) {
    const conversation = await findAccessible(id, auth)
    const lastReadAt = new Date()
    await prisma.conversationRead.upsert({
      where: { conversationId_userId: { conversationId: id, userId: auth.userId } },
      create: { conversationId: id, userId: auth.userId, lastReadAt },
      update: { lastReadAt },
    })
    emit(conversation, { type: 'conversation.read', conversationId: id, userId: auth.userId, lastReadAt })
  },

  async editMessage(auth: AuthContext, messageId: string, body: string) {
    const message = await this.findOwnMessage(auth, messageId)
    const updated = await prisma.message.update({
      where: { id: messageId },
      data: { body, editedAt: new Date() },
      include: messageInclude,
    })
    const dto = toMessage(updated)
    emit(message.conversation, { type: 'message.updated', conversationId: message.conversationId, message: dto })
    return dto
  },

  async deleteMessage(auth: AuthContext, messageId: string) {
    const message = await this.findOwnMessage(auth, messageId)
    const updated = await prisma.message.update({
      where: { id: messageId },
      // The text is erased for real, not only hidden.
      data: { body: '', attachmentUrl: null, attachmentName: null, deletedAt: new Date() },
      include: messageInclude,
    })
    emit(message.conversation, {
      type: 'message.updated',
      conversationId: message.conversationId,
      message: toMessage(updated),
    })
  },

  async findOwnMessage(auth: AuthContext, messageId: string) {
    const message = await prisma.message.findUnique({ where: { id: messageId }, include: { conversation: true } })
    if (!message || message.senderId !== auth.userId || message.deletedAt) throw notFound('Message')
    return message
  },

  /** Removes a listing chat from the caller's list only; the other side keeps it. */
  async hide(auth: AuthContext, id: string) {
    const conversation = await findAccessible(id, auth)
    if (conversation.type !== 'LISTING') throw badRequest('Support conversations cannot be removed')
    await prisma.conversation.update({
      where: { id },
      data: conversation.buyerId === auth.userId ? { hiddenForBuyer: true } : { hiddenForSeller: true },
    })
  },
}
