import type { AdminProductQuery, CreateProductInput, UpdateProductInput } from '@ecom/shared';
import { ERROR_CODES } from '@ecom/shared';
import { Category } from '../models/category.model.js';
import { Product, type ProductDocument } from '../models/product.model.js';
import { AppError } from '../utils/AppError.js';
import { uniqueSlug } from '../utils/slug.js';
import { escapeRegex } from '../utils/regex.js';
import { cache, cacheKeys, CACHE_TTL } from '../integrations/cache/index.js';
import { getDescendantIds } from './category.service.js';

/**
 * Product lifecycle.
 *
 * Two invariants this service is responsible for, both of which exist to keep
 * reads cheap and must therefore never be bypassed by writing to the model
 * directly:
 *
 * 1. `categoryPath` = the product's categories plus every ancestor, so a filter
 *    on a top-level category matches without a join.
 * 2. The variant rollups (`priceRange`, `inStock`, `attributes`, …), which the
 *    model's pre-save hook recomputes — which is why writes go through
 *    `document.save()` rather than `updateOne`.
 */

// ── Public reads ────────────────────────────────────────────────────────────

export async function getProductBySlug(slug: string) {
  return cache.wrap(cacheKeys.productBySlug(slug), CACHE_TTL.SHORT, async () => {
    const product = await Product.findOne({
      slug,
      status: 'active',
      deletedAt: { $exists: false },
    })
      .populate('brand', 'name slug logo')
      .populate('categories', 'name slug path')
      .lean();

    if (!product) throw AppError.notFound('Product', ERROR_CODES.PRODUCT_NOT_FOUND);
    return product;
  });
}

/**
 * Related products.
 *
 * Same category first, then same brand, excluding the product itself. Cheap and
 * good enough; a recommendation engine is a Phase-8 concern, not a reason to
 * ship an empty rail now.
 */
export async function getRelatedProducts(productId: string, limit = 8) {
  const product = await Product.findById(productId).select('categoryPath brand').lean();
  if (!product) return [];

  return Product.find({
    _id: { $ne: productId },
    status: 'active',
    deletedAt: { $exists: false },
    $or: [
      { categoryPath: { $in: product.categoryPath } },
      ...(product.brand ? [{ brand: product.brand }] : []),
    ],
  })
    .select(
      'name slug thumbnail images price compareAtPrice priceRange discountPercent rating inStock',
    )
    .sort({ soldCount: -1, 'rating.average': -1 })
    .limit(limit)
    .lean();
}

/** Fire-and-forget view counter; never blocks or fails a page render. */
export async function incrementViewCount(productId: string): Promise<void> {
  await Product.updateOne({ _id: productId }, { $inc: { viewCount: 1 } }).catch(() => undefined);
}

/**
 * Homepage rails, assembled in one round trip.
 *
 * A separate request per rail would mean five sequential queries before the
 * page can render; `Promise.all` over projected, limited queries keeps the
 * homepage a single fast response.
 */
export async function getHomepageSections() {
  return cache.wrap(cacheKeys.homepage(), CACHE_TTL.MEDIUM, async () => {
    const listProjection =
      'name slug thumbnail images price compareAtPrice priceRange discountPercent rating inStock totalStock variantCount brand isNewArrival isBestseller';

    const visible = { status: 'active' as const, deletedAt: { $exists: false } };

    const [featured, bestsellers, newArrivals, deals, featuredCategories] = await Promise.all([
      Product.find({ ...visible, isFeatured: true })
        .select(listProjection)
        .populate('brand', 'name slug')
        .sort({ soldCount: -1 })
        .limit(8)
        .lean(),
      Product.find({ ...visible, isBestseller: true })
        .select(listProjection)
        .populate('brand', 'name slug')
        .sort({ soldCount: -1 })
        .limit(8)
        .lean(),
      Product.find({ ...visible, isNewArrival: true })
        .select(listProjection)
        .populate('brand', 'name slug')
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
      Product.find({ ...visible, discountPercent: { $gte: 20 } })
        .select(listProjection)
        .populate('brand', 'name slug')
        .sort({ discountPercent: -1 })
        .limit(8)
        .lean(),
      Category.find({ status: 'active', isFeatured: true })
        .select('name slug image productCount')
        .sort({ order: 1 })
        .limit(8)
        .lean(),
    ]);

    return { featured, bestsellers, newArrivals, deals, featuredCategories };
  });
}

// ── Admin reads ─────────────────────────────────────────────────────────────

