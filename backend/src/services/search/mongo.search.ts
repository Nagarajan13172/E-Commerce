import { Types, type PipelineStage } from 'mongoose';
import type { ProductQuery, ProductSort } from '@ecom/shared';
import { Product } from '../../models/product.model.js';
import { Category } from '../../models/category.model.js';
import { Brand } from '../../models/brand.model.js';
import type {
  FacetBucket,
  SearchFacets,
  SearchResult,
  SearchResultItem,
  SearchService,
} from './SearchService.js';
import { escapeRegex } from '../../utils/regex.js';

/**
 * MongoDB-backed product search.
 *
 * Design rules this file exists to enforce:
 *
 * 1. **Everything happens in the database.** Filtering, sorting, pagination and
 *    facet counting are all pipeline stages. Nothing is loaded into Node to be
 *    filtered there — that pattern works on 200 seeded products and collapses on
 *    50,000.
 *
 * 2. **One round trip.** `$facet` computes the page of results, the total count
 *    and every facet bucket in a single aggregation, so a listing page is one
 *    query rather than six.
 *
 * 3. **Facets exclude their own dimension.** Brand counts are computed *without*
 *    the brand filter applied, which is what makes multi-select checkboxes
 *    behave correctly — after ticking "Nike" you can still see how many Adidas
 *    products are available. Applying every filter to every facet would show
 *    zeroes beside all the unticked boxes.
 */

/** Only active, non-deleted products are ever visible to the storefront. */
const VISIBLE: PipelineStage.Match['$match'] = {
  status: 'active',
  deletedAt: { $exists: false },
};

/** Shape returned by the listing pipeline. `$slice` here is aggregation syntax. */
const AGGREGATE_PROJECTION = {
  name: 1,
  slug: 1,
  sku: 1,
  thumbnail: 1,
  images: { $slice: ['$images', 2] },
  brand: 1,
  price: 1,
  compareAtPrice: 1,
  priceRange: 1,
  discountPercent: 1,
  inStock: 1,
  totalStock: 1,
  variantCount: 1,
  rating: 1,
  isFeatured: 1,
  isBestseller: 1,
  isNewArrival: 1,
  tags: 1,
  createdAt: 1,
} as const;

/**
 * The same fields for `find()`, which takes a different `$slice` form —
 * a count, not an expression. Keeping them separate avoids a cast that would
 * hide a genuine mismatch.
 */
const FIND_PROJECTION = {
  ...AGGREGATE_PROJECTION,
  images: { $slice: 2 },
} as const;

interface FilterParts {
  /** Applied to results and to every facet. */
  base: Record<string, unknown>;
  /** Applied only to results — each is excluded from its own facet. */
  brand?: Record<string, unknown>;
  attributes?: Record<string, unknown>;
}

export class MongoSearchService implements SearchService {
  async search(query: ProductQuery): Promise<SearchResult> {
    // Both filters arrive from the URL as human-readable slugs and must be
    // resolved to ObjectIds before they can be matched.
    const [categoryIds, brandIds] = await Promise.all([
      this.resolveCategory(query.category),
      this.resolveBrands(query.brand),
    ]);
    const parts = this.buildFilters(query, categoryIds, brandIds);

    const resultMatch = {
      ...parts.base,
      ...(parts.brand ?? {}),
      ...(parts.attributes ?? {}),
    };

    const skip = (query.page - 1) * query.limit;

    // `$text` is only legal in the FIRST stage of a pipeline, so when a search
    // term is present it must lead — which is also why the text match lives in
    // `base` rather than being appended later.
    const pipeline: PipelineStage[] = [
      { $match: resultMatch },
      {
        $facet: {
          items: [
            { $sort: this.buildSort(query.sort, Boolean(query.q)) },
            { $skip: skip },
            { $limit: query.limit },
            {
              $lookup: {
                from: 'brands',
                localField: 'brand',
                foreignField: '_id',
                as: 'brandDoc',
                pipeline: [{ $project: { name: 1, slug: 1 } }],
              },
            },
            {
              $project: {
                ...AGGREGATE_PROJECTION,
                brand: { $first: '$brandDoc' },
              },
            },
          ],
          total: [{ $count: 'count' }],
        },
      },
    ];

    const [resultPage, facets] = await Promise.all([
      Product.aggregate(pipeline).exec(),
      this.buildFacets(parts),
    ]);

    const bucket = resultPage[0] as
      { items: SearchResultItem[]; total: { count: number }[] } | undefined;

    const items = bucket?.items ?? [];
    const total = bucket?.total[0]?.count ?? 0;

    return {
      items,
      total,
      page: query.page,
      limit: query.limit,
      totalPages: Math.ceil(total / query.limit),
      facets,
    };
  }

