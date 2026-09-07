import { apiGet, apiGetWithMeta, apiPost } from '@/lib/apiClient';
import type { DeliveryMethod, OrderStatus, PaymentStatus } from '@ecom/shared';
import type { Address } from '@/types/cart';
import type { PaginationMeta } from '@/types/catalog';

export interface OrderItem {
  _id: string;
  product: string;
  variantId?: string;
  productSnapshot: {
    name: string;
    slug: string;
    sku: string;
    thumbnail?: string;
    brandName?: string;
  };
  variantSnapshot?: { sku: string; optionValues: { name: string; value: string }[] };
  quantity: number;
  unitPrice: number;
  lineDiscount: number;
  lineTax: number;
  lineTotal: number;
}

export interface OrderTimelineEntry {
  status: OrderStatus;
  at: string;
  actorType: 'customer' | 'staff' | 'system';
  note?: string;
}

export interface Order {
  _id: string;
  orderNumber: string;
  email: string;
  items: OrderItem[];
  pricing: {
    subtotal: number;
    discountTotal: number;
    couponCode?: string;
    couponDiscount: number;
    taxTotal: number;
    shippingTotal: number;
    grandTotal: number;
    currency: string;
  };
  shippingAddress: Omit<Address, '_id' | 'isDefaultShipping' | 'isDefaultBilling' | 'label'>;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  shipping: {
    method?: DeliveryMethod;
    provider?: string;
    trackingNumber?: string;
    trackingUrl?: string;
    estimatedDeliveryAt?: string;
    shippedAt?: string;
    deliveredAt?: string;
  };
  timeline: OrderTimelineEntry[];
  cancellation?: { reason: string; at: string };
  refundedTotal: number;
  createdAt: string;
  placedAt?: string;
}

/** What the checkout session returns: the order plus how to pay for it. */
export interface CheckoutSession {
  order: { id: string; orderNumber: string; total: number };
  payment: {
    providerOrderId: string;
    keyId: string;
    amount: number;
    currency: string;
    provider: 'mock' | 'razorpay';
  };
}

export async function createCheckoutSession(
  input: { addressId?: string; deliveryMethod: DeliveryMethod; customerNote?: string },
  idempotencyKey: string,
): Promise<CheckoutSession> {
  return apiPost<CheckoutSession>('/checkout/session', input, {
    // Makes the request safe to retry: the server replays the first response
    // rather than creating a second order that reserves the same stock again.
    headers: { 'Idempotency-Key': idempotencyKey },
  });
}

export interface SimulatedPayment {
  outcome: 'success' | 'failure';
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
}

/** Development stand-in for the provider's hosted checkout page. */
export async function simulatePayment(
  providerOrderId: string,
  outcome: 'success' | 'failure',
): Promise<SimulatedPayment> {
  return apiPost<SimulatedPayment>('/payments/simulate', { providerOrderId, outcome });
}

export async function verifyPayment(input: {
  providerOrderId: string;
  providerPaymentId: string;
  signature: string;
}): Promise<{ order: { id: string; orderNumber: string; status: OrderStatus } }> {
  return apiPost('/payments/verify', input);
}

export async function fetchOrders(page = 1): Promise<{ items: Order[]; meta: PaginationMeta }> {
  const { data, meta } = await apiGetWithMeta<{ items: Order[] }, PaginationMeta>(
    `/orders?page=${page}`,
  );
  return { items: data.items, meta };
}

export async function fetchOrder(orderNumber: string): Promise<Order> {
  const { order } = await apiGet<{ order: Order }>(`/orders/${orderNumber}`);
  return order;
}

export async function cancelOrder(orderNumber: string, reason: string): Promise<Order> {
  const { order } = await apiPost<{ order: Order }>(`/orders/${orderNumber}/cancel`, { reason });
  return order;
}
