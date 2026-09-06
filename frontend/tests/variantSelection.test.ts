import { describe, expect, it } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useVariantSelection } from '@/features/catalog/hooks/useVariantSelection';
import type { ProductDetail, ProductVariant } from '@/types/catalog';

/**
 * The variant matrix is the trickiest logic on the storefront: it must tell the
 * customer which combinations exist *before* they click, and never dead-end them.
 */

function variant(color: string, size: string, available: number, price = 1000): ProductVariant {
  return {
    _id: `${color}-${size}`,
    sku: `SKU-${color}-${size}`.toUpperCase(),
    optionValues: [
      { name: 'Color', value: color },
      { name: 'Size', value: size },
    ],
    price,
    stock: { available, reserved: 0, sold: 0, lowStockThreshold: 5 },
    images: [],
    isActive: true,
  };
}

/** Black comes in 7/8/9, Cobalt only in 8/9 (and 9 is sold out), Coral only in 7. */
const product = {
  _id: 'p1',
  name: 'Test Shoe',
  slug: 'test-shoe',
  sku: 'TEST-SHOE',
  price: 1000,
  priceRange: { min: 1000, max: 1400 },
  options: [
    { name: 'Color', values: ['Black', 'Cobalt', 'Coral'], position: 0 },
    { name: 'Size', values: ['7', '8', '9'], position: 1 },
  ],
  variants: [
    variant('Black', '7', 5),
    variant('Black', '8', 3),
    variant('Black', '9', 2),
    variant('Cobalt', '8', 4, 1200),
    variant('Cobalt', '9', 0, 1200),
    variant('Coral', '7', 1, 1400),
  ],
  totalStock: 15,
} as unknown as ProductDetail;

describe('useVariantSelection', () => {
  it('preselects an in-stock variant once the product loads', () => {
    // Starts undefined, exactly as it does while the query is in flight.
    const { result, rerender } = renderHook(
      ({ p }: { p: ProductDetail | undefined }) => useVariantSelection(p),
      { initialProps: { p: undefined as ProductDetail | undefined } },
    );

    expect(result.current.variant).toBeUndefined();

    rerender({ p: product });

    // The regression this guards: a useState initializer would have run while
    // the product was undefined and never re-run, leaving nothing selected.
    expect(result.current.variant).toBeDefined();
    expect(result.current.availableStock).toBeGreaterThan(0);
    expect(result.current.isComplete).toBe(true);
  });

  it('marks values that do not combine with the current selection', () => {
    const { result } = renderHook(() => useVariantSelection(product));

    act(() => result.current.select('Color', 'Cobalt'));

    const sizes = result.current.optionValues.Size!;
    // Cobalt has no size 7.
    expect(sizes.find((s) => s.value === '7')?.isAvailable).toBe(false);
    expect(sizes.find((s) => s.value === '8')?.isAvailable).toBe(true);
    // Cobalt/9 exists but has no stock — a distinct state from "does not exist".
    expect(sizes.find((s) => s.value === '9')?.isAvailable).toBe(true);
    expect(sizes.find((s) => s.value === '9')?.isOutOfStock).toBe(true);
  });

  it('keeps every value that exists somewhere clickable, so the picker never dead-ends', () => {
    const { result } = renderHook(() => useVariantSelection(product));

    act(() => result.current.select('Color', 'Coral'));
    act(() => result.current.select('Size', '7'));

    const colours = result.current.optionValues.Color!;
    const cobalt = colours.find((c) => c.value === 'Cobalt')!;

    // Cobalt does not come in a 7 …
    expect(cobalt.isAvailable).toBe(false);
    // … but it IS sold, so it must remain selectable. Disabling it would trap a
    // customer who picked their size before their colour.
    expect(cobalt.existsAtAll).toBe(true);
  });

  it('clears a conflicting selection rather than producing an impossible pair', () => {
    const { result } = renderHook(() => useVariantSelection(product));

    act(() => result.current.select('Color', 'Coral'));
    act(() => result.current.select('Size', '7'));
    expect(result.current.sku).toBe('SKU-CORAL-7');

    // Cobalt has no 7, so the size must be dropped, not silently kept.
    act(() => result.current.select('Color', 'Cobalt'));

    expect(result.current.selected.Color).toBe('Cobalt');
    expect(result.current.selected.Size).toBeUndefined();
    expect(result.current.isComplete).toBe(false);
  });

  it('updates price, SKU and stock when the variant changes', () => {
    const { result } = renderHook(() => useVariantSelection(product));

    act(() => result.current.select('Color', 'Black'));
    act(() => result.current.select('Size', '8'));
    expect(result.current.price).toBe(1000);
    expect(result.current.sku).toBe('SKU-BLACK-8');
    expect(result.current.availableStock).toBe(3);

    act(() => result.current.select('Color', 'Cobalt'));
    act(() => result.current.select('Size', '9'));
    expect(result.current.price).toBe(1200);
    expect(result.current.sku).toBe('SKU-COBALT-9');
    expect(result.current.availableStock).toBe(0);
  });

  it('treats a product with no options as always complete', () => {
    const simple = {
      ...product,
      options: [],
      variants: [],
      totalStock: 7,
    } as unknown as ProductDetail;

    const { result } = renderHook(() => useVariantSelection(simple));

    expect(result.current.isComplete).toBe(true);
    expect(result.current.availableStock).toBe(7);
  });
});
