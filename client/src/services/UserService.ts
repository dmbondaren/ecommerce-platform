import $api from '../http'
import { AxiosResponse } from 'axios'
import { IListing } from '../models/IListing'
import { SellerReview } from './ListingService'

export interface IUserProfile { id: string; email: string; nickname?: string; isActivated: boolean; isAdmin?: boolean; isSuperAdmin?: boolean; phone?: string | null; createdAt?: string | null; bannedPermanent?: boolean; bannedUntil?: string | null; banReason?: string | null; preferredCurrency?: string; avatarUrl?: string }
export interface AdminUserDetails {
  user: IUserProfile;
  listings: Array<{ id: string; title: string; description: string; price: number; currency?: string; imageUrl: string; createdAt: string; status?: string; moderationReason?: string | null }>;
  reviews: Array<{ id: string; comment: string; pros?: string | null; cons?: string | null; rating: number; createdAt: string; listingId?: string | null; listingTitle?: string | null; sellerEmail?: string | null }>;
  chats: Array<{ roomId: string; topic: string; chatType: string; listingId?: string | null; listingTitle?: string | null; buyerEmail?: string | null; sellerEmail?: string | null; messageCount: number; lastMessageAt?: string | null }>;
  messages: Array<{ roomId: string; senderUserId?: string | null; nickname: string; text: string; attachmentUrl?: string; attachmentName?: string; selectionJson?: string; createdAt: string }>;
}
export interface PublicUserProfile {
  user: IUserProfile;
  ratingAverage: number;
  reviewCount: number;
  listings: IListing[];
  reviews: SellerReview[];
  salesTimeline?: Array<{ listingId?: string | null; title: string; description?: string; soldAt: string; price: number; currency?: string; category?: string | null; imageUrl?: string }>;
  purchasesTimeline?: Array<{ listingId?: string | null; title: string; description?: string; purchasedAt: string; price: number; currency?: string; category?: string | null; imageUrl?: string }>;
  categoryStats?: { listed?: Record<string, number>; sold: Record<string, number>; bought: Record<string, number> };
}

export default class UserService {
  static fetchUsers(){ return $api.get('/users') }
  static me(): Promise<AxiosResponse<IUserProfile>> { return $api.get('/me') }
  static updateNickname(nickname: string): Promise<AxiosResponse<IUserProfile>> { return $api.post('/me/nickname', { nickname }) }
  static updatePhone(phone: string): Promise<AxiosResponse<IUserProfile>> { return $api.post('/me/phone', { phone }) }
  static updateCurrency(currency: string): Promise<AxiosResponse<IUserProfile>> { return $api.post('/me/currency', { currency }) }
  static updateAvatar(file: File): Promise<AxiosResponse<IUserProfile>> { const fd = new FormData(); fd.append('avatar', file); return $api.post('/me/avatar', fd) }
  static fetchAdminUserDetails(id: string): Promise<AxiosResponse<AdminUserDetails>> { return $api.get(`/admin/users/${id}`) }
  static fetchPublicProfile(id: string): Promise<AxiosResponse<PublicUserProfile>> { return $api.get(`/users/${id}/profile`) }
  static banUser(id: string, payload: { minutes?: number; permanent?: boolean; reason?: string }): Promise<AxiosResponse<IUserProfile>> { return $api.post(`/admin/users/${id}/ban`, payload) }
  static unbanUser(id: string): Promise<AxiosResponse<IUserProfile>> { return $api.delete(`/admin/users/${id}/ban`) }
  static deleteUser(id: string): Promise<AxiosResponse<{ ok: boolean }>> { return $api.delete(`/admin/users/${id}`) }
  static setAdmin(userId: string, isAdmin: boolean): Promise<AxiosResponse<IUserProfile>> { return $api.post('/admin/set-admin', { userId, isAdmin }) }
}
