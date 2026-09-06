import { beforeEach, describe, expect, it } from 'vitest';
import { useTestDatabase } from '../helpers/db.js';
import { createApiAgent, type ApiAgent } from '../helpers/api.js';
import { makeBrand, makeCategory, makeProduct } from '../helpers/factories.js';
import { createApp } from '../../src/app.js';

useTestDatabase();

const app = createApp();
let api: ApiAgent;

beforeEach(async () => {
  api = await createApiAgent(app);
});

/**
 * A small but deliberately shaped catalog:
 *   Electronics > Audio > Headphones
 *   Fashion     > Footwear
 * with two brands, varied prices, ratings and stock.
 */
async function seedCatalog() {
  const [electronics, fashion] = await Promise.all([
    makeCategory('Electronics'),
    makeCategory('Fashion'),
  ]);
  const audio = await makeCategory('Audio', electronics);
  const headphones = await makeCategory('Headphones', audio);
  const footwear = await makeCategory('Footwear', fashion);

  const [lumen, stride] = await Promise.all([makeBrand('Lumen'), makeBrand('Stride')]);

  const products = await Promise.all([
    makeProduct({
      name: 'Lumen Studio Headphones',
      price: 25000,
      compareAtPrice: 30000,
      brand: lumen._id,
      category: headphones,
      tags: ['audio', 'studio'],
      rating: 5,
      variants: [
        { color: 'Black', available: 10 },
        { color: 'Walnut', available: 0 },
      ],
    }),
    makeProduct({
      name: 'Lumen Travel Earbuds',
      price: 8000,
      brand: lumen._id,
      category: headphones,
      tags: ['audio', 'travel'],
      rating: 4,
      variants: [{ color: 'Black', available: 25 }],
    }),
    makeProduct({
      name: 'Stride Runner',
      price: 12000,
      brand: stride._id,
      category: footwear,
      tags: ['running'],
      rating: 4,
      variants: [
        { color: 'Black', size: '9', available: 5 },
        { color: 'Blue', size: '10', available: 0 },
      ],
    }),
    makeProduct({
      name: 'Draft Product',
      price: 500,
      category: footwear,
      status: 'draft',
      stock: 10,
    }),
  ]);

  return { electronics, audio, headphones, fashion, footwear, lumen, stride, products };
}

describe('product listing', () => {
  it('returns only active products', async () => {
    await seedCatalog();
    const res = await api.get('/products');

    expect(res.status).toBe(200);
    // The draft must not be visible to the storefront.
    expect(res.body.meta.total).toBe(3);
    expect(res.body.data.items.map((p: { name: string }) => p.name)).not.toContain('Draft Product');
  });

  it('matches every descendant when filtering by an ancestor category', async () => {
    await seedCatalog();

    // Headphones sit three levels under Electronics.
    const res = await api.get('/products?category=electronics');
    expect(res.body.meta.total).toBe(2);

    const leaf = await api.get('/products?category=headphones');
    expect(leaf.body.meta.total).toBe(2);
  });

  it('matches nothing for an unknown category rather than everything', async () => {
    await seedCatalog();
    // The dangerous failure mode: silently ignoring the filter and returning
    // the whole catalog, which looks like it works until someone notices.
    const res = await api.get('/products?category=no-such-category');

    expect(res.body.meta.total).toBe(0);
  });

  it('filters by brand slug', async () => {
    await seedCatalog();
    const res = await api.get('/products?brand=lumen');

    expect(res.body.meta.total).toBe(2);
  });

  it('composes category, brand, price, rating and availability together', async () => {
    await seedCatalog();
    const res = await api.get(
      '/products?category=electronics&brand=lumen&minPrice=20000&maxPrice=30000&rating=4&inStock=1',
    );

    expect(res.body.meta.total).toBe(1);
    expect(res.body.data.items[0].name).toBe('Lumen Studio Headphones');
  });

  it('filters by a variant attribute', async () => {
    await seedCatalog();

    const black = await api.get('/products?color=black');
    expect(black.body.meta.total).toBe(3);

    const walnut = await api.get('/products?color=walnut');
    expect(walnut.body.meta.total).toBe(1);
  });

  it('ANDs across attributes and ORs within one', async () => {
    await seedCatalog();

    // Only the Stride Runner has both a colour and a size.
    const both = await api.get('/products?color=black&size=9');
    expect(both.body.meta.total).toBe(1);

    const eitherColour = await api.get('/products?color=black,walnut');
    expect(eitherColour.body.meta.total).toBe(3);
  });

  it('finds products by full-text search', async () => {
    await seedCatalog();
    const res = await api.get('/products?q=headphones');

    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    expect(res.body.data.items[0].name).toContain('Headphones');
  });

  it('sorts by price in both directions', async () => {
    await seedCatalog();

    const asc = await api.get('/products?sort=price_asc');
    const prices = asc.body.data.items.map(
      (p: { priceRange: { min: number } }) => p.priceRange.min,
    );
    expect(prices).toEqual([...prices].sort((a: number, b: number) => a - b));

    const desc = await api.get('/products?sort=price_desc');
    const maxes = desc.body.data.items.map(
      (p: { priceRange: { max: number } }) => p.priceRange.max,
    );
    expect(maxes).toEqual([...maxes].sort((a: number, b: number) => b - a));
  });

  it('paginates without repeating or dropping items', async () => {
    await seedCatalog();

    const [page1, page2] = await Promise.all([
      api.get('/products?limit=2&page=1&sort=newest'),
      api.get('/products?limit=2&page=2&sort=newest'),
    ]);

    const ids1 = page1.body.data.items.map((p: { _id: string }) => p._id);
    const ids2 = page2.body.data.items.map((p: { _id: string }) => p._id);

    // The `_id` tiebreaker in every sort is what guarantees this.
    expect(ids1.filter((id: string) => ids2.includes(id))).toHaveLength(0);
    expect(page1.body.meta.totalPages).toBe(2);
  });

  it('clamps an oversized limit rather than trusting it or erroring', async () => {
    await seedCatalog();
    // A client asking for 10,000 rows must not be able to force that query —
    // but a mangled shared link should still render, not 422.
    const res = await api.get('/products?limit=99999');

    expect(res.status).toBe(200);
    expect(res.body.meta.limit).toBe(100);
  });

  it('survives junk pagination values in a shared URL', async () => {
    await seedCatalog();
    const res = await api.get('/products?page=abc&limit=-5');

    expect(res.status).toBe(200);
    expect(res.body.meta.page).toBe(1);
    expect(res.body.meta.limit).toBeGreaterThan(0);
  });
});

