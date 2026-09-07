import { Router } from 'express';
import healthRoutes from './health.route.js';
import authRoutes from './auth.route.js';
import catalogRoutes from './catalog.route.js';
import cartRoutes from './cart.route.js';
import checkoutRoutes from './checkout.route.js';
import accountRoutes from './account.route.js';
import ordersRoutes from './orders.route.js';
import paymentRoutes from './payment.route.js';
import webhookRoutes from './webhook.route.js';
import adminRoutes from './admin/index.js';

/**
 * Versioned API surface. Everything is mounted under `env.API_PREFIX`
 * (default `/api/v1`), so a future v2 can run alongside v1 rather than
 * breaking existing clients.
 */
const router: Router = Router();

router.use('/health', healthRoutes);
router.use('/auth', authRoutes);

// Public catalog is mounted at the root so paths read /products, /categories …
router.use('/', catalogRoutes);

router.use('/cart', cartRoutes);
router.use('/checkout', checkoutRoutes);
router.use('/account', accountRoutes);

// Each router is mounted at its OWN prefix. Nothing that applies `requireAuth`
// router-wide may be mounted at '/', or its guard would run for every sibling
// path — including the webhooks below, which have no session by design.
router.use('/orders', ordersRoutes);
router.use('/payments', paymentRoutes);

// Webhooks carry no cookies and are authenticated by HMAC; see webhook.route.ts.
router.use('/webhooks', webhookRoutes);

router.use('/admin', adminRoutes);

export default router;
