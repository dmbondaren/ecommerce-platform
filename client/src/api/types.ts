/** Shapes of the JSON the API returns. Dates arrive as ISO strings. */

export type Role = 'USER' | 'ADMIN' | 'SUPER_ADMIN'
export type Currency = 'CHF' | 'EUR' | 'USD' | 'UAH'
export type ListingStatus = 'ACTIVE' | 'PENDING_REVIEW' | 'DEACTIVATED' | 'RESERVED' | 'SOLD' | 'ARCHIVED'
export type OrderStatus = 'PENDING_PAYMENT' | 'PAID' | 'CANCELLED' | 'EXPIRED'

export interface Coordinates {
  lat: number
  lng: number
}
export type VoteType = 'LIKE' | 'DISLIKE'

export interface PublicUser {
  id: string
  nickname: string
  avatarUrl: string | null
  isStaff: boolean
  isVerified: boolean
  memberSince: string
}

export interface Account extends PublicUser {
  email: string
  role: Role
  phone: string | null
  preferredCurrency: Currency
  /** Where buyers transfer money; the default for new listings. */
  paymentAccount: string | null
  /** Private; only used to find listings nearby. */
  homeAddress: string | null
  homeCoordinates: Coordinates | null
}

export interface AdminUser extends Account {
  bannedUntil: string | null
  bannedPermanently: boolean
  banReason: string | null
}

export interface AdminUserDetail extends AdminUser {
  stats: { listings: number; purchases: number; sales: number; reportsFiled: number; reportsReceived: number }
}

export interface Profile extends PublicUser {
  /** Only sent to signed-in visitors. */
  phone: string | null
  /** Where most of the user's listings are. */
  area: string | null
  stats: { rating: number | null; reviewCount: number; activeListings: number; sales: number }
}

export interface Session {
  accessToken: string
  user: Account
}

export interface Category {
  id: number
  slug: string
  name: string
}

export interface Listing {
  id: string
  title: string
  description: string
  price: number
  currency: Currency
  location: string | null
  coordinates: Coordinates | null
  phone: string | null
  category: Category
  status: ListingStatus
  moderationReason: string | null
  viewCount: number
  imageUrls: string[]
  owner: PublicUser
  createdAt: string
  updatedAt: string
}

export interface ListingInput {
  title: string
  description: string
  price: number
  currency: Currency
  categoryId: number
  location: string
  phone: string
  imageUrls: string[]
  coordinates: Coordinates | null
  paymentAccount: string
}

export interface Page<T> {
  items: T[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}

export interface Order {
  id: string
  listingId: string | null
  title: string
  description: string
  category: string
  imageUrls: string[]
  price: number
  currency: Currency
  status: OrderStatus
  /** End of the payment window of a reservation. */
  expiresAt: string | null
  paidAt: string | null
  buyer: PublicUser | null
  seller: PublicUser | null
  review: { id: string; rating: number } | null
  createdAt: string
}

export interface PaymentDetails {
  recipient: string
  iban: string
  reference: string | null
  amount: number
  currency: Currency
}

/** An order as its buyer sees it: unpaid ones carry the transfer details. */
export interface Purchase extends Order {
  payment: PaymentDetails | null
  /** The buyer chose not to review this purchase. */
  reviewSkipped: boolean
}

export interface SalesSummary {
  totals: { currency: string; revenue: number; count: number }[]
  monthly: { month: string; revenue: number; count: number }[]
  monthlyCurrency: string | null
  averageOrderValue: number | null
}

export interface ReviewReply {
  id: string
  body: string
  author: PublicUser
  createdAt: string
}

export interface VoteSummary {
  likes: number
  dislikes: number
  myVote: VoteType | null
}

export interface Review extends VoteSummary {
  id: string
  rating: number
  comment: string | null
  pros: string | null
  cons: string | null
  author: PublicUser
  item: { title: string; imageUrl: string | null; price: number; currency: Currency }
  replies: ReviewReply[]
  createdAt: string
}

export interface Conversation {
  id: string
  type: 'LISTING' | 'SUPPORT' | 'ADMIN_ROOM'
  listing: { id: string; title: string; status: ListingStatus; imageUrl: string | null } | null
  buyer: PublicUser | null
  seller: PublicUser | null
  lastMessage: { body: string; hasAttachment: boolean; senderId: string | null; createdAt: string } | null
  lastMessageAt: string
  /** When someone else last had the conversation open; the viewer's messages up to then are seen. */
  seenByOthersAt: string | null
  unreadCount: number
}

export interface Message {
  id: string
  conversationId: string
  sender: PublicUser | null
  body: string
  attachmentUrl: string | null
  attachmentName: string | null
  createdAt: string
  editedAt: string | null
  deleted: boolean
}

export interface MessagePage {
  items: Message[]
  hasMore: boolean
}

export interface Report {
  id: string
  message: string
  attachmentUrls: string[]
  status: 'OPEN' | 'RESOLVED'
  listing: { id: string; title: string; status: ListingStatus }
  reporter: PublicUser | null
  createdAt: string
  resolvedAt: string | null
}

export interface Notification {
  id: string
  message: string
  link: string | null
  readAt: string | null
  createdAt: string
}

export interface AuditEntry {
  id: string
  action: string
  targetType: string
  targetId: string
  reason: string | null
  actor: PublicUser | null
  createdAt: string
}

export interface UploadedFile {
  url: string
  name: string
}

/** Events pushed over the WebSocket. */
export type ServerEvent =
  | { type: 'message.created' | 'message.updated'; conversationId: string; message: Message }
  | { type: 'conversation.read'; conversationId: string; userId: string; lastReadAt: string }
  | { type: 'listing.changed'; listingId: string; status: string }
  | { type: 'order.updated'; orderId: string; status: string }
  | { type: 'notification.created'; notification: Notification }
  | { type: 'account.suspended' }

export interface Deal {
  id: string
  listingId: string | null
  description: string
  imageUrls: string[]
  title: string
  price: number
  currency: string
  category: string
  date: string
}

export interface CategoryCount {
  name: string
  count: number
}

export interface ProfileActivity {
  sales: Deal[]
  purchases: Deal[]
  listingCategories: CategoryCount[]
  saleCategories: CategoryCount[]
  purchaseCategories: CategoryCount[]
}

export interface AdminOrder extends Order {
  paymentReference: string | null
}

interface RankedUser {
  user: PublicUser | null
  count: number
  revenue: number
}

export interface PlatformStats {
  totals: {
    users: number
    bannedUsers: number
    openReports: number
    listings: Partial<Record<ListingStatus, number>>
    orders: Partial<Record<OrderStatus, number>>
  }
  mainCurrency: string | null
  revenue: { currency: string; count: number; amount: number }[]
  daily: { date: string; orders: number; revenue: number; users: number; listings: number }[]
  categories: { name: string; count: number; revenue: number }[]
  topSellers: RankedUser[]
  topBuyers: RankedUser[]
}
