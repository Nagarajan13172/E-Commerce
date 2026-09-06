import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { STALE_TIME } from '@/lib/queryClient';
import { ApiError } from '@/lib/apiClient';
import type { Cart } from '@/types/cart';
import { addCartItem, clearCart, fetchCart, removeCartItem, updateCartItem } from './cart.api';

export const cartKeys = {
  all: ['cart'] as const,
  detail: () => [...cartKeys.all, 'detail'] as const,
};

/**
 * The cart is server state, deliberately not a Redux slice.
 *
 * A client-owned cart drifts: prices change, stock runs out, and a second tab
 * has its own copy. Every mutation below therefore returns the *server's* view
 * of the cart and replaces the cache with it, so the UI can never disagree with
 * what checkout will actually charge.
 */
export function useCart() {
  return useQuery({
    queryKey: cartKeys.detail(),
    queryFn: fetchCart,
    // Never serve a stale cart: it is the one thing a customer will notice
    // being wrong, and it gates money.
    staleTime: STALE_TIME.NONE,
  });
}

export function useAddToCart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: addCartItem,
    onSuccess: (cart) => {
      queryClient.setQueryData(cartKeys.detail(), cart);
      toast.success('Added to your bag');
    },
    onError: (error) => {
      // Stock and availability failures are expected outcomes, not bugs — the
      // server's message names the actual limit ("Only 3 left in stock").
      toast.error(error instanceof ApiError ? error.message : 'Could not add to your bag');
    },
  });
}

/**
 * Quantity changes, applied optimistically.
 *
 * A stepper that waits for a round trip feels broken, so the new quantity is
 * written into the cache immediately and rolled back if the server disagrees —
 * which it will when the requested quantity exceeds live stock.
 */
export function useUpdateCartItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ itemId, quantity }: { itemId: string; quantity: number }) =>
      updateCartItem(itemId, quantity),

    onMutate: async ({ itemId, quantity }) => {
      // Cancel in-flight refetches so one cannot overwrite the optimistic value.
      await queryClient.cancelQueries({ queryKey: cartKeys.detail() });
      const previous = queryClient.getQueryData<Cart>(cartKeys.detail());

      queryClient.setQueryData<Cart>(cartKeys.detail(), (current) => {
        if (!current) return current;
        const items = current.items
          .map((line) =>
            line.itemId === itemId
              ? { ...line, quantity, lineTotal: line.unitPrice * quantity }
              : line,
          )
          .filter((line) => line.quantity > 0);

        return {
          ...current,
          items,
          itemCount: items.reduce((sum, line) => sum + line.quantity, 0),
          subtotal: items.reduce((sum, line) => sum + line.lineTotal, 0),
        };
      });

      return { previous };
    },

    onError: (error, _variables, context) => {
      if (context?.previous) queryClient.setQueryData(cartKeys.detail(), context.previous);
      toast.error(error instanceof ApiError ? error.message : 'Could not update your bag');
    },

    // Replace the optimistic guess with the server's authoritative view — it
    // may differ in more than quantity (a price could have moved).
    onSuccess: (cart) => queryClient.setQueryData(cartKeys.detail(), cart),
  });
}

export function useRemoveCartItem() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: removeCartItem,
    onMutate: async (itemId: string) => {
      await queryClient.cancelQueries({ queryKey: cartKeys.detail() });
      const previous = queryClient.getQueryData<Cart>(cartKeys.detail());

      queryClient.setQueryData<Cart>(cartKeys.detail(), (current) => {
        if (!current) return current;
        const items = current.items.filter((line) => line.itemId !== itemId);
        return {
          ...current,
          items,
          itemCount: items.reduce((sum, line) => sum + line.quantity, 0),
          subtotal: items.reduce((sum, line) => sum + line.lineTotal, 0),
        };
      });

      return { previous };
    },
    onError: (_error, _itemId, context) => {
      if (context?.previous) queryClient.setQueryData(cartKeys.detail(), context.previous);
      toast.error('Could not remove that item');
    },
    onSuccess: (cart) => queryClient.setQueryData(cartKeys.detail(), cart),
  });
}

export function useClearCart() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: clearCart,
    onSuccess: (cart) => {
      queryClient.setQueryData(cartKeys.detail(), cart);
      toast.success('Your bag is empty');
    },
  });
}
