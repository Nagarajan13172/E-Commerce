import type { CreateCategoryInput, UpdateCategoryInput } from '@ecom/shared';
import { ERROR_CODES } from '@ecom/shared';
import { Category, type CategoryDocument, type ICategory } from '../models/category.model.js';
import { Product } from '../models/product.model.js';
import { AppError } from '../utils/AppError.js';
import { toSlug, uniqueSlug } from '../utils/slug.js';
import { cache, cacheKeys, CACHE_TTL } from '../integrations/cache/index.js';
import { createLogger } from '../config/logger.js';

const log = createLogger('category');

/**
 * Category tree management.
 *
 * The interesting work here is keeping the denormalized `ancestors`/`path`
 * fields — and every product's `categoryPath` — consistent. That denormalization
 * is what makes "everything under Electronics" a single indexed query instead of
 * a recursive walk, and it is only safe if every write goes through this service.
 */

export interface CategoryTreeNode extends Omit<ICategory, 'ancestors'> {
  children: CategoryTreeNode[];
}

const MAX_DEPTH = 4;

// ── Reads ───────────────────────────────────────────────────────────────────

/**
 * The full active tree, assembled in one query.
 *
 * Fetching flat and nesting in memory costs one round trip regardless of depth;
 * a recursive `populate('children')` would cost one per level. The tree is small
 * and changes rarely, so it is also cached aggressively.
 */
export async function getCategoryTree(includeInactive = false): Promise<CategoryTreeNode[]> {
  const cacheKey = includeInactive ? `${cacheKeys.categoryTree()}:all` : cacheKeys.categoryTree();

  return cache.wrap(cacheKey, CACHE_TTL.LONG, async () => {
    const filter = includeInactive ? {} : { status: 'active' as const };
    const flat = await Category.find(filter).sort({ level: 1, order: 1, name: 1 }).lean();

    const byId = new Map<string, CategoryTreeNode>();
    for (const doc of flat) {
      byId.set(String(doc._id), { ...(doc as unknown as CategoryTreeNode), children: [] });
    }

    const roots: CategoryTreeNode[] = [];
    for (const node of byId.values()) {
      const parentId = node.parent ? String(node.parent) : null;
      const parent = parentId ? byId.get(parentId) : undefined;
      // A child whose parent is filtered out is promoted to a root rather than
      // being silently dropped from the navigation.
      if (parent) parent.children.push(node);
      else roots.push(node);
    }

    return roots;
  });
}

export async function getCategoryBySlug(slug: string): Promise<CategoryDocument> {
  const category = await Category.findOne({ slug, status: 'active' });
  if (!category) throw AppError.notFound('Category');
  return category;
}

/** A category and all of its descendants — the ids a product filter matches on. */
export async function getDescendantIds(categoryId: string): Promise<string[]> {
  const descendants = await Category.find({ ancestors: categoryId }).select('_id').lean();
  return [categoryId, ...descendants.map((d) => String(d._id))];
}

export async function listCategories(includeInactive = false) {
  const filter = includeInactive ? {} : { status: 'active' as const };
  return Category.find(filter).sort({ level: 1, order: 1, name: 1 }).lean();
}

// ── Writes ──────────────────────────────────────────────────────────────────

export async function createCategory(input: CreateCategoryInput): Promise<CategoryDocument> {
  const { ancestors, level, path } = await resolveLineage(input.parent ?? null, input.name);

  const category = await Category.create({
    ...input,
    slug: await uniqueSlug(Category, input.slug ?? input.name),
    parent: input.parent ?? null,
    ancestors,
    level,
    path,
  });

  await invalidate();
  return category;
}

export async function updateCategory(
  id: string,
  input: UpdateCategoryInput,
): Promise<CategoryDocument> {
  const category = await Category.findById(id);
  if (!category) throw AppError.notFound('Category');

  const parentChanged =
    input.parent !== undefined && String(input.parent ?? '') !== String(category.parent ?? '');

  if (parentChanged) {
    await assertNoCycle(id, input.parent ?? null);
    const { ancestors, level, path } = await resolveLineage(
      input.parent ?? null,
      input.name ?? category.name,
    );
    category.parent = (input.parent ?? null) as never;
    category.ancestors = ancestors as never;
    category.level = level;
    category.path = path;
  }

  if (input.slug && input.slug !== category.slug) {
    category.slug = await uniqueSlug(Category, input.slug, id);
  }

  for (const field of [
    'name',
    'description',
    'image',
    'order',
    'status',
    'isFeatured',
    'seo',
  ] as const) {
    if (input[field] !== undefined) {
      (category as unknown as Record<string, unknown>)[field] = input[field];
    }
  }

  await category.save();

  // Moving a node invalidates every path beneath it, and every product filed
  // under any of them. Rare, and worth the cheap reads it buys everywhere else.
  if (parentChanged) await repairSubtree(category);

  await invalidate();
  return category;
}