export async function listProductsForAdmin(query: AdminProductQuery) {
  const filter: Record<string, unknown> = {};

  if (!query.includeDeleted) filter.deletedAt = { $exists: false };
  if (query.status) filter.status = query.status;
  if (query.brand) filter.brand = query.brand;

  if (query.category) {
    // Admin filtering also spans descendants, matching what the storefront does.
    filter.categoryPath = { $in: await getDescendantIds(query.category) };
  }

  if (query.q) {
    // Admins search by SKU as often as by name, and expect partial matches on
    // both — which `$text` (whole-word only) cannot do. An anchored regex on the
    // indexed fields is the right tool at admin-list scale.
    const term = escapeRegex(query.q);
    filter.$or = [
      { name: { $regex: term, $options: 'i' } },
      { sku: { $regex: `^${term}`, $options: 'i' } },
      { 'variants.sku': { $regex: `^${term}`, $options: 'i' } },
    ];
  }

  if (query.lowStock) {
    // A product is low when any active variant is at or below its threshold.
    filter.$expr = {
      $anyElementTrue: {
        $map: {
          input: '$variants',
          as: 'v',
          in: { $lte: ['$$v.stock.available', '$$v.stock.lowStockThreshold'] },
        },
      },
    };
  }

  const sortMap: Record<AdminProductQuery['sort'], Record<string, 1 | -1>> = {
    newest: { createdAt: -1 },
    oldest: { createdAt: 1 },
    name_asc: { name: 1 },
    name_desc: { name: -1 },
    price_asc: { 'priceRange.min': 1 },
    price_desc: { 'priceRange.max': -1 },
    stock_asc: { totalStock: 1 },
  };

  const skip = (query.page - 1) * query.limit;

  const [items, total] = await Promise.all([
    Product.find(filter)
      .select(
        'name slug sku thumbnail status price priceRange totalStock inStock variantCount brand isFeatured isBestseller rating createdAt updatedAt deletedAt',
      )
      .populate('brand', 'name slug')
      .sort({ ...sortMap[query.sort], _id: -1 })
      .skip(skip)
      .limit(query.limit)
      .lean(),
    Product.countDocuments(filter),
  ]);

  return { items, total, page: query.page, limit: query.limit };
}

export async function getProductForAdmin(id: string) {
  const product = await Product.findById(id)
    .populate('brand', 'name slug')
    .populate('categories', 'name slug path')
    .lean();

  if (!product) throw AppError.notFound('Product', ERROR_CODES.PRODUCT_NOT_FOUND);
  return product;
}

// ── Writes ──────────────────────────────────────────────────────────────────

export async function createProduct(input: CreateProductInput): Promise<ProductDocument> {
  const categoryPath = await buildCategoryPath(input.categories);

  const product = new Product({
    ...input,
    brand: input.brand || undefined,
    slug: await uniqueSlug(Product, input.slug ?? input.name),
    categoryPath,
  });

  await product.save();
  await invalidate(product.slug);
  return product;
}

export async function updateProduct(
  id: string,
  input: UpdateProductInput,
): Promise<ProductDocument> {
  const product = await Product.findById(id);
  if (!product) throw AppError.notFound('Product', ERROR_CODES.PRODUCT_NOT_FOUND);

  const previousSlug = product.slug;

  if (input.slug && input.slug !== product.slug) {
    input.slug = await uniqueSlug(Product, input.slug, id);
  }

  if (input.categories) {
    product.categoryPath = (await buildCategoryPath(input.categories)) as never;
  }

  // `brand: ''` is how the admin form clears a brand; an empty string would
  // fail ObjectId casting, so it is normalised to undefined.
  if (input.brand !== undefined) {
    product.brand = (input.brand || undefined) as never;
  }

  // Variants are merged, never replaced wholesale.
  //
  // `reserved` and `sold` are derived from checkout activity and are not part
  // of the update schema, so assigning the incoming array directly let Mongoose
  // refill them from their schema defaults — silently zeroing both. Zeroing
  // `sold` loses history; zeroing `reserved` is far worse, because units held
  // for an in-flight checkout become invisible and can be sold a second time.
  // Editing a product's name must never be able to cause an oversell.
  if (input.variants) {
    const existing = new Map(product.variants.map((v) => [String(v._id), v]));

    input.variants = input.variants.map((incoming) => {
      const current = incoming._id ? existing.get(String(incoming._id)) : undefined;
      if (!current) return incoming;

      return {
        ...incoming,
        stock: {
          // `available` and the threshold are the admin's to set; the other two
          // belong to the reservation system alone.
          available: incoming.stock?.available ?? current.stock.available,
          lowStockThreshold: incoming.stock?.lowStockThreshold ?? current.stock.lowStockThreshold,
          reserved: current.stock.reserved,
          sold: current.stock.sold,
        },
      } as typeof incoming;
    });
  }

  for (const [key, value] of Object.entries(input)) {
    if (key === 'brand' || value === undefined) continue;
    (product as unknown as Record<string, unknown>)[key] = value;
  }

  // Re-check the invariants the create schema enforces. The update schema is a
  // partial and cannot express cross-field rules, so they are validated here
  // against the merged document — where the full post-update state is known.
  assertProductInvariants(product);

  await product.save();
  await invalidate(previousSlug, product.slug);
  return product;
}

/**
 * Soft delete.
 *
 * Orders snapshot their products, but they also keep a product reference for
 * "buy it again" and sales reporting. Hard-deleting would break those links, so
 * a product is archived and hidden rather than removed.
 */
