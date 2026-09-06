import { Router } from 'express';
import healthRoutes from './health.route.js';
import authRoutes from './auth.route.js';
import catalogRoutes from './catalog.route.js';
import cartRoutes from './cart.route.js';
import accountRoutes from './account.route.js';
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
router.use('/account', accountRoutes);

router.use('/admin', adminRoutes);

export default router;
