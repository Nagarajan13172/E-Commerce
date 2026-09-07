import { Router } from 'express';
import {
  adjustStockSchema,
  adminCouponQuerySchema,
  adminCustomerQuerySchema,
  adminOrderQuerySchema,
  adminReviewQuerySchema,
  analyticsQuerySchema,
  createCouponSchema,
  idParamSchema,
  inventoryQuerySchema,
  moderateReviewSchema,
  orderNoteSchema,
  refundOrderSchema,
  respondToReviewSchema,
  updateCouponSchema,
  updateCustomerRoleSchema,
  updateCustomerStatusSchema,
  updateOrderStatusSchema,
  updateShippingSchema,
} from '@ecom/shared';
import * as admin from '../../../controllers/admin/admin.controller.js';
import { validate } from '../../../middleware/validate.js';
import { requirePermission } from '../../../middleware/rbac.js';
import { PERMISSIONS } from '../../../config/permissions.js';
import { writeLimiter } from '../../../middleware/rateLimit.js';

const router: Router = Router();

/**
 * Admin operations: dashboard, orders, customers, inventory, reviews, coupons.
 *
 * Authentication and staff membership come from the parent admin router; each
 * route declares the specific capability it needs. That is what lets `support`
 * read orders and moderate reviews while only `manager` and `admin` can refund
 * money or change a role.
 */

// ── Dashboard ───────────────────────────────────────────────────────────────
router.get(
  '/dashboard',
  requirePermission(PERMISSIONS.ANALYTICS_READ),
  validate({ query: analyticsQuerySchema }),
  admin.dashboard,
);

// ── Orders ──────────────────────────────────────────────────────────────────
router.get(
  '/orders',
  requirePermission(PERMISSIONS.ORDER_READ),
  validate({ query: adminOrderQuerySchema }),
  admin.listOrders,
);
router.get(
  '/orders/:id',
  requirePermission(PERMISSIONS.ORDER_READ),
  validate({ params: idParamSchema }),
  admin.getOrder,
);
router.patch(
  '/orders/:id/status',
  requirePermission(PERMISSIONS.ORDER_UPDATE_STATUS),
  writeLimiter,
  validate({ params: idParamSchema, body: updateOrderStatusSchema }),
  admin.updateOrderStatus,
);
router.patch(
  '/orders/:id/shipping',
  requirePermission(PERMISSIONS.ORDER_UPDATE_STATUS),
  validate({ params: idParamSchema, body: updateShippingSchema }),
  admin.updateShipping,
);
// Refunding moves money, so it needs its own capability — support cannot.
router.post(
  '/orders/:id/refund',
  requirePermission(PERMISSIONS.ORDER_REFUND),
  writeLimiter,
  validate({ params: idParamSchema, body: refundOrderSchema }),
  admin.refundOrder,
);
router.get(
  '/orders/:id/refundable',
  requirePermission(PERMISSIONS.ORDER_REFUND),
  validate({ params: idParamSchema }),
  admin.getRefundableAmount,
);
router.post(
  '/orders/:id/notes',
  requirePermission(PERMISSIONS.ORDER_NOTE),
  validate({ params: idParamSchema, body: orderNoteSchema }),
  admin.addOrderNote,
);

// ── Customers ───────────────────────────────────────────────────────────────
router.get(
  '/customers',
  requirePermission(PERMISSIONS.CUSTOMER_READ),
  validate({ query: adminCustomerQuerySchema }),
  admin.listCustomers,
);
router.get(
  '/customers/:id',
  requirePermission(PERMISSIONS.CUSTOMER_READ),
  validate({ params: idParamSchema }),
  admin.getCustomer,
);
router.patch(
  '/customers/:id/status',
  requirePermission(PERMISSIONS.CUSTOMER_UPDATE_STATUS),
  validate({ params: idParamSchema, body: updateCustomerStatusSchema }),
  admin.updateCustomerStatus,
);
// Granting roles is privilege escalation, so it is admin-only.
router.patch(
  '/customers/:id/role',
  requirePermission(PERMISSIONS.CUSTOMER_MANAGE_ROLES),
  validate({ params: idParamSchema, body: updateCustomerRoleSchema }),
  admin.updateCustomerRole,
);

// ── Inventory ───────────────────────────────────────────────────────────────
router.get(
  '/inventory',
  requirePermission(PERMISSIONS.INVENTORY_READ),
  validate({ query: inventoryQuerySchema }),
  admin.listInventory,
);
router.post(
  '/inventory/adjust',
  requirePermission(PERMISSIONS.INVENTORY_WRITE),
  writeLimiter,
  validate({ body: adjustStockSchema }),
  admin.adjustStock,
);
router.get(
  '/inventory/:id/history',
  requirePermission(PERMISSIONS.INVENTORY_READ),
  validate({ params: idParamSchema }),
  admin.inventoryHistory,
);

// ── Reviews ─────────────────────────────────────────────────────────────────
router.get(
  '/reviews',
  requirePermission(PERMISSIONS.REVIEW_MODERATE),
  validate({ query: adminReviewQuerySchema }),
  admin.listReviews,
);
router.patch(
  '/reviews/:id/moderate',
  requirePermission(PERMISSIONS.REVIEW_MODERATE),
  validate({ params: idParamSchema, body: moderateReviewSchema }),
  admin.moderateReview,
);
router.post(
  '/reviews/:id/respond',
  requirePermission(PERMISSIONS.REVIEW_MODERATE),
  validate({ params: idParamSchema, body: respondToReviewSchema }),
  admin.respondToReview,
);
router.delete(
  '/reviews/:id',
  requirePermission(PERMISSIONS.REVIEW_MODERATE),
  validate({ params: idParamSchema }),
  admin.deleteReview,
);

// ── Coupons ─────────────────────────────────────────────────────────────────
router.get(
  '/coupons',
  requirePermission(PERMISSIONS.COUPON_WRITE),
  validate({ query: adminCouponQuerySchema }),
  admin.listCoupons,
);
router.post(
  '/coupons',
  requirePermission(PERMISSIONS.COUPON_WRITE),
  validate({ body: createCouponSchema }),
  admin.createCoupon,
);
router.patch(
  '/coupons/:id',
  requirePermission(PERMISSIONS.COUPON_WRITE),
  validate({ params: idParamSchema, body: updateCouponSchema }),
  admin.updateCoupon,
);
router.delete(
  '/coupons/:id',
  requirePermission(PERMISSIONS.COUPON_WRITE),
  validate({ params: idParamSchema }),
  admin.deactivateCoupon,
);

// ── Payments ────────────────────────────────────────────────────────────────
router.get('/payments', requirePermission(PERMISSIONS.PAYMENT_READ), admin.listPayments);

export default router;
