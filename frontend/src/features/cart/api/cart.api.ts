import { apiDelete, apiGet, apiPatch, apiPost } from '@/lib/apiClient';
import type { Cart } from '@/types/cart';

export async function fetchCart(): Promise<Cart> {
  const { cart } = await apiGet<{ cart: Cart }>('/cart');
  return cart;
}

export async function addCartItem(input: {
  productId: string;
  variantId?: string;
  quantity: number;
}): Promise<Cart> {
  const { cart } = await apiPost<{ cart: Cart }>('/cart/items', input);
  return cart;
}

export async function updateCartItem(itemId: string, quantity: number): Promise<Cart> {
  const { cart } = await apiPatch<{ cart: Cart }>(`/cart/items/${itemId}`, { quantity });
  return cart;
}

export async function removeCartItem(itemId: string): Promise<Cart> {
  const { cart } = await apiDelete<{ cart: Cart }>(`/cart/items/${itemId}`);
  return cart;
}

export async function clearCart(): Promise<Cart> {
  const { cart } = await apiDelete<{ cart: Cart }>('/cart');
  return cart;
}
