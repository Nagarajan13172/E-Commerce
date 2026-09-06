import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import {
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  FULFILLMENT_STATUSES,
  type OrderStatus,
  type PaymentStatus,
  type FulfillmentStatus,
} from '@ecom/shared';

/**
 * ORDER — an immutable commercial record.
 *
 * Everything the customer agreed to is **snapshotted** into the order: product
 * name, SKU, image, variant options, unit price, and the full shipping address.
 * Nothing is stored as a live reference that could later change its meaning.
 *
 * This is not redundancy, it is correctness. If a product is renamed, repriced,
 * or deleted next month, the order must still read exactly as it did when it was
 * placed — for the customer's records, for support, and for anyone auditing the
 * books. An order that mutates because someone edited a product is a broken
 * order. (Product ids are still kept alongside the snapshots so "buy it again"
 * and sales reporting can link back.)
 */

export interface IOrderItem {
  _id: Types.ObjectId;
  product: Types.ObjectId;
  variantId?: Types.ObjectId;
  productSnapshot: {
    name: string;
    slug: string;
    sku: string;
    thumbnail?: string;
    brandName?: string;
  };
  variantSnapshot?: {
    sku: string;
    optionValues: { name: string; value: string }[];
  };
  quantity: number;
  unitPrice: number;
  lineDiscount: number;
  lineTax: number;
  lineTotal: number;
}

export interface IOrderAddress {
  fullName: string;
  phone: string;
  line1: string;
  line2?: string;
  landmark?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
}

export interface ITimelineEntry {
  status: OrderStatus;
  at: Date;
  /** Who caused the transition — a staff user, or the system for webhooks/jobs. */
  actor?: Types.ObjectId;
  actorType: 'customer' | 'staff' | 'system';
  note?: string;
}

export interface IOrder {
  _id: Types.ObjectId;
  orderNumber: string;
  user?: Types.ObjectId;
  email: string;

  items: Types.DocumentArray<IOrderItem>;

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

  shippingAddress: IOrderAddress;
  billingAddress: IOrderAddress;

  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;

  shipping: {
    method?: string;
    provider?: string;
    trackingNumber?: string;
    trackingUrl?: string;
    estimatedDeliveryAt?: Date;
    shippedAt?: Date;
    deliveredAt?: Date;
  };

  timeline: ITimelineEntry[];

  customerNote?: string;
  internalNotes: { by: Types.ObjectId; note: string; at: Date }[];

  cancellation?: { reason: string; by?: Types.ObjectId; at: Date };
  refunds: { amount: number; reason: string; payment?: Types.ObjectId; at: Date }[];
  refundedTotal: number;

  /** Client-supplied key that makes order creation safe to retry. */
  idempotencyKey?: string;
  placedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type OrderDocument = HydratedDocument<IOrder>;

const addressSnapshotSchema = {
  _id: false,
  fullName: { type: String, required: true },
  phone: { type: String, required: true },
  line1: { type: String, required: true },
  line2: { type: String },
  landmark: { type: String },
  city: { type: String, required: true },
  state: { type: String, required: true },
  postalCode: { type: String, required: true },
  country: { type: String, required: true, default: 'India' },
};

const orderItemSchema = new Schema<IOrderItem>(
  {
    product: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
    variantId: { type: Schema.Types.ObjectId },
    productSnapshot: {
      _id: false,
      name: { type: String, required: true },
      slug: { type: String, required: true },
      sku: { type: String, required: true },
      thumbnail: { type: String },
      brandName: { type: String },
    },
    variantSnapshot: {
      type: {
        _id: false,
        sku: { type: String, required: true },
        optionValues: {
          type: [{ _id: false, name: String, value: String }],
          default: [],
        },
      },
      default: undefined,
    },
    quantity: { type: Number, required: true, min: 1 },
    unitPrice: { type: Number, required: true, min: 0 },
    lineDiscount: { type: Number, default: 0, min: 0 },
    lineTax: { type: Number, default: 0, min: 0 },
    lineTotal: { type: Number, required: true, min: 0 },
  },
  { _id: true },
);

const orderSchema = new Schema<IOrder, Model<IOrder>>(
  {
    orderNumber: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: 'User' },
    email: { type: String, required: true, lowercase: true },

    items: { type: [orderItemSchema], required: true },

    pricing: {
      _id: false,
      subtotal: { type: Number, required: true, min: 0 },
      discountTotal: { type: Number, default: 0, min: 0 },
      couponCode: { type: String, uppercase: true },
      couponDiscount: { type: Number, default: 0, min: 0 },
      taxTotal: { type: Number, default: 0, min: 0 },
      shippingTotal: { type: Number, default: 0, min: 0 },
      grandTotal: { type: Number, required: true, min: 0 },
      currency: { type: String, default: 'INR' },
    },

    shippingAddress: { type: addressSnapshotSchema, required: true },
    billingAddress: { type: addressSnapshotSchema, required: true },

    status: { type: String, enum: ORDER_STATUSES, default: 'pending_payment' },
    paymentStatus: { type: String, enum: PAYMENT_STATUSES, default: 'created' },
    fulfillmentStatus: { type: String, enum: FULFILLMENT_STATUSES, default: 'unfulfilled' },

    shipping: {
      _id: false,
      method: { type: String },
      provider: { type: String },
      trackingNumber: { type: String },
      trackingUrl: { type: String },
      estimatedDeliveryAt: { type: Date },
      shippedAt: { type: Date },
      deliveredAt: { type: Date },
    },

    timeline: {
      type: [
        {
          _id: false,
          status: { type: String, enum: ORDER_STATUSES, required: true },
          at: { type: Date, default: Date.now },
          actor: { type: Schema.Types.ObjectId, ref: 'User' },
          actorType: {
            type: String,
            enum: ['customer', 'staff', 'system'],
            default: 'system',
          },
          note: { type: String, maxlength: 500 },
        },
      ],
      default: [],
    },

    customerNote: { type: String, maxlength: 500 },
    internalNotes: {
      type: [
        {
          _id: false,
          by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          note: { type: String, required: true, maxlength: 1000 },
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },

    cancellation: {
      type: {
        _id: false,
        reason: { type: String, required: true, maxlength: 500 },
        by: { type: Schema.Types.ObjectId, ref: 'User' },
        at: { type: Date, default: Date.now },
      },
      default: undefined,
    },
    refunds: {
      type: [
        {
          _id: false,
          amount: { type: Number, required: true, min: 0 },
          reason: { type: String, required: true, maxlength: 500 },
          payment: { type: Schema.Types.ObjectId, ref: 'Payment' },
          at: { type: Date, default: Date.now },
        },
      ],
      default: [],
    },
    refundedTotal: { type: Number, default: 0, min: 0 },

    idempotencyKey: { type: String },
    placedAt: { type: Date },
  },
  { timestamps: true },
);

// Customer's order history — the single most frequent authenticated query.
orderSchema.index({ user: 1, createdAt: -1 });
// Admin order queues, filtered by state.
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1, createdAt: -1 });
// "Which orders contained this product?" for analytics and recalls.
orderSchema.index({ 'items.product': 1 });
// Guest order lookup by email.
orderSchema.index({ email: 1, createdAt: -1 });
// The reservation sweeper scans for checkouts that were never paid.
orderSchema.index({ status: 1, updatedAt: 1 });

export const Order = model<IOrder>('Order', orderSchema);
