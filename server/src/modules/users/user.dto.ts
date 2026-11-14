import type { Prisma, User } from '@prisma/client'
import { isAdminRole } from '../../middleware/auth'

/** Fields of a user that anyone may see. E-mail and phone are deliberately absent. */
export const publicUserSelect = {
  id: true,
  nickname: true,
  avatarUrl: true,
  role: true,
  emailVerifiedAt: true,
  createdAt: true,
} satisfies Prisma.UserSelect

export type PublicUserRow = Prisma.UserGetPayload<{ select: typeof publicUserSelect }>

export const toPublicUser = (user: PublicUserRow) => ({
  id: user.id,
  nickname: user.nickname,
  avatarUrl: user.avatarUrl,
  isStaff: isAdminRole(user.role),
  isVerified: user.emailVerifiedAt !== null || isAdminRole(user.role),
  memberSince: user.createdAt,
})

export type PublicUser = ReturnType<typeof toPublicUser>

/** The signed-in user's own account, including private fields. */
export const toAccount = (user: User) => ({
  ...toPublicUser(user),
  email: user.email,
  role: user.role,
  phone: user.phone,
  preferredCurrency: user.preferredCurrency,
  // Private: never part of the public profile.
  homeAddress: user.homeAddress,
  homeCoordinates:
    user.homeLatitude !== null && user.homeLongitude !== null
      ? { lat: user.homeLatitude, lng: user.homeLongitude }
      : null,
})

/** What administrators see: the account plus moderation state. */
export const toAdminUser = (user: User) => ({
  ...toAccount(user),
  bannedUntil: user.bannedUntil,
  bannedPermanently: user.bannedPermanently,
  banReason: user.banReason,
})
