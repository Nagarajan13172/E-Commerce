import { apiDelete, apiGet, apiGetWithMeta, apiPatch, apiPost } from '@/lib/apiClient';
import type {
  AdminCouponQuery,
  AdminCustomerQuery,
  AdminOrderQuery,
  AdminReviewQuery,
  AnalyticsQuery,
  CreateCouponInput,
  InventoryQuery,
  OrderStatus,
  UserRole,
  UserStatus,
} from '@ecom/shared';
import type { PaginationMeta } from '@/types/catalog';
import type { Order } from '@/features/orders/api/orders.api';

/** Turn a typed query object into a query string, dropping empty values. */
function toQuery(params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, value instanceof Date ? value.toISOString() : String(value));
  }
  const qs = search.toString();
  return qs ? `?${qs}` : '';
}

// ── Dashboard ───────────────────────────────────────────────────────────────

export interface MetricWithChange {
  value: number;
  previous: number;
  changePercent: number | null;
}

export interface Dashboard {
  range: { from: string; to: string; preset: string };
  summary: {
    revenue: MetricWithChange;
    orders: MetricWithChange;
    averageOrderValue: MetricWithChange;
    unitsSold: MetricWithChange;
    newCustomers: MetricWithChange;
    totals: { products: number; customers: number; pendingOrders: number; lowStock: number };
  };
  salesByDay: { date: string; revenue: number; orders: number }[];
  topProducts: {
    _id: string;
    name: string;
    slug: string;
    thumbnail?: string;
    units: number;
    revenue: number;
  }[];
  salesByCategory: { _id: string; revenue: number; units: number }[];
  recentOrders: {
    _id: string;
    orderNumber: string;
    email: string;
    status: OrderStatus;
    pricing: { grandTotal: number; currency: string };
    createdAt: string;
  }[];
  topCustomers: { _id: string; name: string; email: string; orders: number; spent: number }[];
}

export async function fetchDashboard(query: Partial<AnalyticsQuery>): Promise<Dashboard> {
  return apiGet<Dashboard>(`/admin/dashboard${toQuery(query)}`);
}

// ── Orders ──────────────────────────────────────────────────────────────────

export async function fetchAdminOrders(query: Partial<AdminOrderQuery>) {
  return apiGetWithMeta<{ items: Order[] }, PaginationMeta>(`/admin/orders${toQuery(query)}`);
}

export interface AdminOrderDetail {
  order: Order & {
    user?: { _id: string; name: string; email: string; phone?: string };
    internalNotes: { by: { _id: string; name: string }; note: string; at: string }[];
  };
  payments: {
    _id: string;
    provider: string;
    providerOrderId: string;
    providerPaymentId?: string;
    amount: number;
    amountRefunded: number;
    status: string;
    method?: string;
    paidAt?: string;
  }[];
  /** Only the transitions the state machine permits from here. */
  allowedTransitions: OrderStatus[];
}

export async function fetchAdminOrder(id: string): Promise<AdminOrderDetail> {
  return apiGet<AdminOrderDetail>(`/admin/orders/${id}`);
}

export async function updateOrderStatus(id: string, status: OrderStatus, note?: string) {
  return apiPatch<{ order: Order; allowedTransitions: OrderStatus[] }>(
    `/admin/orders/${id}/status`,
    { status, note },
  );
}

export async function updateOrderShipping(
  id: string,
  input: { provider?: string; trackingNumber?: string; trackingUrl?: string },
) {
  return apiPatch<{ order: Order }>(`/admin/orders/${id}/shipping`, input);
}

export async function refundOrder(id: string, amount: number, reason: string) {
  return apiPost<{ order: Order }>(`/admin/orders/${id}/refund`, { amount, reason });
}

export async function fetchRefundable(id: string) {
  return apiGet<{ refundable: number; currency: string }>(`/admin/orders/${id}/refundable`);
}

export async function addOrderNote(id: string, note: string) {
  return apiPost<{ order: AdminOrderDetail['order'] }>(`/admin/orders/${id}/notes`, { note });
}

// ── Customers ───────────────────────────────────────────────────────────────

export interface AdminCustomer {
  _id: string;
  name: string;
  email: string;
  phone?: string;
  role: UserRole;
  status: UserStatus;
  emailVerifiedAt?: string;
  lastLoginAt?: string;
  createdAt: string;
}

export async function fetchCustomers(query: Partial<AdminCustomerQuery>) {
  return apiGetWithMeta<{ items: AdminCustomer[] }, PaginationMeta>(
    `/admin/customers${toQuery(query)}`,
  );
}

export async function fetchCustomer(id: string) {
  return apiGet<{
    user: AdminCustomer;
    orders: Order[];
    stats: { totalOrders: number; totalSpent: number; averageOrderValue: number };
  }>(`/admin/customers/${id}`);
}

