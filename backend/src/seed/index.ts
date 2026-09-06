import mongoose from 'mongoose';
import { connectDatabase, disconnectDatabase } from '../config/db.js';
import { cache } from '../integrations/cache/index.js';
import { env } from '../config/env.js';
import {
  Brand,
  Category,
  Coupon,
  Product,
  Review,
  User,
  type CategoryDocument,
} from '../models/index.js';
import { hashPassword } from '../utils/hash.js';
import { toSlug } from '../utils/slug.js';
import { refreshProductCounts } from '../services/category.service.js';
import { refreshBrandCounts } from '../services/brand.service.js';
import { seedBrands, seedCategories, type SeedCategory } from './data/taxonomy.js';
import { seedProducts, type SeedProduct } from './data/products.js';

/**
 * Development seed.
 *
 * Run with `pnpm seed`, or `pnpm seed --fresh` to wipe first.
 *
 * The data is deliberately realistic — genuine category nesting, uneven stock,
 * out-of-stock variants, a wide price spread — because the point is to exercise
 * faceting, filtering, the low-stock report and the variant picker. A catalog of
 * identical lorem-ipsum rows would let all of those ship broken.
 */

const DEMO_PASSWORD = 'Password123';

function log(message: string): void {
  console.log(`  ${message}`);
}

// ── Categories ──────────────────────────────────────────────────────────────

/**
 * Insert the tree depth-first, so a child always has its parent's `ancestors`
 * and `path` available to build its own from.
 */
async function seedCategoryTree(
  nodes: SeedCategory[],
  parent: CategoryDocument | null = null,
): Promise<Map<string, CategoryDocument>> {
  const byName = new Map<string, CategoryDocument>();

  for (const [index, node] of nodes.entries()) {
    const slug = toSlug(node.name);
    const category = await Category.create({
      name: node.name,
      slug,
      description: node.description,
      parent: parent?._id ?? null,
      ancestors: parent ? [...parent.ancestors, parent._id] : [],
      path: parent ? `${parent.path}/${slug}` : slug,
      level: parent ? parent.level + 1 : 0,
      order: index,
      status: 'active',
      isFeatured: node.isFeatured ?? false,
      seo: {
        title: `${node.name} | Aurora`,
        description: node.description,
      },
    });

    byName.set(node.name, category);

    if (node.children?.length) {
      const descendants = await seedCategoryTree(node.children, category);
      for (const [name, doc] of descendants) byName.set(name, doc);
    }
  }

  return byName;
}

// ── Products ────────────────────────────────────────────────────────────────

function buildVariants(product: SeedProduct, sku: string) {
  if (!product.variants?.length) return [];

  return product.variants.map((variant, index) => {
    // A readable SKU suffix from the option values, e.g. NOVA-PULSE7-MID-128GB.
    const suffix = variant.optionValues
      .map((ov) =>
        ov.value
          .replace(/[^A-Za-z0-9]/g, '')
          .slice(0, 6)
          .toUpperCase(),
      )
      .join('-');

    return {
      sku: `${sku}-${suffix || index + 1}`,
      optionValues: variant.optionValues,
      price: product.price + (variant.priceDelta ?? 0),
      compareAtPrice: product.compareAtPrice
        ? product.compareAtPrice + (variant.priceDelta ?? 0)
        : undefined,
      costPrice: Math.round((product.price + (variant.priceDelta ?? 0)) * 0.62),
      stock: {
        available: variant.available,
        reserved: 0,
        sold: Math.floor(Math.random() * 40),
        lowStockThreshold: variant.lowStockThreshold ?? 5,
      },
      images: [],
      weightGrams: product.weightGrams,
      isActive: true,
    };
  });
}

/**
 * Placeholder imagery.
 *
 * Deterministic per product so the same product keeps the same picture across
 * re-seeds, which makes visual regressions obvious rather than mysterious.
 * Real uploads go to MinIO through the presigned flow.
 */
function buildImages(product: SeedProduct) {
  const seed = toSlug(product.name);
  return [0, 1, 2].map((position) => ({
    url: `https://picsum.photos/seed/${seed}-${position}/900/900`,
    alt: `${product.name} — view ${position + 1}`,
    position,
  }));
}

