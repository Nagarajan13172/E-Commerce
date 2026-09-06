import { Router } from 'express';
import { slugParamSchema } from '@ecom/shared';
import * as catalog from '../../controllers/catalog.controller.js';
import { validate } from '../../middleware/validate.js';
import { searchLimiter } from '../../middleware/rateLimit.js';

const router: Router = Router();

/**
 * Public catalog. All read-only, no authentication.
 *
 * `searchLimiter` guards the two endpoints that hit the text index — search is
 * the most expensive read in the catalog and the easiest to hammer.
 */

router.get('/home', catalog.getHomepage);

router.get('/products', searchLimiter, catalog.listProducts);
router.get('/products/:slug', validate({ params: slugParamSchema }), catalog.getProduct);
router.get(
  '/products/:slug/related',
  validate({ params: slugParamSchema }),
  catalog.getRelatedProducts,
);

router.get('/search/suggest', searchLimiter, catalog.suggest);

router.get('/categories', catalog.listCategories);
router.get('/categories/:slug', validate({ params: slugParamSchema }), catalog.getCategory);

router.get('/brands', catalog.listBrands);
router.get('/brands/:slug', validate({ params: slugParamSchema }), catalog.getBrand);

export default router;
