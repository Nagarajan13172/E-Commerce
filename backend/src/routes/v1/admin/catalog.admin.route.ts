import { Router } from 'express';
import {
  adminProductQuerySchema,
  bulkProductActionSchema,
  confirmUploadSchema,
  createBrandSchema,
  createCategorySchema,
  createProductSchema,
  idParamSchema,
  presignUploadSchema,
  reorderCategoriesSchema,
  updateBrandSchema,
  updateCategorySchema,
  updateProductSchema,
} from '@ecom/shared';
import * as admin from '../../../controllers/admin/catalog.admin.controller.js';
import { validate } from '../../../middleware/validate.js';
import { requirePermission } from '../../../middleware/rbac.js';
import { PERMISSIONS } from '../../../config/permissions.js';
import { writeLimiter } from '../../../middleware/rateLimit.js';

const router: Router = Router();

/**
 * Admin catalog routes.
 *
 * Authentication and staff membership are applied by the parent admin router;
 * each route additionally declares the specific capability it needs. That is
 * what lets `support` read the catalog while only `manager` and `admin` can
 * change it — without a single role name appearing in this file.
 */

// ── Products ────────────────────────────────────────────────────────────────
router.get(
  '/products',
  requirePermission(PERMISSIONS.PRODUCT_READ),
  validate({ query: adminProductQuerySchema }),
  admin.listProducts,
);
router.get(
  '/products/:id',
  requirePermission(PERMISSIONS.PRODUCT_READ),
  validate({ params: idParamSchema }),
  admin.getProduct,
);
router.post(
  '/products',
  requirePermission(PERMISSIONS.PRODUCT_WRITE),
  writeLimiter,
  validate({ body: createProductSchema }),
  admin.createProduct,
);
router.patch(
  '/products/:id',
  requirePermission(PERMISSIONS.PRODUCT_WRITE),
  writeLimiter,
  validate({ params: idParamSchema, body: updateProductSchema }),
  admin.updateProduct,
);
router.delete(
  '/products/:id',
  requirePermission(PERMISSIONS.PRODUCT_DELETE),
  validate({ params: idParamSchema }),
  admin.deleteProduct,
);
router.post(
  '/products/:id/restore',
  requirePermission(PERMISSIONS.PRODUCT_WRITE),
  validate({ params: idParamSchema }),
  admin.restoreProduct,
);
router.post(
  '/products/:id/duplicate',
  requirePermission(PERMISSIONS.PRODUCT_WRITE),
  validate({ params: idParamSchema }),
  admin.duplicateProduct,
);
router.post(
  '/products/bulk',
  requirePermission(PERMISSIONS.PRODUCT_WRITE),
  writeLimiter,
  validate({ body: bulkProductActionSchema }),
  admin.bulkProductAction,
);

// ── Categories ──────────────────────────────────────────────────────────────
router.get('/categories', requirePermission(PERMISSIONS.PRODUCT_READ), admin.listCategories);
router.post(
  '/categories',
  requirePermission(PERMISSIONS.CATEGORY_WRITE),
  validate({ body: createCategorySchema }),
  admin.createCategory,
);
router.patch(
  '/categories/:id',
  requirePermission(PERMISSIONS.CATEGORY_WRITE),
  validate({ params: idParamSchema, body: updateCategorySchema }),
  admin.updateCategory,
);
router.delete(
  '/categories/:id',
  requirePermission(PERMISSIONS.CATEGORY_WRITE),
  validate({ params: idParamSchema }),
  admin.deleteCategory,
);
router.post(
  '/categories/reorder',
  requirePermission(PERMISSIONS.CATEGORY_WRITE),
  validate({ body: reorderCategoriesSchema }),
  admin.reorderCategories,
);

// ── Brands ──────────────────────────────────────────────────────────────────
router.get('/brands', requirePermission(PERMISSIONS.PRODUCT_READ), admin.listBrands);
router.post(
  '/brands',
  requirePermission(PERMISSIONS.BRAND_WRITE),
  validate({ body: createBrandSchema }),
  admin.createBrand,
);
router.patch(
  '/brands/:id',
  requirePermission(PERMISSIONS.BRAND_WRITE),
  validate({ params: idParamSchema, body: updateBrandSchema }),
  admin.updateBrand,
);
router.delete(
  '/brands/:id',
  requirePermission(PERMISSIONS.BRAND_WRITE),
  validate({ params: idParamSchema }),
  admin.deleteBrand,
);

// ── Media ───────────────────────────────────────────────────────────────────
router.get('/media', requirePermission(PERMISSIONS.MEDIA_WRITE), admin.listMedia);
router.post(
  '/media/presign',
  requirePermission(PERMISSIONS.MEDIA_WRITE),
  writeLimiter,
  validate({ body: presignUploadSchema }),
  admin.presignUpload,
);
router.post(
  '/media/confirm',
  requirePermission(PERMISSIONS.MEDIA_WRITE),
  validate({ body: confirmUploadSchema }),
  admin.confirmUpload,
);
router.delete(
  '/media/:id',
  requirePermission(PERMISSIONS.MEDIA_DELETE),
  validate({ params: idParamSchema }),
  admin.deleteMedia,
);

export default router;