async function seedCatalog(
  categoriesByName: Map<string, CategoryDocument>,
  brandsByName: Map<string, mongoose.Types.ObjectId>,
): Promise<void> {
  for (const seed of seedProducts) {
    const category = categoriesByName.get(seed.category);
    if (!category) {
      console.warn(`  ! Skipping "${seed.name}" — unknown category "${seed.category}"`);
      continue;
    }

    const sku = toSlug(seed.name).toUpperCase().replace(/-/g, '-').slice(0, 24);
    const variants = buildVariants(seed, sku);

    // categoryPath is the product's own categories plus every ancestor, which is
    // what makes a top-level category filter one indexed match.
    const categoryPath = [category._id, ...category.ancestors];

    const options = seed.options?.map((option, position) => ({ ...option, position })) ?? [];

    const product = new Product({
      name: seed.name,
      slug: toSlug(seed.name),
      sku,
      description: seed.description,
      shortDescription: seed.shortDescription,
      brand: brandsByName.get(seed.brand),
      categories: [category._id],
      categoryPath,
      tags: seed.tags,
      images: buildImages(seed),
      price: seed.price,
      compareAtPrice: seed.compareAtPrice,
      costPrice: Math.round(seed.price * 0.62),
      taxRate: env.DEFAULT_TAX_RATE,
      taxInclusive: true,
      options,
      variants,
      specifications: seed.specifications ?? [],
      weightGrams: seed.weightGrams,
      status: 'active',
      publishedAt: new Date(),
      isFeatured: seed.isFeatured ?? false,
      isBestseller: seed.isBestseller ?? false,
      isNewArrival: seed.isNewArrival ?? false,
      soldCount: Math.floor(Math.random() * 500),
      viewCount: Math.floor(Math.random() * 5000),
      seo: {
        title: `${seed.name} | Aurora`,
        description: seed.shortDescription,
        keywords: seed.tags,
      },
    });

    // Products without variants carry their stock at the product level; the
    // rollup hook needs `totalStock` set for `inStock` to be correct.
    if (!variants.length && seed.stock !== undefined) {
      product.totalStock = seed.stock;
    }

    await product.save();
  }
}

// ── Users, reviews, coupons ─────────────────────────────────────────────────

async function seedUsers() {
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const [admin, manager, support, ...customers] = await User.create([
    {
      name: 'Aurora Admin',
      email: 'admin@aurora.local',
      passwordHash,
      role: 'admin',
      status: 'active',
      emailVerifiedAt: new Date(),
    },
    {
      name: 'Maya Manager',
      email: 'manager@aurora.local',
      passwordHash,
      role: 'manager',
      status: 'active',
      emailVerifiedAt: new Date(),
    },
    {
      name: 'Sam Support',
      email: 'support@aurora.local',
      passwordHash,
      role: 'support',
      status: 'active',
      emailVerifiedAt: new Date(),
    },
    {
      name: 'Priya Sharma',
      email: 'priya@example.com',
      passwordHash,
      role: 'customer',
      status: 'active',
      emailVerifiedAt: new Date(),
      phone: '9876543210',
      addresses: [
        {
          label: 'home',
          fullName: 'Priya Sharma',
          phone: '9876543210',
          line1: '14 Brigade Road, Flat 3B',
          city: 'Bengaluru',
          state: 'Karnataka',
          postalCode: '560001',
          country: 'India',
          isDefaultShipping: true,
          isDefaultBilling: true,
        },
      ],
    },
    {
      name: 'Arjun Mehta',
      email: 'arjun@example.com',
      passwordHash,
      role: 'customer',
      status: 'active',
      emailVerifiedAt: new Date(),
      phone: '9812345678',
      addresses: [
        {
          label: 'work',
          fullName: 'Arjun Mehta',
          phone: '9812345678',
          line1: '221 Marine Drive',
          line2: 'Level 8',
          city: 'Mumbai',
          state: 'Maharashtra',
          postalCode: '400020',
          country: 'India',
          isDefaultShipping: true,
          isDefaultBilling: true,
        },
      ],
    },
    {
      name: 'Neha Iyer',
      email: 'neha@example.com',
      passwordHash,
      role: 'customer',
      status: 'active',
      // Deliberately unverified, so the verification banner and any
      // verified-email gate have a real case to exercise.
    },
  ]);

  return { admin, manager, support, customers };
}

/**
 * Reviews with a realistic distribution.
 *
 * Skewed towards 4 and 5 stars the way real ratings are, so the rating facet and
 * the "4 stars & up" filter have a believable shape rather than a flat one.
 */
