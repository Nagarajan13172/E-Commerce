import { Schema, model, type HydratedDocument, type Model, type Types } from 'mongoose';
import { PRODUCT_STATUSES, type ProductStatus, type Seo } from '@ecom/shared';

/**
 * PRODUCT — the most consequential schema in the system.
 *
 * ── Why variants are embedded rather than a separate collection ──────────────
 * Two reasons, one of them decisive.
 *
 * 1. Reads: the listing grid needs price ranges and stock, and the detail page
 *    needs every variant. Embedding makes both a single document fetch with no
 *    `$lookup` and no N+1.
 *
 * 2. Writes (the decisive one): MongoDB guarantees atomicity at the *document*
 *    level. With variants embedded, reserving stock is one conditional update:
 *
 *      updateOne(
 *        { _id, 'variants._id': vId, 'variants.stock.available': { $gte: qty } },
 *        { $inc: { 'variants.$.stock.available': -qty,
 *                  'variants.$.stock.reserved':  +qty } })
 *
 *    The `$gte` guard is evaluated by the database as part of the same atomic
 *    operation, so two shoppers racing for the last unit cannot both win —
 *    `matchedCount === 0` tells the loser it lost. No read-modify-write, no
 *    application-level lock, no oversell.
 *
 * The trade-off is the 16MB document limit. This design is comfortable to
 * roughly 100 variants per product. Past that, variants should move to their own
 * collection with `{ product, _id }` as the shard of atomicity — note that the
 * update above still works unchanged in that world, so `InventoryService` would
 * not need rewriting.
 *
 * ── Denormalized rollups ────────────────────────────────────────────────────
 * `priceRange`, `totalStock`, `inStock`, `discountPercent` and `attributes` are
 * derived from the variants and recomputed on every save. They exist so the
 * listing query can filter and sort on indexed top-level fields instead of
 * scanning into an array on every document.
 */

export interface IProductOption {
  name: string;
  values: string[];
  position: number;
}

export interface IVariantStock {
  /** Sellable right now. Never negative — the DB guard enforces it. */
  available: number;
  /** Held for in-flight checkouts. Not sellable, not yet sold. */
  reserved: number;
  /** Lifetime units sold. Reporting only. */
  sold: number;
  lowStockThreshold: number;
}

export interface IProductVariant {
  _id: Types.ObjectId;
  sku: string;
  /** The option combination this variant represents, e.g. Color=Black, Size=9. */
  optionValues: { name: string; value: string }[];
  price: number;
  compareAtPrice?: number;
  costPrice?: number;
  stock: IVariantStock;
  /** Media keys specific to this variant (a colour swatch's own photos). */
  images: string[];
  weightGrams?: number;
  barcode?: string;
  isActive: boolean;
}

export interface IProductImage {
  media: Types.ObjectId;
  url: string;
  alt?: string;
  position: number;
}

export interface IProduct {
  _id: Types.ObjectId;
  name: string;
  slug: string;
  sku: string;
  description: string;
  shortDescription?: string;

  brand?: Types.ObjectId;
  /** Categories this product was explicitly filed under. */
  categories: Types.ObjectId[];
  /**
   * Those categories PLUS all their ancestors, denormalized. Filtering by a
   * top-level category is then one indexed equality match rather than a
   * recursive category lookup followed by an `$in` over the result.
   */
  categoryPath: Types.ObjectId[];
  tags: string[];

  images: IProductImage[];
  thumbnail?: string;

  price: number;
  compareAtPrice?: number;
  costPrice?: number;
  taxRate: number;
  taxInclusive: boolean;
  currency: string;

  options: IProductOption[];
  variants: Types.DocumentArray<IProductVariant>;

  /** Flattened facet source: [{ k: 'color', v: 'black' }, …]. Multikey indexed. */
  attributes: { k: string; v: string }[];
  specifications: { group?: string; name: string; value: string }[];

  weightGrams?: number;
  dimensions?: { length: number; width: number; height: number; unit: string };

  status: ProductStatus;
  publishedAt?: Date;
  isFeatured: boolean;
  isBestseller: boolean;
  isNewArrival: boolean;

  // ── Rollups, maintained by the pre-save hook ──────────────────────────────
  priceRange: { min: number; max: number };
  discountPercent: number;
  totalStock: number;
  inStock: boolean;
  variantCount: number;

