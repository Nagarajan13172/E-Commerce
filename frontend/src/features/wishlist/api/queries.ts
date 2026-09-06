import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { STALE_TIME } from '@/lib/queryClient';
import { useAppSelector } from '@/store/hooks';
import { selectIsAuthenticated } from '@/store/selectors';
import {
  addToWishlist,
  fetchWishlist,
  fetchWishlistIds,
  removeFromWishlist,
  type WishlistItem,
} from './wishlist.api';

export const wishlistKeys = {
  all: ['wishlist'] as const,
  items: () => [...wishlistKeys.all, 'items'] as const,
  ids: () => [...wishlistKeys.all, 'ids'] as const,
};

export function useWishlist() {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);

  return useQuery({
    queryKey: wishlistKeys.items(),
    queryFn: fetchWishlist,
    // Skipped entirely when signed out: the endpoint would 401, and firing a
    // request we know will fail just to discard it is wasted latency.
    enabled: isAuthenticated,
    staleTime: STALE_TIME.SHORT,
  });
}

/**
 * The set of wishlisted product ids, for heart states on cards.
 *
 * Fetched separately from the full wishlist so a listing page of 24 products
 * costs one small id array rather than loading every saved product in full.
 */
export function useWishlistIds() {
  const isAuthenticated = useAppSelector(selectIsAuthenticated);

  const query = useQuery({
    queryKey: wishlistKeys.ids(),
    queryFn: fetchWishlistIds,
    enabled: isAuthenticated,
    staleTime: STALE_TIME.SHORT,
  });

  return {
    ...query,
    ids: new Set(query.data ?? []),
  };
}

/**
 * Toggle, applied optimistically.
 *
 * A heart that waits for a round trip before filling feels unresponsive, and
 * this is a low-stakes action — the worst case of a wrong optimistic guess is a
 * heart that flips back, not a wrong charge.
 */
export function useToggleWishlist() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ productId, isSaved }: { productId: string; isSaved: boolean }) =>
      isSaved ? removeFromWishlist(productId) : addToWishlist(productId),

    onMutate: async ({ productId, isSaved }) => {
      await queryClient.cancelQueries({ queryKey: wishlistKeys.ids() });
      const previousIds = queryClient.getQueryData<string[]>(wishlistKeys.ids());

      queryClient.setQueryData<string[]>(wishlistKeys.ids(), (current = []) =>
        isSaved ? current.filter((id) => id !== productId) : [...current, productId],
      );

      return { previousIds };
    },

    onError: (_error, _variables, context) => {
      if (context?.previousIds) {
        queryClient.setQueryData(wishlistKeys.ids(), context.previousIds);
      }
      toast.error('Could not update your wishlist');
    },

    onSuccess: (items: WishlistItem[], { isSaved }) => {
      queryClient.setQueryData(wishlistKeys.items(), items);
      queryClient.setQueryData(
        wishlistKeys.ids(),
        items.map((item) => item._id),
      );
      toast.success(isSaved ? 'Removed from your wishlist' : 'Saved to your wishlist');
    },
  });
}
