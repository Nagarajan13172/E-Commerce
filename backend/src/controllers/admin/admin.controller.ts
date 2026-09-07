import type { RequestHandler } from 'express';
import type {
  AdminCouponQuery,
  AdminCustomerQuery,
  AdminOrderQuery,
  AdminReviewQuery,
  AdjustStockInput,
  AnalyticsQuery,
  CreateCouponInput,
  InventoryQuery,
  ModerateReviewInput,
  OrderNoteInput,
  RefundOrderInput,
  RespondToReviewInput,
  UpdateCouponInput,
  UpdateCustomerRoleInput,
  UpdateCustomerStatusInput,
  UpdateOrderStatusInput,
  UpdateShippingInput,
} from '@ecom/shared';
import * as analytics from '../../services/analytics.service.js';
import * as admin from '../../services/admin.service.js';
import * as orderService from '../../services/order.service.js';
import * as paymentService from '../../services/payment.service.js';
import * as inventory from '../../services/inventory.service.js';
import { allowedTransitions } from '../../services/orderStateMachine.js';
import { validatedBody, validatedParams, validatedQuery } from '../../middleware/validate.js';
import {
  buildPaginationMeta,
  sendCreated,
  sendNoContent,
  sendSuccess,
} from '../../utils/apiResponse.js';
import { Order } from '../../models/order.model.js';
import { AppError } from '../../utils/AppError.js';
import { ERROR_CODES } from '@ecom/shared';

// ── Dashboard ───────────────────────────────────────────────────────────────

/**
 * Everything the dashboard needs, in one response.
 *
 * Six separate endpoints would mean six round trips before the page settles and
 * six chances to render half a dashboard.
 */
export const dashboard: RequestHandler = async (req, res) => {
  const query = validatedQuery<AnalyticsQuery>(req);

  const [summary, salesByDay, topProducts, salesByCategory, recentOrders, topCustomers] =
    await Promise.all([
      analytics.getSummary(query),
      analytics.getSalesByDay(query),
      analytics.getTopProducts(query),
      analytics.getSalesByCategory(query),
      analytics.getRecentOrders(),
      analytics.getTopCustomers(query),
    ]);

  const { current } = analytics.resolveWindow(query);

  sendSuccess(res, {
    range: { from: current.from, to: current.to, preset: query.range },
    summary,
    salesByDay,
    topProducts,
    salesByCategory,
    recentOrders,
    topCustomers,
  });
};

// ── Orders ──────────────────────────────────────────────────────────────────

export const listOrders: RequestHandler = async (req, res) => {
  const query = validatedQuery<AdminOrderQuery>(req);
  const { items, total, page, limit } = await admin.listOrders(query);

  sendSuccess(res, { items }, { meta: buildPaginationMeta(page, limit, total) });
};

export const getOrder: RequestHandler = async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  const { order, payments } = await admin.getOrder(id);

  sendSuccess(res, {
    order,
    payments,
    // The UI renders only legal next states, so a dropdown cannot offer a
    // transition the state machine will refuse.
    allowedTransitions: allowedTransitions(order.status),
  });
};

export const updateOrderStatus: RequestHandler = async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  const { status, note } = validatedBody<UpdateOrderStatusInput>(req);

  const order = await orderService.transition(id, status, {
    actorId: req.user!.id,
    actorType: 'staff',
    note: note || undefined,
  });

  sendSuccess(
    res,
    { order, allowedTransitions: allowedTransitions(order.status) },
    {
      message: `Order marked ${status.replace(/_/g, ' ')}`,
    },
  );
};

export const updateShipping: RequestHandler = async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  const order = await admin.updateShipping(id, validatedBody<UpdateShippingInput>(req));

  sendSuccess(res, { order }, { message: 'Shipping details updated' });
};

export const refundOrder: RequestHandler = async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  const { amount, reason } = validatedBody<RefundOrderInput>(req);

  const order = await paymentService.refundPayment({
    orderId: id,
    amount,
    reason,
    actorId: req.user!.id,
  });

  sendSuccess(res, { order }, { message: 'Refund issued' });
};

export const addOrderNote: RequestHandler = async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  const { note } = validatedBody<OrderNoteInput>(req);

  sendSuccess(
    res,
    { order: await admin.addOrderNote(id, note, req.user!.id) },
    {
      message: 'Note added',
    },
  );
};

// ── Customers ───────────────────────────────────────────────────────────────

export const listCustomers: RequestHandler = async (req, res) => {
  const query = validatedQuery<AdminCustomerQuery>(req);
  const { items, total, page, limit } = await admin.listCustomers(query);

  sendSuccess(res, { items }, { meta: buildPaginationMeta(page, limit, total) });
};

