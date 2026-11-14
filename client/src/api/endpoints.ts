import { api } from './client'
import type {
  Account,
  AdminUser,
  AdminUserDetail,
  AuditEntry,
  Category,
  Conversation,
  Currency,
  Listing,
  ListingInput,
  Message,
  MessagePage,
  Notification,
  Order,
  Page,
  Profile,
  Report,
  Review,
  ReviewReply,
  Role,
  Session,
  UploadedFile,
  VoteSummary,
  VoteType,
} from './types'

const post = <T>(path: string, body?: unknown) => api<T>(path, { method: 'POST', body })

export const authApi = {
  register: (email: string, password: string) => post<Session>('/auth/register', { email, password }),
  login: (email: string, password: string) => post<Session>('/auth/login', { email, password }),
  logout: () => post<void>('/auth/logout'),
  verifyEmail: (token: string) => post<void>('/auth/verify-email', { token }),
  resendVerification: () => post<void>('/auth/resend-verification'),
  requestPasswordReset: (email: string) => post<{ message: string }>('/auth/password-reset/request', { email }),
  resetPassword: (token: string, password: string) =>
    post<void>('/auth/password-reset/confirm', { token, password }),
}

export interface AccountPatch {
  nickname?: string
  phone?: string | null
  preferredCurrency?: Currency
  avatarUrl?: string | null
}

export const accountApi = {
  me: () => api<Account>('/me'),
  update: (patch: AccountPatch) => api<Account>('/me', { method: 'PATCH', body: patch }),
  notifications: () => api<{ items: Notification[]; unreadCount: number }>('/me/notifications'),
  markNotificationsRead: () => post<void>('/me/notifications/read-all'),
}

export interface ListingFilters {
  q?: string
  category?: string
  minPrice?: string
  maxPrice?: string
  sort?: string
  page?: number
}

export const listingApi = {
  categories: () => api<Category[]>('/categories'),
  search: (filters: ListingFilters) => api<Page<Listing>>('/listings', { query: { ...filters } }),
  topSearches: () => api<string[]>('/listings/top-searches'),
  get: (id: string) => api<Listing>(`/listings/${id}`),
  create: (input: ListingInput) => post<Listing>('/listings', input),
  update: (id: string, input: ListingInput) => api<Listing>(`/listings/${id}`, { method: 'PUT', body: input }),
  remove: (id: string) => api<void>(`/listings/${id}`, { method: 'DELETE' }),
  relist: (id: string) => post<Listing>(`/listings/${id}/relist`),
  recordView: (id: string) => post<void>(`/listings/${id}/view`),
  report: (id: string, message: string, attachmentUrls: string[]) =>
    post<Report>(`/listings/${id}/reports`, { message, attachmentUrls }),
  mine: () => api<Listing[]>('/me/listings'),
  history: () => api<Listing[]>('/me/history'),
  favorites: () => api<Listing[]>('/me/favorites'),
  setFavorite: (id: string, on: boolean) => api<void>(`/me/favorites/${id}`, { method: on ? 'PUT' : 'DELETE' }),
  cart: () => api<Listing[]>('/me/cart'),
  setInCart: (id: string, on: boolean) => api<void>(`/me/cart/${id}`, { method: on ? 'PUT' : 'DELETE' }),
}

export interface ReviewInput {
  rating: number
  comment: string
  pros: string
  cons: string
}

export const orderApi = {
  checkout: (listingIds: string[]) => post<Order[]>('/orders', { listingIds }),
  purchases: () => api<Order[]>('/me/purchases'),
  sales: () => api<Order[]>('/me/sales'),
  review: (orderId: string, input: ReviewInput) => post<Review>(`/orders/${orderId}/review`, input),
}

export const userApi = {
  profile: (id: string) => api<Profile>(`/users/${id}`),
  listings: (id: string) => api<Listing[]>(`/users/${id}/listings`),
  reviews: (id: string) => api<Review[]>(`/users/${id}/reviews`),
  vote: (reviewId: string, type: VoteType | null) => post<VoteSummary>(`/reviews/${reviewId}/vote`, { type }),
  reply: (reviewId: string, body: string) => post<ReviewReply>(`/reviews/${reviewId}/replies`, { body }),
}

export interface MessageInput {
  body: string
  attachmentUrl?: string
  attachmentName?: string
}

export const chatApi = {
  list: () => api<Conversation[]>('/conversations'),
  get: (id: string) => api<Conversation>(`/conversations/${id}`),
  openForListing: (listingId: string) => post<Conversation>('/conversations', { listingId }),
  openSupport: (userId?: string) => post<Conversation>('/conversations', { support: true, userId }),
  unreadCount: () => api<{ count: number }>('/conversations/unread-count'),
  messages: (id: string, before?: string) =>
    api<MessagePage>(`/conversations/${id}/messages`, { query: { before } }),
  send: (id: string, input: MessageInput) => post<Message>(`/conversations/${id}/messages`, input),
  markRead: (id: string) => post<void>(`/conversations/${id}/read`),
  hide: (id: string) => api<void>(`/conversations/${id}`, { method: 'DELETE' }),
  editMessage: (messageId: string, body: string) =>
    api<Message>(`/conversations/messages/${messageId}`, { method: 'PATCH', body: { body } }),
  deleteMessage: (messageId: string) => api<void>(`/conversations/messages/${messageId}`, { method: 'DELETE' }),
}

export async function uploadImages(files: File[]): Promise<UploadedFile[]> {
  const form = new FormData()
  for (const file of files) form.append('files', file)
  const result = await api<{ files: UploadedFile[] }>('/uploads', { method: 'POST', body: form })
  return result.files
}

export const adminApi = {
  users: (q: string, page: number) => api<Page<AdminUser>>('/admin/users', { query: { q, page } }),
  user: (id: string) => api<AdminUserDetail>(`/admin/users/${id}`),
  ban: (id: string, reason: string, days: number | null) =>
    post<AdminUser>(`/admin/users/${id}/ban`, { reason, days }),
  unban: (id: string) => api<AdminUser>(`/admin/users/${id}/ban`, { method: 'DELETE' }),
  setRole: (id: string, role: Extract<Role, 'USER' | 'ADMIN'>) =>
    api<AdminUser>(`/admin/users/${id}/role`, { method: 'PUT', body: { role } }),
  deleteUser: (id: string, reason: string) => post<void>(`/admin/users/${id}/delete`, { reason }),
  moderationQueue: () => api<Listing[]>('/admin/listings'),
  deactivateListing: (id: string, reason: string) =>
    post<Listing>(`/admin/listings/${id}/deactivate`, { reason }),
  activateListing: (id: string) => post<Listing>(`/admin/listings/${id}/activate`),
  removeListing: (id: string, reason: string) => post<void>(`/admin/listings/${id}/remove`, { reason }),
  reports: (status: 'OPEN' | 'RESOLVED') => api<Report[]>('/admin/reports', { query: { status } }),
  resolveReport: (id: string) => post<Report>(`/admin/reports/${id}/resolve`),
  auditLog: (page: number) => api<Page<AuditEntry>>('/admin/audit-log', { query: { page } }),
}