const REVIEW_TEXTS = [
  {
    rating: 5,
    title: 'Exactly as described',
    comment:
      'Arrived quickly and matches the listing precisely. No complaints at all after three weeks of daily use.',
  },
  {
    rating: 5,
    title: 'Worth the money',
    comment:
      'I hesitated at this price but it has held up better than the cheaper one it replaced. Would buy again.',
  },
  {
    rating: 4,
    title: 'Very good, one small niggle',
    comment:
      'Build quality is excellent. Only reason for four stars is that the packaging was awkward to open.',
  },
  {
    rating: 4,
    title: 'Happy with it',
    comment:
      'Does what it says. Delivery was a day later than estimated but that is hardly the product’s fault.',
  },
  {
    rating: 5,
    title: 'Better than expected',
    comment:
      'Genuinely surprised by the finish at this price point. The photos do not quite do it justice.',
  },
  {
    rating: 3,
    title: 'Fine, not exceptional',
    comment:
      'It works. I would probably look at other options next time, but there is nothing wrong with it.',
  },
  {
    rating: 4,
    title: 'Good buy',
    comment: 'Sizing runs true. Comfortable straight away with no break-in period needed.',
  },
  {
    rating: 2,
    title: 'Not for me',
    comment:
      'Quality seems fine but it did not suit what I needed it for. Returns process was straightforward.',
  },
];

async function seedReviews(customerIds: mongoose.Types.ObjectId[]): Promise<void> {
  const products = await Product.find().select('_id').lean();
  // Reviews normally require a verified purchase; the seed writes them directly
  // because orders do not exist until Phase 6.
  const placeholderOrderId = new mongoose.Types.ObjectId();

  for (const product of products) {
    const reviewCount = 2 + Math.floor(Math.random() * 5);
    const buckets = [0, 0, 0, 0, 0];
    let ratingSum = 0;
    let created = 0;

    for (let i = 0; i < reviewCount; i += 1) {
      const template = REVIEW_TEXTS[Math.floor(Math.random() * REVIEW_TEXTS.length)]!;
      const user = customerIds[i % customerIds.length]!;

      try {
        await Review.create({
          user,
          product: product._id,
          // Unique per review so the {user, product, order} constraint holds.
          order: new mongoose.Types.ObjectId(),
          rating: template.rating,
          title: template.title,
          comment: template.comment,
          isVerifiedPurchase: true,
          status: 'approved',
        });
        buckets[template.rating - 1] = (buckets[template.rating - 1] ?? 0) + 1;
        ratingSum += template.rating;
        created += 1;
      } catch {
        // Duplicate {user, product, order} — skip and carry on.
      }
    }

    if (created > 0) {
      await Product.updateOne(
        { _id: product._id },
        {
          $set: {
            'rating.average': Math.round((ratingSum / created) * 10) / 10,
            'rating.count': created,
            'rating.buckets': buckets,
            reviewCount: created,
          },
        },
      );
    }
  }

  void placeholderOrderId;
}

async function seedCoupons(adminId: mongoose.Types.ObjectId): Promise<void> {
  const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000);

  await Coupon.create([
    {
      code: 'WELCOME10',
      description: '10% off your first order',
      type: 'percentage',
      value: 10,
      minOrderValue: 999,
      maxDiscount: 500,
      perUserLimit: 1,
      firstOrderOnly: true,
      startsAt: new Date(),
      expiresAt: daysFromNow(90),
      createdBy: adminId,
    },
    {
      code: 'FLAT500',
      description: '₹500 off orders over ₹4,999',
      type: 'fixed',
      value: 500,
      minOrderValue: 4999,
      usageLimit: 500,
      perUserLimit: 2,
      startsAt: new Date(),
      expiresAt: daysFromNow(30),
      createdBy: adminId,
    },
    {
      code: 'FREESHIP',
      description: 'Free shipping on any order',
      type: 'free_shipping',
      value: 0,
      minOrderValue: 0,
      perUserLimit: 5,
      startsAt: new Date(),
      expiresAt: daysFromNow(60),
      createdBy: adminId,
    },
    {
      code: 'EXPIRED20',
      description: 'Expired coupon, for testing rejection',
      type: 'percentage',
      value: 20,
      minOrderValue: 0,
      perUserLimit: 1,
      startsAt: daysFromNow(-60),
      // Deliberately in the past: the checkout must refuse it.
      expiresAt: daysFromNow(-1),
      createdBy: adminId,
    },
  ]);
}