export async function softDeleteProduct(id: string): Promise<void> {
  const product = await Product.findById(id);
  if (!product) throw AppError.notFound('Product', ERROR_CODES.PRODUCT_NOT_FOUND);

  product.deletedAt = new Date();
  product.status = 'archived';
  await product.save();
  await invalidate(product.slug);
}

export async function restoreProduct(id: string): Promise<ProductDocument> {
  const product = await Product.findById(id);
  if (!product) throw AppError.notFound('Product', ERROR_CODES.PRODUCT_NOT_FOUND);

  product.deletedAt = undefined;
  product.status = 'draft';
  await product.save();
  await invalidate(product.slug);
  return product;
}

/**
 * Duplicate a product as a draft.
 *
 * SKUs are unique, so the copy gets suffixed SKUs at every level — product and
 * each variant — otherwise the insert would fail on the unique index.
 */
export async function duplicateProduct(id: string): Promise<ProductDocument> {
  const source = await Product.findById(id).lean();
  if (!source) throw AppError.notFound('Product', ERROR_CODES.PRODUCT_NOT_FOUND);

  const suffix = Date.now().toString(36).slice(-4).toUpperCase();

  const {
    _id: _ignoredId,
    createdAt: _ignoredCreated,
    updatedAt: _ignoredUpdated,
    ...rest
  } = source;

  const copy = new Product({
    ...rest,
    name: `${source.name} (Copy)`,
    slug: await uniqueSlug(Product, `${source.name}-copy`),
    sku: `${source.sku}-${suffix}`,
    variants: source.variants.map((variant) => ({
      ...variant,
      _id: undefined,
      sku: `${variant.sku}-${suffix}`,
      // A duplicate starts with no stock: copying inventory would invent units
      // that do not physically exist.
      stock: { ...variant.stock, available: 0, reserved: 0, sold: 0 },
    })),
    status: 'draft',
    publishedAt: undefined,
    soldCount: 0,
    viewCount: 0,
    rating: { average: 0, count: 0, buckets: [0, 0, 0, 0, 0] },
    deletedAt: undefined,
  });

  await copy.save();
  return copy;
}

export async function bulkAction(
  ids: string[],
  action: 'publish' | 'unpublish' | 'archive' | 'restore' | 'feature' | 'unfeature' | 'delete',
): Promise<number> {
  const updates: Record<typeof action, Record<string, unknown>> = {
    publish: { $set: { status: 'active', publishedAt: new Date() } },
    unpublish: { $set: { status: 'draft' } },
    archive: { $set: { status: 'archived' } },
    restore: { $set: { status: 'draft' }, $unset: { deletedAt: '' } },
    feature: { $set: { isFeatured: true } },
    unfeature: { $set: { isFeatured: false } },
    delete: { $set: { deletedAt: new Date(), status: 'archived' } },
  };

  const result = await Product.updateMany({ _id: { $in: ids } }, updates[action]);
  await cache.delByPrefix('product:');
  await cache.del(cacheKeys.homepage());
  return result.modifiedCount;
}

// ── Internals ───────────────────────────────────────────────────────────────

/** Expand a product's categories into itself-plus-ancestors. */
async function buildCategoryPath(categoryIds: string[]): Promise<string[]> {
  if (!categoryIds.length) return [];

  const categories = await Category.find({ _id: { $in: categoryIds } })
    .select('ancestors')
    .lean();

  const path = new Set<string>();
  for (const category of categories) {
    path.add(String(category._id));
    for (const ancestor of category.ancestors) path.add(String(ancestor));
  }
  return [...path];
}

function assertProductInvariants(product: ProductDocument): void {
  if (product.compareAtPrice && product.compareAtPrice < product.price) {
    throw AppError.validation('Validation failed', [
      { field: 'compareAtPrice', message: 'Compare-at price must be at least the selling price' },
    ]);
  }

  const skus = product.variants.map((v) => v.sku);
  if (new Set(skus).size !== skus.length) {
    throw AppError.validation('Validation failed', [
      { field: 'variants', message: 'Variant SKUs must be unique' },
    ]);
  }

  if (product.options.length > 0) {
    const optionNames = new Set(product.options.map((o) => o.name));
    const malformed = product.variants.some(
      (v) =>
        v.optionValues.length !== product.options.length ||
        v.optionValues.some((ov) => !optionNames.has(ov.name)),
    );
    if (malformed) {
      throw AppError.validation('Validation failed', [
        {
          field: 'variants',
          message: 'Each variant must specify a value for every declared option',
        },
      ]);
    }
  }
}

async function invalidate(...slugs: (string | undefined)[]): Promise<void> {
  await Promise.all([
    ...slugs.filter(Boolean).map((slug) => cache.del(cacheKeys.productBySlug(slug!))),
    cache.del(cacheKeys.homepage()),
    cache.delByPrefix('product:facets'),
  ]);
}
