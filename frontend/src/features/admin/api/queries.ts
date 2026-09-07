import { useMutation, useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { toast } from 'sonner';
import type {
  AdminCouponQuery,
  AdminCustomerQuery,
  AdminOrderQuery,
  AdminReviewQuery,
  AnalyticsQuery,
  InventoryQuery,
  OrderStatus,
  UserRole,
  UserStatus,
} from '@ecom/shared';
import { STALE_TIME } from '@/lib/queryClient';
import { ApiError } from '@/lib/apiClient';
import * as api from './admin.api';

/**
 * Admin data access.
 *
 * Staleness is tuned per resource by how much a stale value would cost. The
 * dashboard can be a minute old; an order being fulfilled cannot, because two
 * staff members may be looking at it at once.
 */
export const adminKeys = {
  all: ['admin'] as const,
  dashboard: (q: Partial<AnalyticsQuery>) => [...adminKeys.all, 'dashboard', q] as const,
  orders: (q: Partial<AdminOrderQuery>) => [...adminKeys.all, 'orders', q] as const,
  order: (id: string) => [...adminKeys.all, 'order', id] as const,
  customers: (q: Partial<AdminCustomerQuery>) => [...adminKeys.all, 'customers', q] as const,
  customer: (id: string) => [...adminKeys.all, 'customer', id] as const,
  inventory: (q: Partial<InventoryQuery>) => [...adminKeys.all, 'inventory', q] as const,
  inventoryHistory: (productId: string, variantId?: string) =>
    [...adminKeys.all, 'inventory-history', productId, variantId ?? 'none'] as const,
  reviews: (q: Partial<AdminReviewQuery>) => [...adminKeys.all, 'reviews', q] as const,
  coupons: (q: Partial<AdminCouponQuery>) => [...adminKeys.all, 'coupons', q] as const,
  products: (q: Record<string, unknown>) => [...adminKeys.all, 'products', q] as const,
};

export function useDashboard(query: Partial<AnalyticsQuery>) {
  return useQuery({
    queryKey: adminKeys.dashboard(query),
    queryFn: () => api.fetchDashboard(query),
    staleTime: STALE_TIME.SHORT,
    // Keeps the previous numbers on screen while a new range loads, so the
    // dashboard does not blank out every time the period changes.
    placeholderData: keepPreviousData,
  });
}

export function useAdminOrders(query: Partial<AdminOrderQuery>) {
  return useQuery({
    queryKey: adminKeys.orders(query),
    queryFn: () => api.fetchAdminOrders(query),
    staleTime: STALE_TIME.SHORT,
    placeholderData: keepPreviousData,
  });
}

export function useAdminOrder(id: string) {
  return useQuery({
    queryKey: adminKeys.order(id),
    queryFn: () => api.fetchAdminOrder(id),
    enabled: Boolean(id),
    // Never stale: two staff members may be working the same order, and acting
    // on a stale status is how an order gets shipped twice.
    staleTime: 0,
  });
}

/** Shared invalidation for anything that changes an order. */
function useOrderMutation<TVariables, TData>(
  mutationFn: (v: TVariables) => Promise<TData>,
  successMessage: string | ((data: TData) => string),
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn,
    onSuccess: (data) => {
      void queryClient.invalidateQueries({ queryKey: adminKeys.all });
      toast.success(typeof successMessage === 'function' ? successMessage(data) : successMessage);
    },
    onError: (error) => {
      // The server explains illegal transitions and over-refunds precisely;
      // a generic message would hide the actual rule.
      toast.error(error instanceof ApiError ? error.message : 'That action failed');
    },
  });
}

export const useUpdateOrderStatus = () =>
  useOrderMutation(
    ({ id, status, note }: { id: string; status: OrderStatus; note?: string }) =>
      api.updateOrderStatus(id, status, note),
    'Order updated',
  );

export const useUpdateOrderShipping = () =>
  useOrderMutation(
    ({ id, ...input }: { id: string; provider?: string; trackingNumber?: string }) =>
      api.updateOrderShipping(id, input),
    'Shipping details saved',
  );