export async function updateCustomerStatus(id: string, status: UserStatus) {
  return apiPatch<{ user: AdminCustomer }>(`/admin/customers/${id}/status`, { status });
}

export async function updateCustomerRole(id: string, role: UserRole) {
  return apiPatch<{ user: AdminCustomer }>(`/admin/customers/${id}/role`, { role });
}

// ── Inventory ───────────────────────────────────────────────────────────────

export interface InventoryRow {
  productId: string;
  name: string;
  slug: string;
  thumbnail?: string;
  status: string;
  variantId: string | null;
  sku: string;
  label: string;
  available: number;
  reserved: number;
  sold: number;
  lowStockThreshold: number;
}

export async function fetchInventory(query: Partial<InventoryQuery>) {
  return apiGetWithMeta<{ items: InventoryRow[] }, PaginationMeta>(
    `/admin/inventory${toQuery(query)}`,
  );
}

export async function adjustStock(input: {
  productId: string;
  variantId?: string;
  delta: number;
  note?: string;
}) {
  return apiPost<{ stock: { available: number; reserved: number; sold: number } }>(
    '/admin/inventory/adjust',
    input,
  );
}

export interface InventoryHistoryEntry {
  _id: string;
  type: string;
  quantity: number;
  before: { available: number; reserved: number; sold: number };
  after: { available: number; reserved: number; sold: number };
  note?: string;
  actor?: { name: string };
  createdAt: string;
}

export async function fetchInventoryHistory(productId: string, variantId?: string) {
  return apiGet<{ items: InventoryHistoryEntry[] }>(
    `/admin/inventory/${productId}/history${variantId ? `?variantId=${variantId}` : ''}`,
  );
}

// ── Reviews ─────────────────────────────────────────────────────────────────

export interface AdminReview {
  _id: string;
  rating: number;
  title?: string;
  comment: string;
  status: 'pending' | 'approved' | 'rejected';
  reportedCount: number;
  createdAt: string;
  user?: { name: string; email: string };
  product?: { name: string; slug: string; thumbnail?: string };
  adminResponse?: { text: string; at: string };
}

export async function fetchReviews(query: Partial<AdminReviewQuery>) {
  return apiGetWithMeta<{ items: AdminReview[] }, PaginationMeta>(
    `/admin/reviews${toQuery(query)}`,
  );
}

export async function moderateReview(
  id: string,
  status: 'approved' | 'rejected',
  rejectionReason?: string,
) {
  return apiPatch<{ review: AdminReview }>(`/admin/reviews/${id}/moderate`, {
    status,
    rejectionReason,
  });
}

export async function respondToReview(id: string, text: string) {
  return apiPost<{ review: AdminReview }>(`/admin/reviews/${id}/respond`, { text });
}

// ── Coupons ─────────────────────────────────────────────────────────────────

export interface AdminCoupon {
  _id: string;
  code: string;
  description?: string;
  type: 'percentage' | 'fixed' | 'free_shipping';
  value: number;
  minOrderValue: number;
  maxDiscount?: number;
  usageLimit?: number;
  perUserLimit: number;
  usedCount: number;
  startsAt: string;
  expiresAt: string;
  firstOrderOnly: boolean;
  isActive: boolean;
}

export async function fetchCoupons(query: Partial<AdminCouponQuery>) {
  return apiGetWithMeta<{ items: AdminCoupon[] }, PaginationMeta>(
    `/admin/coupons${toQuery(query)}`,
  );
}

export async function createCoupon(input: CreateCouponInput) {
  return apiPost<{ coupon: AdminCoupon }>('/admin/coupons', input);
}

export async function deactivateCoupon(id: string) {
  return apiDelete<{ coupon: AdminCoupon }>(`/admin/coupons/${id}`);
}

// ── Products (admin listing) ────────────────────────────────────────────────

export interface AdminProductRow {
  _id: string;
  name: string;
  slug: string;
  sku: string;
  thumbnail?: string;
  status: 'draft' | 'active' | 'archived';
  price: number;
  priceRange: { min: number; max: number };
  totalStock: number;
  inStock: boolean;
  variantCount: number;
  brand?: { name: string };
  rating: { average: number; count: number };
  isFeatured: boolean;
  updatedAt: string;
}

export async function fetchAdminProducts(query: Record<string, unknown>) {
  return apiGetWithMeta<{ items: AdminProductRow[] }, PaginationMeta>(
    `/admin/products${toQuery(query)}`,
  );
}

export async function bulkProductAction(ids: string[], action: string) {
  return apiPost<{ modified: number }>('/admin/products/bulk', { ids, action });
}
