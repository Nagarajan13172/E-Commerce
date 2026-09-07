import { z } from 'zod';
import { moneySchema, objectIdSchema, seoSchema, slugSchema, toUpdateSchema } from './common.js';
import { CONTENT_STATUSES, PRODUCT_STATUSES } from '../constants/enums.js';
import { UPLOAD_LIMITS } from '../constants/limits.js';

/**
 * Catalog write schemas.
 *
 * Used by the admin API to validate requests and by the admin forms as the
 * react-hook-form resolver, so a field's rules are written once. A constraint
 * added here shows up as an inline form error *and* is enforced server-side,
 * with no chance of the two disagreeing.
 */

// ── Brand ───────────────────────────────────────────────────────────────────

export const createBrandSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  // Optional on create: derived from the name when omitted.
  slug: slugSchema.optional(),
  description: z.string().max(2000).optional().or(z.literal('')),
  logo: z.string().optional().or(z.literal('')),
  website: z.url('Enter a valid URL').optional().or(z.literal('')),
  status: z.enum(CONTENT_STATUSES).default('active'),
  isFeatured: z.boolean().default(false),
  seo: seoSchema.optional(),
});
export type CreateBrandInput = z.infer<typeof createBrandSchema>;

export const updateBrandSchema = toUpdateSchema(createBrandSchema);
export type UpdateBrandInput = z.infer<typeof updateBrandSchema>;

// ── Category ────────────────────────────────────────────────────────────────

export const createCategorySchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(80),
  slug: slugSchema.optional(),
  description: z.string().max(2000).optional().or(z.literal('')),
  image: z.string().optional().or(z.literal('')),
  // null means "make this a root category"; undefined means "leave unchanged".
  parent: objectIdSchema.nullable().optional(),
  order: z.number().int().min(0).max(9999).default(0),
  status: z.enum(CONTENT_STATUSES).default('active'),
  isFeatured: z.boolean().default(false),
  seo: seoSchema.optional(),
});
export type CreateCategoryInput = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = toUpdateSchema(createCategorySchema);
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;

/** Drag-and-drop reordering sends the whole sibling list in its new order. */
export const reorderCategoriesSchema = z.object({
  items: z
    .array(z.object({ id: objectIdSchema, order: z.number().int().min(0) }))
    .min(1)
    .max(200),
});
export type ReorderCategoriesInput = z.infer<typeof reorderCategoriesSchema>;

// ── Product ─────────────────────────────────────────────────────────────────

const skuSchema = z
  .string()
  .trim()
  .toUpperCase()
  .min(2, 'SKU is required')
  .max(48)
  .regex(/^[A-Z0-9][A-Z0-9-_]*$/, 'SKU may contain letters, numbers, hyphens and underscores');

export const productImageSchema = z.object({
  media: objectIdSchema.optional(),
  url: z.string().min(1),
  alt: z.string().max(200).optional().or(z.literal('')),
  position: z.number().int().min(0).default(0),
});

/**
 * A variant's stock.
 *
 * Only `available` and `lowStockThreshold` are writable. `reserved` and `sold`
 * are derived from checkout activity and adjusting them by hand would corrupt
 * the invariant the reservation system depends on — stock corrections go through
 * the inventory endpoints, which write a ledger entry.
 */
export const variantStockSchema = z.object({
  available: z.number().int().min(0).max(1_000_000).default(0),
  lowStockThreshold: z.number().int().min(0).max(10_000).default(5),
});

export const productVariantSchema = z.object({
  /** Present when editing an existing variant, absent when adding one. */
  _id: objectIdSchema.optional(),
  sku: skuSchema,
  optionValues: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(40),
        value: z.string().trim().min(1).max(60),
      }),
    )
    .max(4, 'A variant may combine at most 4 options'),
  price: moneySchema,
  compareAtPrice: moneySchema.optional(),
  costPrice: moneySchema.optional(),
  stock: variantStockSchema.default({ available: 0, lowStockThreshold: 5 }),
  images: z.array(z.string()).max(UPLOAD_LIMITS.MAX_IMAGES_PER_PRODUCT).default([]),
  weightGrams: z.number().int().min(0).optional(),
  barcode: z.string().max(64).optional().or(z.literal('')),
  isActive: z.boolean().default(true),
});
export type ProductVariantInput = z.infer<typeof productVariantSchema>;

export const productOptionSchema = z.object({
  name: z.string().trim().min(1).max(40),
  values: z.array(z.string().trim().min(1).max(60)).min(1).max(50),
  position: z.number().int().min(0).default(0),
});