  /**
   * Typeahead.
   *
   * Deliberately not the search pipeline: suggestions fire on every keystroke,
   * so this is projected, hard-capped, and does no faceting or counting.
   *
   * It also deliberately does NOT use `$text`. MongoDB's text index matches
   * whole words only — typing "lin" finds nothing, and the first useful
   * suggestion would not appear until the user had typed all of "linen". That is
   * the opposite of what autocomplete is for, so this uses a substring regex.
   *
   * The honest trade-off: a non-anchored regex cannot use an index, so this is
   * O(collection). Fine at catalog scale (a projected scan of a few thousand
   * documents is single-digit milliseconds) and a real problem well before a
   * million — which is exactly the point at which the `SearchService` interface
   * earns its keep and an Atlas Search or Elasticsearch adapter replaces this
   * one, with no change above the interface.
   */
  async suggest(term: string, limit = 8) {
    const trimmed = term.trim();
    if (trimmed.length < 2) return { products: [], terms: [] };

    const pattern = escapeRegex(trimmed);

    const products = await Product.find(
      {
        ...VISIBLE,
        $or: [
          { name: { $regex: pattern, $options: 'i' } },
          { sku: { $regex: `^${pattern}`, $options: 'i' } },
        ],
      },
      FIND_PROJECTION,
    )
      // Rank what sells and what is well-reviewed above the rest, since there is
      // no relevance score to sort on without `$text`.
      .sort({ soldCount: -1, 'rating.average': -1 })
      .limit(limit)
      .lean();

    // Tag suggestions give the user a broader query to jump to, not just an
    // exact product — "running" rather than one specific shoe.
    const tagMatches = await Product.aggregate<{ _id: string }>([
      { $match: { ...VISIBLE, tags: { $regex: `^${escapeRegex(trimmed)}`, $options: 'i' } } },
      { $unwind: '$tags' },
      { $match: { tags: { $regex: `^${escapeRegex(trimmed)}`, $options: 'i' } } },
      { $group: { _id: '$tags' } },
      { $limit: 5 },
    ]);

    return {
      products: products as unknown as SearchResultItem[],
      terms: tagMatches.map((t) => t._id),
    };
  }

  // ── Filter construction ───────────────────────────────────────────────────
  //
  // Both resolvers below return ObjectIds rather than strings, and that is not
  // incidental: aggregation pipelines BYPASS Mongoose's schema casting.
  // `find({ categoryPath: '65f…' })` works because Mongoose casts the string
  // using the schema; `aggregate([{ $match: { categoryPath: '65f…' } }])` does
  // not — it compares a string to ObjectId values and silently matches nothing,
  // with no error to signal the mistake.

  /**
   * A category slug matches that category *and everything beneath it*, because
   * products denormalize their full ancestor path into `categoryPath`.
   */
  private async resolveCategory(slug?: string): Promise<Types.ObjectId[] | undefined> {
    if (!slug) return undefined;
    const category = await Category.findOne({ slug, status: 'active' as const })
      .select('_id')
      .lean();
    // An unknown slug yields an empty array, which correctly matches nothing
    // rather than being ignored and showing the entire catalog.
    return category ? [category._id] : [];
  }