export async function deleteCategory(id: string): Promise<void> {
  const [childCount, productCount] = await Promise.all([
    Category.countDocuments({ parent: id }),
    Product.countDocuments({ categories: id, deletedAt: { $exists: false } }),
  ]);

  // Refuse rather than cascade: deleting a category should never silently
  // orphan or delete products. The admin must move them first, deliberately.
  if (childCount > 0) {
    throw AppError.conflict(
      `This category has ${childCount} subcategor${childCount === 1 ? 'y' : 'ies'}. Move or delete them first.`,
      ERROR_CODES.DUPLICATE_RESOURCE,
    );
  }
  if (productCount > 0) {
    throw AppError.conflict(
      `This category still contains ${productCount} product${productCount === 1 ? '' : 's'}. Reassign them first.`,
      ERROR_CODES.DUPLICATE_RESOURCE,
    );
  }

  await Category.deleteOne({ _id: id });
  await invalidate();
}

export async function reorderCategories(items: { id: string; order: number }[]): Promise<void> {
  await Category.bulkWrite(
    items.map(({ id, order }) => ({
      updateOne: { filter: { _id: id }, update: { $set: { order } } },
    })),
  );
  await invalidate();
}

// ── Internals ───────────────────────────────────────────────────────────────

async function resolveLineage(
  parentId: string | null,
  name: string,
): Promise<{ ancestors: string[]; level: number; path: string }> {
  const ownSegment = toSlug(name);

  if (!parentId) return { ancestors: [], level: 0, path: ownSegment };

  const parent = await Category.findById(parentId).select('ancestors level path').lean();
  if (!parent) throw AppError.badRequest('Parent category does not exist');

  if (parent.level + 1 > MAX_DEPTH) {
    throw AppError.badRequest(`Categories can be nested at most ${MAX_DEPTH} levels deep`);
  }

  return {
    ancestors: [...parent.ancestors.map(String), parentId],
    level: parent.level + 1,
    path: `${parent.path}/${ownSegment}`,
  };
}

/**
 * Refuse to make a category a descendant of itself.
 *
 * Without this check the tree becomes a cycle: `getCategoryTree` would drop the
 * whole branch (no reachable root) and `getDescendantIds` would return a set
 * that contains its own parent. Cheap to check, catastrophic to miss.
 */
async function assertNoCycle(categoryId: string, newParentId: string | null): Promise<void> {
  if (!newParentId) return;
  if (newParentId === categoryId) {
    throw AppError.badRequest('A category cannot be its own parent');
  }

  const newParent = await Category.findById(newParentId).select('ancestors').lean();
  if (!newParent) throw AppError.badRequest('Parent category does not exist');

  if (newParent.ancestors.map(String).includes(categoryId)) {
    throw AppError.badRequest('A category cannot be moved inside one of its own subcategories');
  }
}

/**
 * Rewrite `ancestors`, `level` and `path` for everything beneath a moved node,
 * then repair the denormalized `categoryPath` on affected products.
 */
async function repairSubtree(root: CategoryDocument): Promise<void> {
  const descendants = await Category.find({ ancestors: root._id }).sort({ level: 1 });
  log.info(
    { categoryId: String(root._id), descendants: descendants.length },
    'Repairing category subtree after move',
  );

  for (const node of descendants) {
    const parent = await Category.findById(node.parent).select('ancestors level path').lean();
    if (!parent) continue;

    node.ancestors = [...parent.ancestors, node.parent!] as never;
    node.level = parent.level + 1;
    node.path = `${parent.path}/${toSlug(node.name)}`;
    await node.save();
  }

  const touched = [root._id, ...descendants.map((d) => d._id)];
  await refreshProductCategoryPaths(touched.map(String));
}

/**
 * Recompute `Product.categoryPath` for products in the given categories.
 *
 * `categoryPath` is a product's own categories plus all their ancestors. It is
 * what lets a filter on a top-level category match a product filed three levels
 * down, using one indexed equality match and no lookup.
 */
export async function refreshProductCategoryPaths(categoryIds: string[]): Promise<void> {
  const products = await Product.find({ categories: { $in: categoryIds } })
    .select('categories')
    .lean();
  if (products.length === 0) return;

  const allCategoryIds = [...new Set(products.flatMap((p) => p.categories.map(String)))];
  const categories = await Category.find({ _id: { $in: allCategoryIds } })
    .select('ancestors')
    .lean();

  const ancestorsById = new Map(categories.map((c) => [String(c._id), c.ancestors.map(String)]));

  const operations = products.map((product) => {
    const path = new Set<string>();
    for (const categoryId of product.categories.map(String)) {
      path.add(categoryId);
      for (const ancestor of ancestorsById.get(categoryId) ?? []) path.add(ancestor);
    }
    return {
      updateOne: {
        filter: { _id: product._id },
        update: { $set: { categoryPath: [...path] } },
      },
    };
  });

  await Product.bulkWrite(operations as never);
}

/** Refresh the denormalized product counts shown in navigation. */
export async function refreshProductCounts(): Promise<void> {
  const counts = await Product.aggregate<{ _id: string; count: number }>([
    { $match: { status: 'active', deletedAt: { $exists: false } } },
    { $unwind: '$categoryPath' },
    { $group: { _id: '$categoryPath', count: { $sum: 1 } } },
  ]);

  const countById = new Map(counts.map((c) => [String(c._id), c.count]));
  const all = await Category.find().select('_id').lean();

  await Category.bulkWrite(
    all.map((c) => ({
      updateOne: {
        filter: { _id: c._id },
        update: { $set: { productCount: countById.get(String(c._id)) ?? 0 } },
      },
    })),
  );
  await invalidate();
}

async function invalidate(): Promise<void> {
  await cache.delByPrefix('category:');
  await cache.del(cacheKeys.homepage());
}
