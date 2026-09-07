import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { CheckoutQuoteInput, DeliveryMethod } from '@ecom/shared';
import { ApiError } from '@/lib/apiClient';
import { cartKeys } from '@/features/cart/api/queries';
import { applyCoupon, fetchQuote, removeCoupon, type CheckoutQuote } from './checkout.api';

export const checkoutKeys = {
  all: ['checkout'] as const,
  quote: (input: CheckoutQuoteInput) => [...checkoutKeys.all, 'quote', input] as const,
};

/**
 * The live price of this cart, for these choices.
 *
 * Re-requested whenever the address or delivery method changes, because both
 * move the total. `staleTime: 0` is not a performance oversight — a cached total
 * is a total that can disagree with what the customer will be charged.
 */
export function useCheckoutQuote(params: {
  addressId?: string;
  deliveryMethod: DeliveryMethod;
  enabled?: boolean;
}) {
  const input: CheckoutQuoteInput = {
    deliveryMethod: params.deliveryMethod,
    ...(params.addressId ? { addressId: params.addressId } : {}),
  };

  return useQuery({
    queryKey: checkoutKeys.quote(input),
    queryFn: () => fetchQuote(input),
    enabled: params.enabled ?? true,
    staleTime: 0,
    retry: false,
    // Keeps the previous total on screen while a new one is fetched, so the
    // summary does not flash empty every time the delivery option changes.
    placeholderData: (previous: CheckoutQuote | undefined) => previous,
  });
}

export function useApplyCoupon() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: applyCoupon,
    onSuccess: (cart) => {
      queryClient.setQueryData(cartKeys.detail(), cart);
      // The discount changes the total, so any quote in flight is now wrong.
      void queryClient.invalidateQueries({ queryKey: checkoutKeys.all });
      toast.success(`Coupon ${cart.coupon?.code} applied`);
    },
    onError: (error) => {
      // The server's message names the actual reason ("Spend ₹400 more"), which
      // is far more useful than a generic failure.
      toast.error(error instanceof ApiError ? error.message : 'That coupon could not be applied');
    },
  });
}

export function useRemoveCoupon() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: removeCoupon,
    onSuccess: (cart) => {
      queryClient.setQueryData(cartKeys.detail(), cart);
      void queryClient.invalidateQueries({ queryKey: checkoutKeys.all });
      toast.success('Coupon removed');
    },
  });
}
