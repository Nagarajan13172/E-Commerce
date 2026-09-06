import { apiDelete, apiGet, apiPost } from '@/lib/apiClient';
import type { ProductSummary } from '@/types/catalog';

export type WishlistItem = ProductSummary & { addedAt: string };

export async function fetchWishlist(): Promise<WishlistItem[]> {
  const { items } = await apiGet<{ items: WishlistItem[] }>('/account/wishlist');
  return items;
}

/** Ids only — enough to render the heart state on a grid, without the payload. */
export async function fetchWishlistIds(): Promise<string[]> {
  const { productIds } = await apiGet<{ productIds: string[] }>('/account/wishlist/ids');
  return productIds;
}

export async function addToWishlist(productId: string): Promise<WishlistItem[]> {
  const { items } = await apiPost<{ items: WishlistItem[] }>('/account/wishlist', { productId });
  return items;
}

export async function removeFromWishlist(productId: string): Promise<WishlistItem[]> {
  const { items } = await apiDelete<{ items: WishlistItem[] }>(`/account/wishlist/${productId}`);
  return items;
}