describe('facets', () => {
  it('returns buckets for every dimension', async () => {
    await seedCatalog();
    const { facets } = (await api.get('/products')).body.data;

    expect(facets.brands.map((b: { label: string }) => b.label).sort()).toEqual([
      'Lumen',
      'Stride',
    ]);
    expect(Object.keys(facets.attributes).sort()).toEqual(['color', 'size']);
    expect(facets.priceRange.min).toBe(8000);
    expect(facets.priceRange.max).toBe(25000);
    expect(facets.availability.inStock).toBe(3);
  });

  it('keeps other brands visible after one is selected', async () => {
    await seedCatalog();
    const res = await api.get('/products?brand=lumen');

    // Results narrow to Lumen…
    expect(res.body.meta.total).toBe(2);
    // …but the facet still offers Stride, or the user could never widen again.
    // A facet that collapses to the current selection is a broken multi-select.
    const labels = res.body.data.facets.brands.map((b: { label: string }) => b.label);
    expect(labels).toContain('Stride');
  });
});

describe('product detail', () => {
  it('returns a product with its brand and categories populated', async () => {
    await seedCatalog();
    const res = await api.get('/products/lumen-studio-headphones');

    expect(res.status).toBe(200);
    expect(res.body.data.product.brand.name).toBe('Lumen');
    expect(res.body.data.product.variants).toHaveLength(2);
  });

  it('404s for an unknown slug with a specific code', async () => {
    const res = await api.get('/products/does-not-exist');

    expect(res.status).toBe(404);
    expect(res.body.code).toBe('PRODUCT_NOT_FOUND');
  });

  it('does not expose a draft product by slug', async () => {
    await seedCatalog();
    const res = await api.get('/products/draft-product');

    expect(res.status).toBe(404);
  });
});

describe('taxonomy', () => {
  it('returns categories as a nested tree', async () => {
    await seedCatalog();
    const res = await api.get('/categories');

    const roots = res.body.data.items;
    const electronics = roots.find((c: { name: string }) => c.name === 'Electronics');

    expect(electronics.children).toHaveLength(1);
    expect(electronics.children[0].name).toBe('Audio');
    expect(electronics.children[0].children[0].name).toBe('Headphones');
  });

  it('lists active brands', async () => {
    await seedCatalog();
    const res = await api.get('/brands');

    expect(res.body.data.items).toHaveLength(2);
  });
});

describe('typeahead', () => {
  it('matches a partial word, which $text alone cannot', async () => {
    await seedCatalog();
    // "head" is a prefix of "Headphones"; MongoDB's text index matches whole
    // words only, so this specifically covers the substring implementation.
    const res = await api.get('/search/suggest?q=head');

    expect(res.body.data.products.length).toBeGreaterThanOrEqual(1);
  });

  it('returns nothing for a single character', async () => {
    await seedCatalog();
    const res = await api.get('/search/suggest?q=h');

    expect(res.body.data.products).toHaveLength(0);
  });
});
