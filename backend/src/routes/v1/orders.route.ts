import { Router } from 'express';
import { z } from 'zod';
import { cancelOrderSchema, orderListQuerySchema } from '@ecom/shared';
import * as order from '../../controllers/order.controller.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { writeLimiter } from '../../middleware/rateLimit.js';

const router: Router = Router();

const orderNumberParam = z.object({
  orderNumber: z.string().regex(/^ORD-\d{8}-\d{6}$/, 'Not a valid order number'),
});

/**
 * A customer's own orders.
 *
 * `requireAuth` is applied router-wide, which is safe *because this router is
 * mounted at `/orders`* rather than at the root. A router that guards every
 * request must never be mounted at `/`: Express would run its middleware for
 * every path that reaches it, silently requiring authentication on unrelated
 * sibling routes — including webhooks, which have no session at all.
 */
router.use(requireAuth);

router.get('/', validate({ query: orderListQuerySchema }), order.listMyOrders);
router.get('/:orderNumber', validate({ params: orderNumberParam }), order.getMyOrder);
router.post(
  '/:orderNumber/cancel',
  writeLimiter,
  validate({ params: orderNumberParam, body: cancelOrderSchema }),
  order.cancelMyOrder,
);

export default router;