const productBaseSchema = z.object({
  name: z.string().trim().min(2, 'Name is required').max(200),
  slug: slugSchema.optional(),
  sku: skuSchema,
  description: z.string().min(1, 'Description is required').max(20000),
  shortDescription: z.string().max(500).optional().or(z.literal('')),

  brand: objectIdSchema.optional().or(z.literal('')),
  categories: z.array(objectIdSchema).max(10).default([]),
  tags: z.array(z.string().trim().toLowerCase().max(40)).max(30).default([]),

  images: z.array(productImageSchema).max(UPLOAD_LIMITS.MAX_IMAGES_PER_PRODUCT).default([]),

  price: moneySchema,
  compareAtPrice: moneySchema.optional(),
  costPrice: moneySchema.optional(),
  taxRate: z.number().min(0).max(1).default(0.18),
  taxInclusive: z.boolean().default(true),

  options: z.array(productOptionSchema).max(4).default([]),
  variants: z.array(productVariantSchema).max(100).default([]),

  specifications: z
    .array(
      z.object({
        group: z.string().max(60).optional().or(z.literal('')),
        name: z.string().trim().min(1).max(80),
        value: z.string().trim().min(1).max(300),
      }),
    )
    .max(60)
    .default([]),

  weightGrams: z.number().int().min(0).optional(),
  dimensions: z
    .object({
      length: z.number().min(0),
      width: z.number().min(0),
      height: z.number().min(0),
      unit: z.string().max(8).default('cm'),
    })
    .optional(),

  status: z.enum(PRODUCT_STATUSES).default('draft'),
  isFeatured: z.boolean().default(false),
  isBestseller: z.boolean().default(false),
  isNewArrival: z.boolean().default(false),

  seo: seoSchema.optional(),
});

/**
 * Create requires the cross-field invariants to hold.
 *
 * They live on `createProductSchema` rather than on the base object so that
 * `updateProductSchema` can be a partial — Zod cannot make a refined schema
 * partial, and a partial payload could not satisfy checks that span fields it
 * does not include. ProductService re-applies these against the merged document,
 * where the full post-update state is actually known.
 */
export const createProductSchema = productBaseSchema
  // A sale price above the "was" price would render as a negative discount.
  .refine((p) => !p.compareAtPrice || p.compareAtPrice >= p.price, {
    message: 'Compare-at price must be at least the selling price',
    path: ['compareAtPrice'],
  })
  // Variant SKUs are globally unique in the database; catching duplicates here
  // gives a field-level form error instead of a raw duplicate-key conflict.
  .refine(
    (p) => {
      const skus = p.variants.map((v) => v.sku);
      return new Set(skus).size === skus.length;
    },
    { message: 'Variant SKUs must be unique', path: ['variants'] },
  )
  // Every variant must describe a combination of the declared options,
  // otherwise the storefront's variant picker cannot resolve it.
  .refine(
    (p) => {
      if (p.options.length === 0) return true;
      const optionNames = new Set(p.options.map((o) => o.name));
      return p.variants.every(
        (v) =>
          v.optionValues.length === p.options.length &&
          v.optionValues.every((ov) => optionNames.has(ov.name)),
      );
    },
    {
      message: 'Each variant must specify a value for every declared option',
      path: ['variants'],
    },
  );
export type CreateProductInput = z.infer<typeof createProductSchema>;

/**
 * Update accepts any subset of the base fields — and only the fields actually
 * sent. See `toUpdateSchema`: a plain `.partial()` still injects every default,
 * which on this schema meant a `PATCH { name }` wiped variants, images and
 * categories and reset the product to `draft`.
 */
export const updateProductSchema = toUpdateSchema(productBaseSchema);
export type UpdateProductInput = z.infer<typeof updateProductSchema>;

/** Bulk actions from the admin product table. */
export const bulkProductActionSchema = z.object({
  ids: z.array(objectIdSchema).min(1).max(100),
  action: z.enum(['publish', 'unpublish', 'archive', 'restore', 'feature', 'unfeature', 'delete']),
});
export type BulkProductActionInput = z.infer<typeof bulkProductActionSchema>;

// ── Media ───────────────────────────────────────────────────────────────────

export const presignUploadSchema = z.object({
  filename: z.string().min(1).max(255),
  contentType: z.enum(UPLOAD_LIMITS.ALLOWED_IMAGE_TYPES),
  size: z
    .number()
    .int()
    .positive()
    .max(UPLOAD_LIMITS.MAX_FILE_SIZE_BYTES, 'File exceeds the 10MB limit'),
  refType: z.enum(['product', 'category', 'brand', 'review', 'avatar']).default('product'),
});
export type PresignUploadInput = z.infer<typeof presignUploadSchema>;

export const confirmUploadSchema = z.object({
  key: z.string().min(1).max(512),
  alt: z.string().max(200).optional().or(z.literal('')),
  refType: z.enum(['product', 'category', 'brand', 'review', 'avatar']).optional(),
  refId: objectIdSchema.optional(),
});
export type ConfirmUploadInput = z.infer<typeof confirmUploadSchema>;

// ── Admin listing ───────────────────────────────────────────────────────────

export const adminProductQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z.enum(PRODUCT_STATUSES).optional(),
  brand: objectIdSchema.optional(),
  category: objectIdSchema.optional(),
  /** Only products at or below their low-stock threshold. */
  lowStock: z.stringbool().optional(),
  includeDeleted: z.stringbool().optional(),
  sort: z
    .enum(['newest', 'oldest', 'name_asc', 'name_desc', 'price_asc', 'price_desc', 'stock_asc'])
    .default('newest'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export type AdminProductQuery = z.infer<typeof adminProductQuerySchema>;
