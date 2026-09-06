/**
 * Domain vocabulary shared by the API and the web app.
 *
 * These are plain const objects rather than TS `enum`s so they survive
 * `isolatedModules`, tree-shake cleanly, and can be fed straight to Zod.
 */

export const USER_ROLES = ['customer', 'support', 'manager', 'admin'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_STATUSES = ['active', 'disabled', 'banned'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const PRODUCT_STATUSES = ['draft', 'active', 'archived'] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const CONTENT_STATUSES = ['active', 'inactive'] as const;
export type ContentStatus = (typeof CONTENT_STATUSES)[number];

/**
 * Order lifecycle. Transitions are NOT free-form — the API enforces a state
 * machine (see backend/src/services/orderStateMachine.ts); anything else is
 * rejected with 409 INVALID_STATE_TRANSITION.
 */
export const ORDER_STATUSES = [
  'pending_payment',
  'confirmed',
  'processing',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
  'cancelled',
  'returned',
  'refunded',
  'payment_failed',
  'expired',
] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Statuses a customer is allowed to see as "in flight". */
export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
  'confirmed',
  'processing',
  'packed',
  'shipped',
  'out_for_delivery',
];

/** Terminal states — no further transition is possible. */
export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = [
  'refunded',
  'expired',
  'payment_failed',
];

export const PAYMENT_STATUSES = [
  'created',
  'pending',
  'paid',
  'failed',
  'refunded',
  'partially_refunded',
] as const;
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const FULFILLMENT_STATUSES = ['unfulfilled', 'partial', 'fulfilled', 'returned'] as const;
export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

export const PAYMENT_METHODS = ['card', 'upi', 'netbanking', 'wallet', 'cod', 'mock'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const COUPON_TYPES = ['percentage', 'fixed', 'free_shipping'] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

export const REVIEW_STATUSES = ['pending', 'approved', 'rejected'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

export const RESERVATION_STATUSES = ['held', 'committed', 'released', 'expired'] as const;
export type ReservationStatus = (typeof RESERVATION_STATUSES)[number];

/**
 * Every movement of stock is written to an immutable ledger so any discrepancy
 * can be explained after the fact.
 */
export const INVENTORY_TXN_TYPES = [
  'reserve',
  'release',
  'sale',
  'restock',
  'adjustment',
  'return',
  'damage',
] as const;
export type InventoryTxnType = (typeof INVENTORY_TXN_TYPES)[number];

export const NOTIFICATION_TYPES = [
  'order_placed',
  'payment_succeeded',
  'payment_failed',
  'order_shipped',
  'order_delivered',
  'order_cancelled',
  'refund_issued',
  'review_approved',
  'price_drop',
  'back_in_stock',
] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** Sort keys accepted by the product listing endpoint. */
export const PRODUCT_SORTS = [
  'relevance',
  'newest',
  'price_asc',
  'price_desc',
  'rating',
  'popularity',
  'best_selling',
  'discount',
] as const;
export type ProductSort = (typeof PRODUCT_SORTS)[number];

export const CURRENCIES = ['INR', 'USD', 'EUR'] as const;
export type Currency = (typeof CURRENCIES)[number];

export const ADDRESS_LABELS = ['home', 'work', 'other'] as const;
export type AddressLabel = (typeof ADDRESS_LABELS)[number];
