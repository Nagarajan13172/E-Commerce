import { z } from 'zod';
import { PAGINATION } from '../constants/limits.js';

/**
 * NOTE ON SECURITY: `z.object()` *strips* unknown keys. That is the property
 * this codebase relies on to make NoSQL injection structurally impossible —
 * a `{ "$ne": null }` payload can never survive parsing into a typed primitive,
 * so it can never reach a Mongoose query. We deliberately do not use a
 * sanitizer middleware; whitelisting beats blacklisting.
 */

/**
 * Build the PATCH counterpart of a create schema.
 *
 * `.partial()` alone is not enough, and the difference is destructive. Zod
 * applies `.partial()` *outside* `.default()`, so a defaulted field is still
 * filled in when the key is absent:
 *
 *   createCategorySchema.partial().parse({ name: 'x' })
 *   // → { name: 'x', order: 0, status: 'active', isFeatured: false }
 *
 * A service that merges the parsed object onto a document then writes those
 * defaults over live data that the request never mentioned. On products this
 * was catastrophic — `PATCH { name }` injected `variants: []`, `status:
 * 'draft'`, `categories: []` and `images: []`, so renaming a product deleted
 * every variant (with the `reserved` units held by in-flight checkouts),
 * unpublished it, and stripped its categories and images.
 *
 * Stripping the defaults first makes absence mean absence: an omitted key
 * stays omitted, and the service's `value === undefined` checks work as they
 * read. Defaults belong on create, where there is no existing value to
 * preserve — which is exactly why they must not survive into update.
 */
/**
 * Remove `.default()` wherever it appears, including inside arrays and nested
 * objects.
 *
 * Stripping only the top level is not enough. `productVariantSchema` carries
 * `stock: variantStockSchema.default({ available: 0, lowStockThreshold: 5 })`
 * *inside* the array element, so a variant sent without a `stock` object still
 * arrived carrying one — and the service's `incoming.stock?.x ?? current.x`
 * fallback, which reads as though it handles omission, was dead code. Omitting
 * `stock` silently reset the variant's low-stock threshold to 5.
 */
function stripDefaults(field: z.ZodTypeAny): z.ZodTypeAny {
  // Optional, not bare: a default means "this key may be omitted". Removing it
  // without making the field optional turns omission from allowed into a
  // validation error, which would reject every variant sent without a `stock`
  // object rather than leaving its stored value alone.
  if (field instanceof z.ZodDefault) {
    return z.optional(stripDefaults(field.def.innerType as z.ZodTypeAny));
  }

  if (field instanceof z.ZodOptional) {
    return z.optional(stripDefaults(field.def.innerType as z.ZodTypeAny));
  }

  if (field instanceof z.ZodArray) {
    return z.array(stripDefaults(field.def.element as z.ZodTypeAny));
  }

  if (field instanceof z.ZodObject) {
    return z.object(
      Object.fromEntries(
        Object.entries(field.shape).map(([key, inner]) => [
          key,
          stripDefaults(inner as z.ZodTypeAny),
        ]),
      ),
    );
  }

  return field;
}

export function toUpdateSchema<T extends z.ZodRawShape>(
  schema: z.ZodObject<T>,
): z.ZodType<Partial<z.infer<z.ZodObject<T>>>> {
  const withoutDefaults = Object.fromEntries(
    Object.entries(schema.shape).map(([key, field]) => [key, stripDefaults(field as z.ZodTypeAny)]),
  ) as Record<string, z.ZodTypeAny>;

  // The runtime shape is built dynamically, so the field types have to be
  // reasserted. `Partial<infer<T>>` is exactly what stripping the defaults and
  // making every key optional produces, and it keeps consumers typed on the
  // real fields rather than a bare Record.
  return z.object(withoutDefaults).partial() as unknown as z.ZodType<
    Partial<z.infer<z.ZodObject<T>>>
  >;
}

export const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Must be a valid id');

export const slugSchema = z
  .string()
  .min(1)
  .max(140)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Must be a lowercase, hyphen-separated slug');

export const emailSchema = z.email('Enter a valid email address').max(254).toLowerCase().trim();

/** E.164-ish; permissive enough for Indian 10-digit numbers with or without +91. */
export const phoneSchema = z
  .string()
  .trim()
  .regex(/^\+?[0-9]{7,15}$/, 'Enter a valid phone number');

export const idParamSchema = z.object({ id: objectIdSchema });
export const slugParamSchema = z.object({ slug: slugSchema });

/** Offset pagination — used by the storefront, where users expect page numbers. */
export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(PAGINATION.DEFAULT_PAGE),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

/**
 * Cursor pagination — used by admin tables and infinite scroll, where `skip`
 * degrades on large collections.
 */
export const cursorQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(PAGINATION.MAX_LIMIT).default(PAGINATION.DEFAULT_LIMIT),
});

export const sortOrderSchema = z.enum(['asc', 'desc']).default('desc');

/** Accepts `a,b,c` or repeated `?x=a&x=b`, always yielding a de-duplicated array. */
export const csvArray = (max = 50) =>
  z
    .union([z.string(), z.array(z.string())])
    .transform((value) => {
      const parts = Array.isArray(value) ? value : value.split(',');
      return [...new Set(parts.map((p) => p.trim()).filter(Boolean))].slice(0, max);
    })
    .pipe(z.array(z.string()));

export const dateRangeSchema = z
  .object({
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: '`from` must be before `to`',
    path: ['from'],
  });
export type DateRange = z.infer<typeof dateRangeSchema>;

/** Money is stored and transported in major units with 2dp, never as a float string. */
export const moneySchema = z.number().nonnegative().max(100_000_000).multipleOf(0.01);

export const seoSchema = z.object({
  title: z.string().max(70).optional(),
  description: z.string().max(180).optional(),
  keywords: z.array(z.string().max(40)).max(20).optional(),
  canonicalUrl: z.url().optional().or(z.literal('')),
  ogImage: z.string().optional(),
});
export type Seo = z.infer<typeof seoSchema>;