  /** Brand slugs from the URL → ObjectIds, since products store a brand ref. */
  private async resolveBrands(slugs?: string[]): Promise<Types.ObjectId[] | undefined> {
    if (!slugs?.length) return undefined;
    const brands = await Brand.find({ slug: { $in: slugs }, status: 'active' as const })
      .select('_id')
      .lean();
    return brands.map((b) => b._id);
  }

  private buildFilters(
    query: ProductQuery,
    categoryIds?: Types.ObjectId[],
    brandIds?: Types.ObjectId[],
  ): FilterParts {
    const base: Record<string, unknown> = { ...VISIBLE };

    if (query.q) base.$text = { $search: query.q };

    if (categoryIds) {
      // `categoryPath` holds the product's categories plus every ancestor, so
      // matching a top-level id here also matches everything nested beneath it.
      base.categoryPath = { $in: categoryIds };
    }

    if (query.tags?.length) base.tags = { $in: query.tags };

    // Price is compared against the variant range so a product is included when
    // ANY of its variants falls inside the window.
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      const range: Record<string, number> = {};
      if (query.minPrice !== undefined) range.$gte = query.minPrice;
      if (query.maxPrice !== undefined) range.$lte = query.maxPrice;
      base['priceRange.min'] = range;
    }

    if (query.rating !== undefined) base['rating.average'] = { $gte: query.rating };
    if (query.discount !== undefined) base.discountPercent = { $gte: query.discount };
    if (query.inStock) base.inStock = true;
    if (query.featured) base.isFeatured = true;

    const parts: FilterParts = { base };

    if (brandIds) {
      parts.brand = { brand: { $in: brandIds } };
    }

    // Each selected attribute must match (AND across attributes), while values
    // within one attribute are alternatives (OR) — "black or white, in size 9".
    const attributeEntries = Object.entries(query.attributes ?? {});
    if (attributeEntries.length) {
      parts.attributes = {
        $and: attributeEntries.map(([name, values]) => ({
          attributes: { $elemMatch: { k: name, v: { $in: values.map((v) => v.toLowerCase()) } } },
        })),
      };
    }

