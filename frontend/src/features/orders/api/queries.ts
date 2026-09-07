import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { STALE_TIME } from '@/lib/queryClient';
import { ApiError } from '@/lib/apiClient';
import { cartKeys } from '@/features/cart/api/queries';
import { checkoutKeys } from '@/features/checkout/api/queries';
import { cancelOrder, fetchOrder, fetchOrders } from './orders.api';

export const orderKeys = {
  all: ['orders'] as const,
  list: (page: number) => [...orderKeys.all, 'list', page] as const,
  detail: (orderNumber: string) => [...orderKeys.all, 'detail', orderNumber] as const,
};

export function useOrders(page = 1) {
  return useQuery({
    queryKey: orderKeys.list(page),
    queryFn: () => fetchOrders(page),
    staleTime: STALE_TIME.SHORT,
  });
}

export function useOrder(orderNumber: string) {
  return useQuery({
    queryKey: orderKeys.detail(orderNumber),
    queryFn: () => fetchOrder(orderNumber),
    enabled: Boolean(orderNumber),
    // Short: an order's status changes without the customer doing anything, so
    // returning to the page should show where it has got to.
    staleTime: STALE_TIME.SHORT,
  });
}

export function useCancelOrder() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ orderNumber, reason }: { orderNumber: string; reason: string }) =>
      cancelOrder(orderNumber, reason),
    onSuccess: (order) => {
      queryClient.setQueryData(orderKeys.detail(order.orderNumber), order);
      void queryClient.invalidateQueries({ queryKey: orderKeys.all });
      // Cancelling returns stock, which can change what the catalog shows.
      void queryClient.invalidateQueries({ queryKey: ['catalog'] });
      toast.success('Order cancelled');
    },
    onError: (error) => {
      // The server explains exactly why (already dispatched, wrong status).
      toast.error(error instanceof ApiError ? error.message : 'Could not cancel that order');
    },
  });
}

/** Everything the order flow invalidated: the bag is now an order. */
export function useInvalidateAfterOrder() {
  const queryClient = useQueryClient();

  return () => {
    void queryClient.invalidateQueries({ queryKey: cartKeys.all });
    void queryClient.invalidateQueries({ queryKey: checkoutKeys.all });
    void queryClient.invalidateQueries({ queryKey: orderKeys.all });
    void queryClient.invalidateQueries({ queryKey: ['catalog'] });
  };
}
