import { Types } from 'mongoose';
import { Brand, Category, Product, User, type CategoryDocument } from '../../src/models/index.js';
import { hashPassword } from '../../src/utils/hash.js';
import { toSlug } from '../../src/utils/slug.js';
import type { UserRole } from '@ecom/shared';

/**
 * Test fixtures.
 *
 * Each factory produces a minimal valid document with sensible defaults, so a
 * test only states the field it actually cares about. That keeps the assertion
 * visible instead of buried in twenty lines of setup.
 */

export const TEST_PASSWORD = 'CorrectHorse9';

export async function makeUser(
  overrides: Partial<{ email: string; role: UserRole; name: string }> = {},
) {
  return User.create({
    name: overrides.name ?? 'Test User',
    email: overrides.email ?? `user-${new Types.ObjectId().toString()}@example.com`,
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: overrides.role ?? 'customer',
    status: 'active',
    emailVerifiedAt: new Date(),
  });
}

export async function makeBrand(name = 'Test Brand') {
  return Brand.create({ name, slug: toSlug(name), status: 'active' });
}

/**
 * Create a category, optionally nested under a parent.
 *
 * Mirrors what CategoryService does when maintaining `ancestors` and `path` —
 * tests that filter by a parent category depend on those being correct.
 */
export async function makeCategory(
  name: string,
  parent?: CategoryDocument,
): Promise<CategoryDocument> {
  const slug = toSlug(name);
  return Category.create({
    name,
    slug,
    parent: parent?._id ?? null,
    ancestors: parent ? [...parent.ancestors, parent._id] : [],
    path: parent ? `${parent.path}/${slug}` : slug,
    level: parent ? parent.level + 1 : 0,
    status: 'active',
  });
}

interface ProductOverrides {
  name?: string;
  price?: number;
  compareAtPrice?: number;
  brand?: Types.ObjectId;
  category?: { _id: Types.ObjectId; ancestors: Types.ObjectId[] };
  status?: 'draft' | 'active' | 'archived';
  tags?: string[];
  rating?: number;
  variants?: { color?: string; size?: string; price?: number; available: number }[];
  stock?: number;
}

export async function makeProduct(overrides: ProductOverrides = {}) {
  const name = overrides.name ?? `Product ${new Types.ObjectId().toString().slice(-6)}`;
  const price = overrides.price ?? 1000;

  const variants = (overrides.variants ?? []).map((v, index) => ({
    sku: `${toSlug(name).toUpperCase()}-V${index}`,
    optionValues: [
      ...(v.color ? [{ name: 'Color', value: v.color }] : []),
      ...(v.size ? [{ name: 'Size', value: v.size }] : []),
    ],
    price: v.price ?? price,
    stock: { available: v.available, reserved: 0, sold: 0, lowStockThreshold: 5 },
    images: [],
    isActive: true,
  }));

  const options = variants.length
    ? [
        ...(overrides.variants!.some((v) => v.color)
          ? [
              {
                name: 'Color',
                values: [...new Set(overrides.variants!.map((v) => v.color!).filter(Boolean))],
                position: 0,
              },
            ]
          : []),
        ...(overrides.variants!.some((v) => v.size)
          ? [
              {
                name: 'Size',
                values: [...new Set(overrides.variants!.map((v) => v.size!).filter(Boolean))],
                position: 1,
              },
            ]
          : []),
      ]
    : [];

  const product = new Product({
    name,
    slug: toSlug(name),
    sku: toSlug(name).toUpperCase(),
    description: 'A product used in tests.',
    shortDescription: 'Test product',
    brand: overrides.brand,
    categories: overrides.category ? [overrides.category._id] : [],
    // Mirrors ProductService: own category plus every ancestor.
    categoryPath: overrides.category
      ? [overrides.category._id, ...overrides.category.ancestors]
      : [],
    tags: overrides.tags ?? [],
    price,
    compareAtPrice: overrides.compareAtPrice,
    options,
    variants,
    status: overrides.status ?? 'active',
    publishedAt: new Date(),
    rating: overrides.rating
      ? { average: overrides.rating, count: 10, buckets: [0, 0, 0, 0, 10] }
      : { average: 0, count: 0, buckets: [0, 0, 0, 0, 0] },
  });

  if (!variants.length && overrides.stock !== undefined) {
    product.stock = {
      available: overrides.stock,
      reserved: 0,
      sold: 0,
      lowStockThreshold: 5,
    };
  }

  await product.save();
  return product;
}
