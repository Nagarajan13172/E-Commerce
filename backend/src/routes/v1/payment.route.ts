import { Router } from 'express';
import { simulatePaymentSchema, verifyPaymentSchema } from '@ecom/shared';
import * as order from '../../controllers/order.controller.js';
import { validate } from '../../middleware/validate.js';
import { requireAuth } from '../../middleware/auth.js';
import { writeLimiter } from '../../middleware/rateLimit.js';

const router: Router = Router();

/** Mounted at `/payments`, so this guard cannot leak onto sibling routes. */
router.use(requireAuth);

router.post('/verify', writeLimiter, validate({ body: verifyPaymentSchema }), order.verifyPayment);

// Development only — the controller refuses unless the mock provider is active.
router.post('/simulate', validate({ body: simulatePaymentSchema }), order.simulatePayment);

export default router;
