import { z } from 'zod';
import { csvArray } from './common.js';
import { PAGINATION } from '../constants/limits.js';
import { PRODUCT_SORTS } from '../constants/enums.js';

/**
 * The single definition of "a product listing request".
 *
 * The API validates incoming query strings with it, and the web app parses
 * `useSearchParams()` with the very same schema. That is why a shared URL like
 *
 *   /products?category=footwear&brand=nike&minPrice=1000&color=black&sort=price_asc
 *
 * is guaranteed to mean the same thing on both sides — there is no second,
 * drifting copy of the parsing rules.
 *
 * Everything here compiles down to one indexed MongoDB `$match`; no filtering
 * ever happens in Node.
 */
export const productQuerySchema = z.object({
  // Full-text search across name, sku, brand and tags.
  q: z.string().trim().max(120).optional(),

  // Taxonomy. `category` matches the category *or any of its descendants*,
  // because products denormalize their full ancestor path.
  category: z.string().trim().max(140).optional(),
  brand: csvArray(20).optional(),
  tags: csvArray(20).optional(),

  // Price window, in major currency units.
  minPrice: z.coerce.number().nonnegative().max(10_000_000).optional(),
  maxPrice: z.coerce.number().nonnegative().max(10_000_000).optional(),

  // Minimum average rating, e.g. `rating=4` means "4 stars and up".
  rating: z.coerce.number().min(1).max(5).optional(),

  // Minimum discount percentage, e.g. `discount=30` means "30% off or more".
  discount: z.coerce.number().min(0).max(100).optional(),

  inStock: z.stringbool().optional(),
  featured: z.stringbool().optional(),

  /**
   * Free-form variant attribute filters: `?color=black,white&size=9`.
   * Parsed out of the leftover query keys by `parseAttributeFilters` below so
   * new attributes (material, storage, …) need no schema change.
   */
  attributes: z.record(z.string(), z.array(z.string())).optional(),

  sort: z.enum(PRODUCT_SORTS).default('relevance'),
  page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
});

export type ProductQuery = z.infer<typeof productQuerySchema>;

/** Query keys consumed by the schema above; anything else is an attribute filter. */
const RESERVED_QUERY_KEYS = new Set([
  'q',
  'category',
  'brand',
  'tags',
  'minPrice',
  'maxPrice',
  'rating',
  'discount',
  'inStock',
  'featured',
  'sort',
  'page',
  'limit',
  'attributes',
]);

/** Attribute names the storefront is allowed to filter on (defence in depth: an
 *  attacker cannot invent keys that would widen the `$elemMatch` surface). */
export const FILTERABLE_ATTRIBUTES = [
  'color',
  'size',
  'storage',
  'material',
  'ram',
  'capacity',
  'style',
  'fit',
  'flavour',
  'scent',
] as const;
export type FilterableAttribute = (typeof FILTERABLE_ATTRIBUTES)[number];

const filterableSet = new Set<string>(FILTERABLE_ATTRIBUTES);

/**
 * Pull `?color=black,white&size=9` out of a raw query object into the
 * `attributes` shape the schema expects. Unknown keys are ignored, so tracking
 * params (utm_*, gclid, …) never reach the database layer.
 */
export function parseAttributeFilters(
  raw: Record<string, unknown>,
): Record<string, string[]> | undefined {
  const attributes: Record<string, string[]> = {};

  for (const [key, value] of Object.entries(raw)) {
    const name = key.toLowerCase();
    if (RESERVED_QUERY_KEYS.has(key) || !filterableSet.has(name)) continue;

    const parts = (Array.isArray(value) ? value : String(value ?? '').split(','))
      .map((v) => String(v).trim())
      .filter(Boolean);

    if (parts.length) attributes[name] = [...new Set(parts)].slice(0, 20);
  }

  return Object.keys(attributes).length ? attributes : undefined;
}

/** Parse a full raw query object (Express `req.query` or `URLSearchParams`). */
export function parseProductQuery(raw: Record<string, unknown>): ProductQuery {
  const attributes = parseAttributeFilters(raw);
  return productQuerySchema.parse({ ...raw, ...(attributes ? { attributes } : {}) });
}

/** Turn a parsed query back into a canonical, shareable query string. */
export function serializeProductQuery(query: Partial<ProductQuery>): string {
  const params = new URLSearchParams();
  const put = (k: string, v: unknown) => {
    if (v === undefined || v === null || v === '') return;
    params.set(k, Array.isArray(v) ? v.join(',') : String(v));
  };

  put('q', query.q);
  put('category', query.category);
  put('brand', query.brand);
  put('tags', query.tags);
  put('minPrice', query.minPrice);
  put('maxPrice', query.maxPrice);
  put('rating', query.rating);
  put('discount', query.discount);
  if (query.inStock) put('inStock', '1');
  if (query.featured) put('featured', '1');
  for (const [name, values] of Object.entries(query.attributes ?? {})) put(name, values);
  if (query.sort && query.sort !== 'relevance') put('sort', query.sort);
  if (query.page && query.page > 1) put('page', query.page);
  if (query.limit && query.limit !== PAGINATION.DEFAULT_LIMIT) put('limit', query.limit);

  return params.toString();
}
