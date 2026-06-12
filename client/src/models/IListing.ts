export interface IListing {
  _id: string;
  title: string;
  description: string;
  price: number;
  currency?: string;
  imageUrl: string;
  imageUrls?: string[];
  location?: string;
  createdAt?: string;
  phone?: string;
  category?: string;
  ownerId?: string;
  ownerEmail?: string | null;
  ownerNickname?: string | null;
  ownerAvatarUrl?: string | null;
  ownerIsAdmin?: boolean;
  ownerIsActivated?: boolean;
  status?: 'active' | 'deactivated' | 'pending' | 'sold' | 'deleted';
  moderationReason?: string | null;
  buyerEmail?: string | null;
  buyerId?: string | null;
  buyerNickname?: string | null;
  purchasedAt?: string;
  purchaseId?: string;
  soldAt?: string;
  soldPrice?: number;
}