  soldCount: number;
  viewCount: number;
  rating: { average: number; count: number; buckets: number[] };

  seo?: Seo;
  /** Soft delete: orders reference products, so rows are never truly removed. */
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export type ProductDocument = HydratedDocument<IProduct>;

const variantSchema = new Schema<IProductVariant>(
  {
    sku: { type: String, required: true, trim: true, uppercase: true },
    optionValues: {
      type: [
        {
          _id: false,
          name: { type: String, required: true },
          value: { type: String, required: true },
        },
      ],
      default: [],
    },
    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, min: 0 },
    costPrice: { type: Number, min: 0 },
    stock: {
      available: { type: Number, required: true, default: 0, min: 0 },
      reserved: { type: Number, required: true, default: 0, min: 0 },
      sold: { type: Number, required: true, default: 0, min: 0 },
      lowStockThreshold: { type: Number, default: 5, min: 0 },
    },
    images: { type: [String], default: [] },
    weightGrams: { type: Number, min: 0 },
    barcode: { type: String },
    isActive: { type: Boolean, default: true },
  },
  { _id: true },
);

const productSchema = new Schema<IProduct, Model<IProduct>>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    slug: { type: String, required: true, unique: true, lowercase: true, trim: true },
    sku: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, required: true, maxlength: 20000 },
    shortDescription: { type: String, maxlength: 500 },

    brand: { type: Schema.Types.ObjectId, ref: 'Brand' },
    categories: { type: [{ type: Schema.Types.ObjectId, ref: 'Category' }], default: [] },
    categoryPath: { type: [{ type: Schema.Types.ObjectId, ref: 'Category' }], default: [] },
    tags: { type: [String], default: [], index: true },

    images: {
      type: [
        {
          _id: false,
          media: { type: Schema.Types.ObjectId, ref: 'Media' },
          url: { type: String, required: true },
          alt: { type: String, maxlength: 200 },
          position: { type: Number, default: 0 },
        },
      ],
      default: [],
    },
    thumbnail: { type: String },

    price: { type: Number, required: true, min: 0 },
    compareAtPrice: { type: Number, min: 0 },
    costPrice: { type: Number, min: 0 },
    taxRate: { type: Number, default: 0.18, min: 0, max: 1 },
    taxInclusive: { type: Boolean, default: true },
    currency: { type: String, default: 'INR' },

    options: {
      type: [
        {
          _id: false,
          name: { type: String, required: true },
          values: { type: [String], default: [] },
          position: { type: Number, default: 0 },
        },
      ],
      default: [],
    },
    variants: { type: [variantSchema], default: [] },

    attributes: {
      type: [
        { _id: false, k: { type: String, required: true }, v: { type: String, required: true } },
      ],
      default: [],
    },
    specifications: {
      type: [
        {
          _id: false,
          group: { type: String },
          name: { type: String, required: true },
          value: { type: String, required: true },
        },
      ],
      default: [],
    },

    weightGrams: { type: Number, min: 0 },
    dimensions: {
      type: {
        _id: false,
        length: { type: Number, min: 0 },
        width: { type: Number, min: 0 },
        height: { type: Number, min: 0 },
        unit: { type: String, default: 'cm' },
      },
      default: undefined,
    },

    status: { type: String, enum: PRODUCT_STATUSES, default: 'draft' },
    publishedAt: { type: Date },
    isFeatured: { type: Boolean, default: false },
    isBestseller: { type: Boolean, default: false },
    isNewArrival: { type: Boolean, default: false },

    priceRange: {
      min: { type: Number, default: 0 },
      max: { type: Number, default: 0 },
    },
    discountPercent: { type: Number, default: 0, min: 0, max: 100 },
    totalStock: { type: Number, default: 0, min: 0 },
    inStock: { type: Boolean, default: false },
    variantCount: { type: Number, default: 0, min: 0 },

    soldCount: { type: Number, default: 0, min: 0 },
    viewCount: { type: Number, default: 0, min: 0 },
    rating: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0, min: 0 },
      // Index 0 = one-star count … index 4 = five-star count.
      buckets: { type: [Number], default: () => [0, 0, 0, 0, 0] },
    },

    seo: {
      type: {
        title: { type: String, maxlength: 70 },
        description: { type: String, maxlength: 180 },
        keywords: { type: [String], default: undefined },
        canonicalUrl: { type: String },
        ogImage: { type: String },
      },
      default: undefined,
    },
    deletedAt: { type: Date },
  },
  { timestamps: true, toJSON: { virtuals: true } },
);

