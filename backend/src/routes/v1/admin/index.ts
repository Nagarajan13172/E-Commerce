import { Router } from 'express';
import catalogAdminRoutes from './catalog.admin.route.js';
import { requireAuth } from '../../../middleware/auth.js';
import { requireStaff } from '../../../middleware/rbac.js';

/**
 * Admin API root.
 *
 * `requireAuth` and `requireStaff` are applied here, once, so a new admin route
 * cannot be added without them — forgetting the guard on an individual route is
 * exactly the mistake that leaks an admin endpoint to the public. Per-route
 * `requirePermission` then narrows further.
 */
const router: Router = Router();

router.use(requireAuth);
router.use(requireStaff);

router.use('/', catalogAdminRoutes);

export default router;
