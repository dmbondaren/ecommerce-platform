import { AxiosResponse } from 'axios'
import $api from '../http'
import { IListing } from '../models/IListing'
export interface SearchStat { query_text: string; search_count: number }
export interface ReviewReply { id: string; reviewId: string; userId: string; email: string; nickname: string; isAdmin: boolean; isActivated?: boolean; text: string; createdAt: string }
export interface SellerReview { id: string; seller_id?: string; buyer_id?: string; listing_id?: string | null; listing_title?: string | null; listing_image_url?: string; listing_price?: number | null; rating: number; comment: string; pros?: string | null; cons?: string | null; buyer_email?: string; buyer_nickname?: string; buyer_is_admin?: boolean; buyer_is_activated?: boolean; seller_email?: string; seller_nickname?: string; seller_is_admin?: boolean; seller_is_activated?: boolean; created_at: string; likes: number; dislikes: number; my_vote?: 'like'|'dislike'|null; replies?: ReviewReply[] }
export interface ChatSummary { listingCount: number; supportCount: number; total: number; isAdmin: boolean }
export interface ComplaintItem { id: string; userId?: string | null; listingId: string; listingTitle: string; listingImageUrl?: string; userEmail: string; text: string; roomId: string; attachmentUrl?: string; selectionJson?: string; status: string; createdAt: string }
export interface MyReviewsResponse { received: SellerReview[]; given: SellerReview[] }
export default class ListingService {
  static fetchCategories(): Promise<AxiosResponse<string[]>> { return $api.get('/categories') }
  static fetchListings(search = '', filters?: { minPrice?: string; maxPrice?: string; category?: string; sortBy?: string }): Promise<AxiosResponse<IListing[]>> { return $api.get('/listings', { params: { search, minPrice: filters?.minPrice || '', maxPrice: filters?.maxPrice || '', category: filters?.category || '', sortBy: filters?.sortBy || 'newest' } }) }
  static fetchListingById(id: string): Promise<AxiosResponse<IListing>> { return $api.get(`/listings/${id}`) }
  static fetchTopSearches(limit = 5): Promise<AxiosResponse<SearchStat[]>> { return $api.get('/search/top', { params: { limit } }) }
  static fetchMyListings(): Promise<AxiosResponse<IListing[]>> { return $api.get('/my/listings') }
  static createListing(payload: { title: string; description: string; price: string; currency?: string; location: string; phone?: string; category: string; images: File[] }): Promise<AxiosResponse<IListing>> { const fd = new FormData(); fd.append('title', payload.title); fd.append('description', payload.description); fd.append('price', payload.price); fd.append('currency', payload.currency || 'UAH'); fd.append('location', payload.location); fd.append('phone', payload.phone || ''); fd.append('category', payload.category); payload.images.forEach((img)=>fd.append('images', img)); return $api.post('/my/listings', fd) }
  static updateListing(id: string, payload: { title: string; description: string; price: string; currency?: string; location: string; phone?: string; category: string; images?: File[]; imageUrl?: string; existingImageUrls?: string[] }): Promise<AxiosResponse<IListing>> { const fd = new FormData(); fd.append('title', payload.title); fd.append('description', payload.description); fd.append('price', payload.price); fd.append('currency', payload.currency || 'UAH'); fd.append('location', payload.location); fd.append('phone', payload.phone || ''); fd.append('category', payload.category); fd.append('existingImageUrls', JSON.stringify(payload.existingImageUrls || [])); payload.images?.forEach((img)=>fd.append('images', img)); if (payload.imageUrl) fd.append('imageUrl', payload.imageUrl); return $api.put(`/my/listings/${id}`, fd) }
  static deleteListing(id: string): Promise<AxiosResponse<{ ok: boolean }>> { return $api.delete(`/my/listings/${id}`) }
  static addFavorite(id: string): Promise<AxiosResponse<{ ok: boolean }>> { return $api.post(`/my/favorites/${id}`) }
  static addToCart(id: string): Promise<AxiosResponse<{ ok: boolean }>> { return $api.post(`/my/cart/${id}`) }
  static startChat(id: string, type: 'buy'|'sell'): Promise<AxiosResponse<{ roomId: string; listingTitle: string; chatType: string }>> { return $api.post(`/my/chat/${id}`, null, { params: { type } }) }
  static toggleFavorite(id: string): Promise<AxiosResponse<{ ok: boolean }>> { return $api.post(`/my/favorites/${id}/toggle`) }
  static toggleCart(id: string): Promise<AxiosResponse<{ ok: boolean }>> { return $api.post(`/my/cart/${id}/toggle`) }
  static addView(id: string): Promise<AxiosResponse<{ ok: boolean }>> { return $api.post(`/my/views/${id}`) }
  static fetchHistory(): Promise<AxiosResponse<IListing[]>> { return $api.get('/my/history') }
  static fetchFavorites(): Promise<AxiosResponse<IListing[]>> { return $api.get('/my/favorites') }
  static fetchCart(): Promise<AxiosResponse<IListing[]>> { return $api.get('/my/cart') }
  static fetchChatThreads(type: 'buy'|'sell'): Promise<AxiosResponse<Array<{ roomId: string; type: 'buy'|'sell'; title: string; imageUrl: string; userId?: string | null; userTitle?: string; messageCount?: number; unreadCount?: number }>>> { return $api.get('/my/chat-threads', { params: { type } }) }
  static fetchChatMessages(roomId: string): Promise<AxiosResponse<Array<{ id: string; roomId: string; nickname: string; senderUserId?: string | null; senderIsAdmin?: boolean; senderIsActivated?: boolean; text: string; attachmentUrl?: string; attachmentName?: string; selectionJson?: string; createdAt: string; editedAt?: string | null; deletedAt?: string | null; readAt?: string | null }>>> { return $api.get('/my/chat-messages', { params: { roomId } }) }
  static markChatRead(roomId: string): Promise<AxiosResponse<{ ok: boolean; count: number }>> { return $api.post('/my/chat-read', { roomId }) }
  static fetchChatSummary(): Promise<AxiosResponse<ChatSummary>> { return $api.get('/my/chat-summary') }
  static uploadChatAttachment(file: File): Promise<AxiosResponse<{ url: string; name: string }>> { const fd = new FormData(); fd.append('image', file); return $api.post('/my/chat-attachment', fd) }
  static startSupportChat(targetUserId?: string): Promise<AxiosResponse<{ roomId: string; chatType: string }>> { return $api.post('/my/support-chat', { targetUserId }) }
  static fetchSupportThreads(): Promise<AxiosResponse<Array<{ roomId: string; userId?: string | null; type: 'support'; title: string; imageUrl: string; messageCount?: number; unreadCount?: number }>>> { return $api.get('/my/support-threads') }
  static editChatMessage(id: string, text: string): Promise<AxiosResponse<{ ok: boolean }>> { return $api.put(`/my/chat-messages/${id}`, { text }) }
  static deleteChatMessage(id: string): Promise<AxiosResponse<{ ok: boolean }>> { return $api.delete(`/my/chat-messages/${id}`) }
  static hideChatThread(roomId: string): Promise<AxiosResponse<{ ok: boolean }>> { return $api.delete('/my/chat-thread', { data: { roomId } }) }
  static fetchSellerReviews(sellerId: string): Promise<AxiosResponse<SellerReview[]>> { return localStorage.getItem('token') ? $api.get(`/my/seller-reviews/${sellerId}`) : $api.get(`/seller-reviews/${sellerId}`) }
  static addReview(payload: { sellerId: string; listingId: string; purchaseId?: string; rating: number; comment: string; pros: string; cons: string }): Promise<AxiosResponse<{ ok: boolean }>> { return $api.post('/my/reviews', payload) }
  static voteReview(reviewId: string, voteType: 'like'|'dislike'|null): Promise<AxiosResponse<{ reviewId: string; likes: number; dislikes: number; myVote: 'like'|'dislike'|null }>> { return $api.post(`/my/reviews/${reviewId}/vote`, { voteType }) }
  static addReviewReply(reviewId: string, text: string): Promise<AxiosResponse<{ ok: boolean; id: string }>> { return $api.post(`/my/reviews/${reviewId}/replies`, { text }) }
  static adminDeleteListing(id: string, titleConfirm: string, reason: string): Promise<AxiosResponse<{ ok: boolean }>> { return $api.delete(`/admin/listings/${id}`, { data: { titleConfirm, reason } }) }
  static adminDeactivateListing(id: string, titleConfirm: string, reason: string): Promise<AxiosResponse<IListing>> { return $api.post(`/admin/listings/${id}/deactivate`, { titleConfirm, reason }) }
  static adminActivateListing(id: string, titleConfirm: string, reason = ''): Promise<AxiosResponse<IListing>> { return $api.post(`/admin/listings/${id}/activate`, { titleConfirm, reason }) }
  static fetchModerationListings(): Promise<AxiosResponse<IListing[]>> { return $api.get('/admin/listings/moderation') }
  static sendComplaint(listingId: string, message: string, images?: File[] | File | null, selectionJson = ''): Promise<AxiosResponse<{ ok: boolean; roomId?: string }>> { const fd = new FormData(); fd.append('message', message); fd.append('selectionJson', selectionJson); const files = Array.isArray(images) ? images : (images ? [images] : []); files.slice(0,10).forEach(image=>fd.append('images', image)); return $api.post(`/complaints/${listingId}`, fd) }
  static fetchComplaints(): Promise<AxiosResponse<ComplaintItem[]>> { return $api.get('/my/complaints') }
  static resolveComplaint(id: string): Promise<AxiosResponse<{ ok: boolean }>> { return $api.post(`/my/complaints/${id}/resolve`) }
  static buy(listingIds: string[]): Promise<AxiosResponse<{ ok: boolean; count: number }>> { return $api.post('/my/purchase', { listingIds }) }
  static relist(id: string): Promise<AxiosResponse<IListing>> { return $api.post(`/my/listings/${id}/relist`) }
  static fetchPendingReviews(): Promise<AxiosResponse<IListing[]>> { return $api.get('/my/pending-reviews') }
  static fetchMyReviews(): Promise<AxiosResponse<MyReviewsResponse>> { return $api.get('/my/reviews') }
  static fetchPurchases(): Promise<AxiosResponse<IListing[]>> { return $api.get('/my/purchases') }
  static fetchSales(): Promise<AxiosResponse<IListing[]>> { return $api.get('/my/sales') }
}