// ── Runner ──────────────────────────────────────────────────────────────────

/**
 * Close every open handle.
 *
 * The services this script imports open a Redis connection, and Redis keeps the
 * event loop alive — without this the seed finishes its work and then hangs
 * forever, which is invisible locally and fatal in CI.
 */
async function shutdown(): Promise<void> {
  await Promise.allSettled([disconnectDatabase(), cache.disconnect()]);
}

async function run(): Promise<void> {
  const fresh = process.argv.includes('--fresh');

  console.log('\n▸ Seeding Aurora development data\n');
  await connectDatabase();

  const existing = await Product.estimatedDocumentCount();
  if (existing > 0 && !fresh) {
    console.log('  Database already contains products.');
    console.log('  Re-run with --fresh to wipe and reseed.\n');
    await shutdown();
    return;
  }

  if (fresh) {
    log('Clearing existing data…');
    // Every collection the seed writes to. Deliberately explicit rather than
    // dropping the database, which would also drop the indexes.
    await Promise.all([
      User.deleteMany({}),
      Category.deleteMany({}),
      Brand.deleteMany({}),
      Product.deleteMany({}),
      Review.deleteMany({}),
      Coupon.deleteMany({}),
    ]);
  }

  log('Creating categories…');
  const categoriesByName = await seedCategoryTree(seedCategories);
  log(`  ${categoriesByName.size} categories across 3 levels`);

  log('Creating brands…');
  // insertMany rather than create(array): the array overload of create() cannot
  // infer a document type from a mapped literal, and `status` would widen to
  // `string` against the schema's enum.
  const brands = await Brand.insertMany(
    seedBrands.map((brand) => ({
      ...brand,
      slug: toSlug(brand.name),
      status: 'active' as const,
    })),
  );
  const brandsByName = new Map(brands.map((b) => [b.name, b._id]));
  log(`  ${brands.length} brands`);

  log('Creating products…');
  await seedCatalog(categoriesByName, brandsByName);
  const productCount = await Product.countDocuments();
  const variantCount = await Product.aggregate<{ total: number }>([
    { $group: { _id: null, total: { $sum: { $size: '$variants' } } } },
  ]);
  log(`  ${productCount} products with ${variantCount[0]?.total ?? 0} variants`);

  log('Creating users…');
  const { admin, customers } = await seedUsers();
  log(`  3 staff + ${customers.length} customers`);

  log('Creating reviews…');
  await seedReviews(customers.map((c) => c._id));
  log(`  ${await Review.countDocuments()} approved reviews`);

  log('Creating coupons…');
  await seedCoupons(admin!._id);
  log(`  ${await Coupon.countDocuments()} coupons`);

  log('Refreshing denormalized counts…');
  await refreshProductCounts();
  await refreshBrandCounts();

  const outOfStock = await Product.countDocuments({ inStock: false });
  const lowStock = await Product.countDocuments({
    $expr: {
      $anyElementTrue: {
        $map: {
          input: '$variants',
          as: 'v',
          in: {
            $and: [
              { $lte: ['$$v.stock.available', '$$v.stock.lowStockThreshold'] },
              { $gt: ['$$v.stock.available', 0] },
            ],
          },
        },
      },
    },
  });

  console.log('\n✔ Seed complete\n');
  console.log('  Sign in with:');
  console.log(`    Admin     admin@aurora.local     ${DEMO_PASSWORD}`);
  console.log(`    Manager   manager@aurora.local   ${DEMO_PASSWORD}`);
  console.log(`    Support   support@aurora.local   ${DEMO_PASSWORD}`);
  console.log(`    Customer  priya@example.com      ${DEMO_PASSWORD}`);
  console.log('\n  Catalog shape (deliberately uneven, to exercise the filters):');
  console.log(`    ${productCount} products, ${variantCount[0]?.total ?? 0} variants`);
  console.log(`    ${lowStock} products with a low-stock variant`);
  console.log(`    ${outOfStock} products fully out of stock\n`);

  await shutdown();
}

run()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error('\n✖ Seed failed:', err);
    await shutdown().catch(() => undefined);
    process.exit(1);
  });
