import type { CreateBrandInput, UpdateBrandInput } from '@ecom/shared';
import { ERROR_CODES } from '@ecom/shared';
import { Brand, type BrandDocument } from '../models/brand.model.js';
import { Product } from '../models/product.model.js';
import { AppError } from '../utils/AppError.js';
import { uniqueSlug } from '../utils/slug.js';
import { cache, cacheKeys, CACHE_TTL } from '../integrations/cache/index.js';

export async function listBrands(includeInactive = false) {
  if (includeInactive) {
    return Brand.find().sort({ name: 1 }).lean();
  }
  // The public brand list is small, read constantly and changes rarely — a
  // textbook cache candidate.
  return cache.wrap(cacheKeys.brandList(), CACHE_TTL.LONG, () =>
    Brand.find({ status: 'active' }).sort({ name: 1 }).lean(),
  );
}

export async function getBrandBySlug(slug: string): Promise<BrandDocument> {
  const brand = await Brand.findOne({ slug, status: 'active' });
  if (!brand) throw AppError.notFound('Brand');
  return brand;
}

export async function createBrand(input: CreateBrandInput): Promise<BrandDocument> {
  const brand = await Brand.create({
    ...input,
    slug: await uniqueSlug(Brand, input.slug ?? input.name),
  });
  await cache.delByPrefix('brand:');
  return brand;
}

export async function updateBrand(id: string, input: UpdateBrandInput): Promise<BrandDocument> {
  const brand = await Brand.findById(id);
  if (!brand) throw AppError.notFound('Brand');

  if (input.slug && input.slug !== brand.slug) {
    input.slug = await uniqueSlug(Brand, input.slug, id);
  }

  Object.assign(brand, input);
  await brand.save();
  await cache.delByPrefix('brand:');
  return brand;
}

export async function deleteBrand(id: string): Promise<void> {
  const productCount = await Product.countDocuments({ brand: id, deletedAt: { $exists: false } });

  // Deleting would leave products pointing at a missing brand, so the admin is
  // told to reassign first rather than having it happen implicitly.
  if (productCount > 0) {
    throw AppError.conflict(
      `${productCount} product${productCount === 1 ? '' : 's'} still use this brand. Reassign them first.`,
      ERROR_CODES.DUPLICATE_RESOURCE,
    );
  }

  await Brand.deleteOne({ _id: id });
  await cache.delByPrefix('brand:');
}

/** Refresh denormalized counts shown on brand listing pages. */
export async function refreshBrandCounts(): Promise<void> {
  const counts = await Product.aggregate<{ _id: string; count: number }>([
    { $match: { status: 'active', deletedAt: { $exists: false }, brand: { $ne: null } } },
    { $group: { _id: '$brand', count: { $sum: 1 } } },
  ]);

  const countById = new Map(counts.map((c) => [String(c._id), c.count]));
  const brands = await Brand.find().select('_id').lean();

  await Brand.bulkWrite(
    brands.map((b) => ({
      updateOne: {
        filter: { _id: b._id },
        update: { $set: { productCount: countById.get(String(b._id)) ?? 0 } },
      },
    })),
  );
  await cache.delByPrefix('brand:');
}