export const getCustomer: RequestHandler = async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  sendSuccess(res, await admin.getCustomer(id));
};

export const updateCustomerStatus: RequestHandler = async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  const { status } = validatedBody<UpdateCustomerStatusInput>(req);

  const user = await admin.updateCustomerStatus(id, status, req.user!.id);
  sendSuccess(res, { user }, { message: `Account ${status}` });
};

export const updateCustomerRole: RequestHandler = async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  const { role } = validatedBody<UpdateCustomerRoleInput>(req);

  const user = await admin.updateCustomerRole(id, role, req.user!.id);
  sendSuccess(res, { user }, { message: `Role changed to ${role}` });
};

// ── Inventory ───────────────────────────────────────────────────────────────

export const listInventory: RequestHandler = async (req, res) => {
  const query = validatedQuery<InventoryQuery>(req);
  const { items, total, page, limit } = await admin.listInventory(query);

  sendSuccess(res, { items }, { meta: buildPaginationMeta(page, limit, total) });
};

export const adjustStock: RequestHandler = async (req, res) => {
  const input = validatedBody<AdjustStockInput>(req);

  const stock = await inventory.adjustStock({
    productId: input.productId,
    variantId: input.variantId,
    delta: input.delta,
    actorId: req.user!.id,
    note: input.note || undefined,
  });

  sendSuccess(
    res,
    { stock },
    {
      message: `Stock ${input.delta > 0 ? 'increased' : 'reduced'} by ${Math.abs(input.delta)}`,
    },
  );
};

export const inventoryHistory: RequestHandler = async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  const variantId = typeof req.query.variantId === 'string' ? req.query.variantId : undefined;

  sendSuccess(res, { items: await admin.getInventoryHistory(id, variantId) });
};

// ── Reviews ─────────────────────────────────────────────────────────────────

export const listReviews: RequestHandler = async (req, res) => {
  const query = validatedQuery<AdminReviewQuery>(req);
  const { items, total, page, limit } = await admin.listReviews(query);

  sendSuccess(res, { items }, { meta: buildPaginationMeta(page, limit, total) });
};

export const moderateReview: RequestHandler = async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  const { status, rejectionReason } = validatedBody<ModerateReviewInput>(req);

  const review = await admin.moderateReview(id, status, req.user!.id, rejectionReason || undefined);
  sendSuccess(res, { review }, { message: `Review ${status}` });
};

export const respondToReview: RequestHandler = async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  const { text } = validatedBody<RespondToReviewInput>(req);

  sendSuccess(
    res,
    { review: await admin.respondToReview(id, text, req.user!.id) },
    {
      message: 'Response published',
    },
  );
};

export const deleteReview: RequestHandler = async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  await admin.deleteReview(id);
  sendNoContent(res);
};

// ── Coupons ─────────────────────────────────────────────────────────────────

export const listCoupons: RequestHandler = async (req, res) => {
  const query = validatedQuery<AdminCouponQuery>(req);
  const { items, total, page, limit } = await admin.listCoupons(query);

  sendSuccess(res, { items }, { meta: buildPaginationMeta(page, limit, total) });
};

export const createCoupon: RequestHandler = async (req, res) => {
  const coupon = await admin.createCoupon(validatedBody<CreateCouponInput>(req), req.user!.id);
  sendCreated(res, { coupon }, `Coupon ${coupon.code} created`);
};

export const updateCoupon: RequestHandler = async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  const coupon = await admin.updateCoupon(id, validatedBody<UpdateCouponInput>(req));

  sendSuccess(res, { coupon }, { message: 'Coupon updated' });
};

export const deactivateCoupon: RequestHandler = async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  const coupon = await admin.deactivateCoupon(id);

  // Deactivated rather than deleted — orders and the redemption ledger
  // reference it.
  sendSuccess(res, { coupon }, { message: `Coupon ${coupon.code} deactivated` });
};

// ── Payments ────────────────────────────────────────────────────────────────

export const listPayments: RequestHandler = async (req, res) => {
  const page = Number(req.query.page ?? 1);
  const { items, total, limit } = await admin.listPayments(page);

  sendSuccess(res, { items }, { meta: buildPaginationMeta(page, limit, total) });
};

/** Guard used before a refund, so the UI can show what remains refundable. */
export const getRefundableAmount: RequestHandler = async (req, res) => {
  const { id } = validatedParams<{ id: string }>(req);
  const order = await Order.findById(id).select('pricing refundedTotal paymentStatus').lean();
  if (!order) throw AppError.notFound('Order', ERROR_CODES.ORDER_NOT_FOUND);

  sendSuccess(res, {
    refundable: Math.max(0, order.pricing.grandTotal - (order.refundedTotal ?? 0)),
    currency: order.pricing.currency,
  });
};