    return parts;
  }

  /**
   * Sort specification.
   *
   * Every sort ends with `_id` as a tiebreaker. Without it, documents with equal
   * sort keys can be returned in a different order between page 1 and page 2,
   * which makes items appear twice or vanish while paging — a classic and
   * genuinely confusing bug.
   */
  private buildSort(
    sort: ProductSort,
    hasSearchTerm: boolean,
  ): Record<string, 1 | -1 | { $meta: 'textScore' }> {
    const tiebreak = { _id: -1 as const };

    switch (sort) {
      case 'relevance':
        // Relevance is only meaningful with a search term; otherwise fall back
        // to what sells, which is a better default than insertion order.
        return hasSearchTerm
          ? { score: { $meta: 'textScore' }, soldCount: -1, ...tiebreak }
          : { isFeatured: -1, soldCount: -1, ...tiebreak };
      case 'newest':
        return { createdAt: -1, ...tiebreak };
      case 'price_asc':
        return { 'priceRange.min': 1, ...tiebreak };
      case 'price_desc':
        return { 'priceRange.max': -1, ...tiebreak };
      case 'rating':
        // Count as secondary: a single 5-star review should not outrank a
        // product with 400 reviews averaging 4.8.
        return { 'rating.average': -1, 'rating.count': -1, ...tiebreak };
      case 'popularity':
        return { viewCount: -1, ...tiebreak };
      case 'best_selling':
        return { soldCount: -1, ...tiebreak };
      case 'discount':
        return { discountPercent: -1, ...tiebreak };
      default:
        return { createdAt: -1, ...tiebreak };
    }
  }

  // ── Facets ────────────────────────────────────────────────────────────────

  private async buildFacets(parts: FilterParts): Promise<SearchFacets> {
    // Brand counts omit the brand filter; attribute counts omit the attribute
    // filters. See the note at the top of the file.
    const brandFacetMatch = { ...parts.base, ...(parts.attributes ?? {}) };
    const attributeFacetMatch = { ...parts.base, ...(parts.brand ?? {}) };
    const fullMatch = { ...parts.base, ...(parts.brand ?? {}), ...(parts.attributes ?? {}) };

    const [brandRows, attributeRows, summaryRows] = await Promise.all([
      Product.aggregate<{ _id: string; count: number; name: string; slug: string }>([
        { $match: brandFacetMatch },
        { $group: { _id: '$brand', count: { $sum: 1 } } },
        { $match: { _id: { $ne: null } } },
        {
          $lookup: {
            from: 'brands',
            localField: '_id',
            foreignField: '_id',
            as: 'brand',
            pipeline: [{ $project: { name: 1, slug: 1 } }],
          },
        },
        { $unwind: '$brand' },
        { $project: { count: 1, name: '$brand.name', slug: '$brand.slug' } },
        { $sort: { count: -1, name: 1 } },
        { $limit: 40 },
      ]),

      Product.aggregate<{ _id: { k: string; v: string }; count: number }>([
        { $match: attributeFacetMatch },
        { $unwind: '$attributes' },
        {
          $group: {
            _id: { k: '$attributes.k', v: '$attributes.v' },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.k': 1, count: -1 } },
        { $limit: 200 },
      ]),

      // Price bounds, rating distribution and availability share one pass over
      // the fully-filtered set.
      Product.aggregate<{
        priceRange: { min: number; max: number }[];
        ratings: { _id: number; count: number }[];
        availability: { _id: boolean; count: number }[];
      }>([
        { $match: fullMatch },
        {
          $facet: {
            priceRange: [
              {
                $group: {
                  _id: null,
                  min: { $min: '$priceRange.min' },
                  max: { $max: '$priceRange.max' },
                },
              },
            ],
            ratings: [
              { $match: { 'rating.count': { $gt: 0 } } },
              { $group: { _id: { $floor: '$rating.average' }, count: { $sum: 1 } } },
            ],
            availability: [{ $group: { _id: '$inStock', count: { $sum: 1 } } }],
          },
        },
      ]),
    ]);

    const summary = summaryRows[0];

    const attributes: Record<string, FacetBucket[]> = {};
    for (const row of attributeRows) {
      const key = row._id.k;
      (attributes[key] ??= []).push({
        value: row._id.v,
        label: titleCase(row._id.v),
        count: row.count,
      });
    }

    // "4 stars and up" is cumulative: a 5-star product also satisfies a 4+ filter.
    const ratingCounts = new Map((summary?.ratings ?? []).map((r) => [r._id, r.count]));
    const ratings: FacetBucket[] = [4, 3, 2, 1].map((floor) => {
      let count = 0;
      for (let star = floor; star <= 5; star += 1) count += ratingCounts.get(star) ?? 0;
      return { value: String(floor), label: `${floor} stars & up`, count };
    });

    const availability = summary?.availability ?? [];

    return {
      brands: brandRows.map((b) => ({ value: b.slug, label: b.name, count: b.count })),
      categories: [],
      attributes,
      priceRange: {
        min: Math.floor(summary?.priceRange[0]?.min ?? 0),
        max: Math.ceil(summary?.priceRange[0]?.max ?? 0),
      },
      ratings: ratings.filter((r) => r.count > 0),
      availability: {
        inStock: availability.find((a) => a._id === true)?.count ?? 0,
        outOfStock: availability.find((a) => a._id === false)?.count ?? 0,
      },
    };
  }
}

/** User input reaching a regex must be escaped or it can alter the pattern. */
function titleCase(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

export const searchService: SearchService = new MongoSearchService();
