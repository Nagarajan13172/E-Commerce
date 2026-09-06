import type { RequestHandler } from 'express';
import { parseProductQuery, type ProductQuery } from '@ecom/shared';
import * as productService from '../services/product.service.js';
import * as categoryService from '../services/category.service.js';
import * as brandService from '../services/brand.service.js';
import { searchService } from '../services/search/index.js';
import { sendSuccess, buildPaginationMeta } from '../utils/apiResponse.js';
import { validatedParams } from '../middleware/validate.js';

/**
 * Public catalog endpoints.
 *
 * The query string is parsed with `parseProductQuery` from the shared package —
 * the same function the storefront uses on `useSearchParams()`. That is what
 * guarantees a shared filter URL means the same thing in the browser and on the
 * server.
 */

export const listProducts: RequestHandler = async (req, res) => {
  // Parsed here rather than by the validate() middleware because attribute
  // filters are dynamic (?color=black&size=9) and must be collected from the
  // leftover query keys, which a fixed schema cannot express.
  const query: ProductQuery = parseProductQuery(req.query as Record<string, unknown>);
  const result = await searchService.search(query);

  sendSuccess(
    res,
    { items: result.items, facets: result.facets },
    { meta: buildPaginationMeta(result.page, result.limit, result.total) },
  );
};

export const getProduct: RequestHandler = async (req, res) => {
  const { slug } = validatedParams<{ slug: string }>(req);
  const product = await productService.getProductBySlug(slug);

  // Fire-and-forget: a view counter must never delay or fail a page render.
  void productService.incrementViewCount(String(product._id));

  sendSuccess(res, { product });
};

export const getRelatedProducts: RequestHandler = async (req, res) => {
  const { slug } = validatedParams<{ slug: string }>(req);
  const product = await productService.getProductBySlug(slug);
  const related = await productService.getRelatedProducts(String(product._id));

  sendSuccess(res, { items: related });
};

export const suggest: RequestHandler = async (req, res) => {
  const term = typeof req.query.q === 'string' ? req.query.q : '';
  const result = await searchService.suggest(term);

  sendSuccess(res, result);
};

export const listCategories: RequestHandler = async (_req, res) => {
  const tree = await categoryService.getCategoryTree();
  sendSuccess(res, { items: tree });
};

export const getCategory: RequestHandler = async (req, res) => {
  const { slug } = validatedParams<{ slug: string }>(req);
  const category = await categoryService.getCategoryBySlug(slug);

  sendSuccess(res, { category });
};

export const listBrands: RequestHandler = async (_req, res) => {
  const items = await brandService.listBrands();
  sendSuccess(res, { items });
};

export const getBrand: RequestHandler = async (req, res) => {
  const { slug } = validatedParams<{ slug: string }>(req);
  const brand = await brandService.getBrandBySlug(slug);

  sendSuccess(res, { brand });
};

/** Every homepage rail in one response, so the page needs a single request. */
export const getHomepage: RequestHandler = async (_req, res) => {
  const sections = await productService.getHomepageSections();
  sendSuccess(res, sections);
};
