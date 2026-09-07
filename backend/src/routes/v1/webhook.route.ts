import { Router } from 'express';
import * as order from '../../controllers/order.controller.js';

const router: Router = Router();

/**
 * Payment webhooks.
 *
 * Deliberately outside every other guard:
 *  - no authentication — the caller is the provider, not a user;
 *  - no CSRF — there are no cookies to abuse (see `csrf.ts`);
 *  - no JSON parsing — the signature covers the exact bytes received, so the
 *    raw body is captured in `app.ts` before `express.json()` can reserialise
 *    it and break the HMAC.
 *
 * The HMAC signature is the authentication.
 */
router.post('/payments/:provider', order.paymentWebhook);

export default router;
