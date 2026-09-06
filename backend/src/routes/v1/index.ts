import { Router } from 'express';
import healthRoutes from './health.route.js';

/**
 * Versioned API surface. Everything is mounted under `env.API_PREFIX`
 * (default `/api/v1`), so a future v2 can run alongside v1 rather than
 * breaking existing clients.
 */
const router: Router = Router();

router.use('/health', healthRoutes);

export default router;