// ── Indexes ────────────────────────────────────────────────────────────────
// Chosen deliberately: every one below serves a query the storefront or admin
// actually runs. Indexes are not free — each one slows writes and consumes RAM.

// Weighted full-text search. MongoDB permits only ONE text index per collection,
// so every searchable field must live in this single declaration.
productSchema.index(
  { name: 'text', sku: 'text', tags: 'text', shortDescription: 'text', description: 'text' },
  {
    weights: { name: 10, sku: 8, tags: 5, shortDescription: 2, description: 1 },
    name: 'product_text_search',
  },
);

// Listing: category browse with a price filter — the most common query there is.
productSchema.index({ status: 1, categoryPath: 1, 'priceRange.min': 1 });
// Listing: brand pages, newest first.
productSchema.index({ status: 1, brand: 1, createdAt: -1 });
// Sort options, each backed so they never fall back to an in-memory sort.
productSchema.index({ status: 1, createdAt: -1 });
productSchema.index({ status: 1, 'rating.average': -1 });
productSchema.index({ status: 1, soldCount: -1 });
productSchema.index({ status: 1, discountPercent: -1 });
// Attribute facets (color, size, storage …). Multikey over the flattened array.
productSchema.index({ status: 1, 'attributes.k': 1, 'attributes.v': 1 });
// Homepage merchandising rails.
productSchema.index({ status: 1, isFeatured: 1, createdAt: -1 });
// Variant SKU lookups and uniqueness. Sparse because drafts may have no variants.
productSchema.index({ 'variants.sku': 1 }, { unique: true, sparse: true });
// Admin low-stock report.
productSchema.index({ status: 1, 'variants.stock.available': 1 });
// Soft-delete filtering.
productSchema.index({ deletedAt: 1 });

/**
 * Recompute every derived field from the variants.
 *
 * Doing this in one hook is what keeps the rollups trustworthy: there is a
 * single place where "price range" is defined, so an admin edit, a bulk import
 * and the seed script cannot each compute it slightly differently.
 */
productSchema.pre('save', function recomputeRollups() {
  const activeVariants = this.variants.filter((v) => v.isActive);

  if (activeVariants.length > 0) {
    const prices = activeVariants.map((v) => v.price);
    this.priceRange = { min: Math.min(...prices), max: Math.max(...prices) };
    this.totalStock = activeVariants.reduce((sum, v) => sum + v.stock.available, 0);
    this.variantCount = activeVariants.length;

    // Best discount available across variants — that is what the badge promises.
    this.discountPercent = activeVariants.reduce((best, v) => {
      if (!v.compareAtPrice || v.compareAtPrice <= v.price) return best;
      return Math.max(best, Math.round(((v.compareAtPrice - v.price) / v.compareAtPrice) * 100));
    }, 0);

    // Facet source: the union of every option value across active variants, so
    // a colour filter matches a product if ANY of its variants is that colour.
    const attributePairs = new Map<string, { k: string; v: string }>();
    for (const variant of activeVariants) {
      for (const option of variant.optionValues) {
        const k = option.name.toLowerCase();
        const v = option.value.toLowerCase();
        attributePairs.set(`${k}:${v}`, { k, v });
      }
    }
    this.attributes = [...attributePairs.values()];
  } else {
    // A simple product with no variants prices and stocks at the product level.
    this.priceRange = { min: this.price, max: this.price };
    this.variantCount = 0;
    this.discountPercent =
      this.compareAtPrice && this.compareAtPrice > this.price
        ? Math.round(((this.compareAtPrice - this.price) / this.compareAtPrice) * 100)
        : 0;
  }

  this.inStock = this.totalStock > 0;

  if (this.images.length > 0 && !this.thumbnail) {
    this.thumbnail = [...this.images].sort((a, b) => a.position - b.position)[0]?.url;
  }

  if (this.status === 'active' && !this.publishedAt) this.publishedAt = new Date();
});

export const Product = model<IProduct>('Product', productSchema);