export const useRefundOrder = () =>
  useOrderMutation(
    ({ id, amount, reason }: { id: string; amount: number; reason: string }) =>
      api.refundOrder(id, amount, reason),
    'Refund issued',
  );

export const useAddOrderNote = () =>
  useOrderMutation(
    ({ id, note }: { id: string; note: string }) => api.addOrderNote(id, note),
    'Note added',
  );

export function useAdminCustomers(query: Partial<AdminCustomerQuery>) {
  return useQuery({
    queryKey: adminKeys.customers(query),
    queryFn: () => api.fetchCustomers(query),
    staleTime: STALE_TIME.SHORT,
    placeholderData: keepPreviousData,
  });
}

export function useAdminCustomer(id: string) {
  return useQuery({
    queryKey: adminKeys.customer(id),
    queryFn: () => api.fetchCustomer(id),
    enabled: Boolean(id),
    staleTime: STALE_TIME.SHORT,
  });
}

export const useUpdateCustomerStatus = () =>
  useOrderMutation(
    ({ id, status }: { id: string; status: UserStatus }) => api.updateCustomerStatus(id, status),
    'Account updated',
  );

export const useUpdateCustomerRole = () =>
  useOrderMutation(
    ({ id, role }: { id: string; role: UserRole }) => api.updateCustomerRole(id, role),
    'Role updated',
  );

export function useInventory(query: Partial<InventoryQuery>) {
  return useQuery({
    queryKey: adminKeys.inventory(query),
    queryFn: () => api.fetchInventory(query),
    // Stock changes with every order, so it must not be served stale to
    // someone about to adjust it.
    staleTime: 0,
    placeholderData: keepPreviousData,
  });
}

export function useInventoryHistory(productId: string, variantId?: string, enabled = true) {
  return useQuery({
    queryKey: adminKeys.inventoryHistory(productId, variantId),
    queryFn: () => api.fetchInventoryHistory(productId, variantId),
    enabled: enabled && Boolean(productId),
    staleTime: STALE_TIME.SHORT,
  });
}

export const useAdjustStock = () =>
  useOrderMutation(api.adjustStock, (data) => `Stock is now ${data.stock.available}`);

export function useAdminReviews(query: Partial<AdminReviewQuery>) {
  return useQuery({
    queryKey: adminKeys.reviews(query),
    queryFn: () => api.fetchReviews(query),
    staleTime: STALE_TIME.SHORT,
    placeholderData: keepPreviousData,
  });
}

export const useModerateReview = () =>
  useOrderMutation(
    ({
      id,
      status,
      rejectionReason,
    }: {
      id: string;
      status: 'approved' | 'rejected';
      rejectionReason?: string;
    }) => api.moderateReview(id, status, rejectionReason),
    'Review moderated',
  );

export const useRespondToReview = () =>
  useOrderMutation(
    ({ id, text }: { id: string; text: string }) => api.respondToReview(id, text),
    'Response published',
  );

export function useAdminCoupons(query: Partial<AdminCouponQuery>) {
  return useQuery({
    queryKey: adminKeys.coupons(query),
    queryFn: () => api.fetchCoupons(query),
    staleTime: STALE_TIME.SHORT,
    placeholderData: keepPreviousData,
  });
}

export const useCreateCoupon = () =>
  useOrderMutation(api.createCoupon, (data) => `Coupon ${data.coupon.code} created`);

export const useDeactivateCoupon = () =>
  useOrderMutation(api.deactivateCoupon, (data) => `${data.coupon.code} deactivated`);

export function useAdminProducts(query: Record<string, unknown>) {
  return useQuery({
    queryKey: adminKeys.products(query),
    queryFn: () => api.fetchAdminProducts(query),
    staleTime: STALE_TIME.SHORT,
    placeholderData: keepPreviousData,
  });
}

export const useBulkProductAction = () =>
  useOrderMutation(
    ({ ids, action }: { ids: string[]; action: string }) => api.bulkProductAction(ids, action),
    (data) => `${data.modified} product(s) updated`,
  );
