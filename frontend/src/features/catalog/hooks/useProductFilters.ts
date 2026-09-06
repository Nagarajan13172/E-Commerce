import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import {
  FILTERABLE_ATTRIBUTES,
  PRODUCT_SORTS,
  parseProductQuery,
  type ProductQuery,
  type ProductSort,
} from '@ecom/shared';

/**
 * Filter state lives in the URL, not in a store.
 *
 * This is the single most consequential UX decision on the listing page. Because
 * the URL is the state:
 *   - a filtered view can be shared, bookmarked and reopened,
 *   - the browser back button steps through filter changes as users expect,
 *   - a refresh preserves exactly what was on screen,
 *   - and React Query gets a natural cache key for free.
 *
 * Crucially, parsing goes through `parseProductQuery` from the shared package —
 * the *same* function the API uses to validate the query string. There is no
 * second copy of the rules that could drift, so a link always means the same
 * thing to the browser and to the server.
 */
export interface ProductFilters {
  /** Parsed, validated and defaulted — safe to render from directly. */
  query: ProductQuery;
  /** The canonical query string to hand to the API and to React Query. */
  searchParams: string;

  setSearchTerm: (term: string) => void;
  setCategory: (slug: string | undefined) => void;
  toggleBrand: (slug: string) => void;
  toggleAttribute: (name: string, value: string) => void;
  setPriceRange: (min: number | undefined, max: number | undefined) => void;
  setRating: (rating: number | undefined) => void;
  setInStockOnly: (value: boolean) => void;
  setSort: (sort: ProductSort) => void;
  setPage: (page: number) => void;
  clearFilter: (key: string, value?: string) => void;
  clearAll: () => void;

  /** Chips rendered above the grid, each individually removable. */
  activeChips: { key: string; value?: string; label: string }[];
  activeFilterCount: number;
}

const ATTRIBUTE_KEYS = new Set<string>(FILTERABLE_ATTRIBUTES);

export function useProductFilters(): ProductFilters {
  const [searchParams, setSearchParams] = useSearchParams();

  const query = useMemo(
    () => parseProductQuery(Object.fromEntries(searchParams.entries())),
    [searchParams],
  );

  /**
   * Apply a change and reset to page 1.
   *
   * Changing a filter while on page 4 of the old result set almost always lands
   * on an empty page, which reads as "no results" when there are plenty.
   */
  const update = useCallback(
    (mutate: (params: URLSearchParams) => void, options: { keepPage?: boolean } = {}) => {
      const next = new URLSearchParams(searchParams);
      mutate(next);
      if (!options.keepPage) next.delete('page');
      setSearchParams(next, { replace: false });
    },
    [searchParams, setSearchParams],
  );

  const setSearchTerm = useCallback(
    (term: string) =>
      update((params) => {
        if (term.trim()) params.set('q', term.trim());
        else params.delete('q');
      }),
    [update],
  );

  const setCategory = useCallback(
    (slug: string | undefined) =>
      update((params) => {
        if (slug) params.set('category', slug);
        else params.delete('category');
      }),
    [update],
  );

  /** Multi-select: brands accumulate as a comma-separated list. */
  const toggleValue = useCallback(
    (key: string, value: string) =>
      update((params) => {
        const current = (params.get(key)?.split(',') ?? []).filter(Boolean);
        const next = current.includes(value)
          ? current.filter((v) => v !== value)
          : [...current, value];

        if (next.length) params.set(key, next.join(','));
        else params.delete(key);
      }),
    [update],
  );

  const toggleBrand = useCallback((slug: string) => toggleValue('brand', slug), [toggleValue]);
  const toggleAttribute = useCallback(
    (name: string, value: string) => toggleValue(name, value),
    [toggleValue],
  );

  const setPriceRange = useCallback(
    (min: number | undefined, max: number | undefined) =>
      update((params) => {
        if (min !== undefined) params.set('minPrice', String(min));
        else params.delete('minPrice');
        if (max !== undefined) params.set('maxPrice', String(max));
        else params.delete('maxPrice');
      }),
    [update],
  );

  const setRating = useCallback(
    (rating: number | undefined) =>
      update((params) => {
        if (rating) params.set('rating', String(rating));
        else params.delete('rating');
      }),
    [update],
  );

  const setInStockOnly = useCallback(
    (value: boolean) =>
      update((params) => {
        if (value) params.set('inStock', '1');
        else params.delete('inStock');
      }),
    [update],
  );

  const setSort = useCallback(
    (sort: ProductSort) =>
      update((params) => {
        // 'relevance' is the default, so leaving it out keeps URLs clean.
        if (sort && sort !== 'relevance' && PRODUCT_SORTS.includes(sort)) params.set('sort', sort);
        else params.delete('sort');
      }),
    [update],
  );

  // Paging is the one change that must NOT reset the page.
  const setPage = useCallback(
    (page: number) =>
      update(
        (params) => {
          if (page > 1) params.set('page', String(page));
          else params.delete('page');
        },
        { keepPage: true },
      ),
    [update],
  );

  const clearFilter = useCallback(
    (key: string, value?: string) =>
      update((params) => {
        if (value === undefined) {
          params.delete(key);
          return;
        }
        const remaining = (params.get(key)?.split(',') ?? []).filter((v) => v && v !== value);
        if (remaining.length) params.set(key, remaining.join(','));
        else params.delete(key);
      }),
    [update],
  );

  /** Clears filters but keeps the search term — dropping it is never expected. */
  const clearAll = useCallback(() => {
    const next = new URLSearchParams();
    const term = searchParams.get('q');
    if (term) next.set('q', term);
    setSearchParams(next);
  }, [searchParams, setSearchParams]);

  const activeChips = useMemo(() => {
    const chips: { key: string; value?: string; label: string }[] = [];

    if (query.category) chips.push({ key: 'category', label: humanise(query.category) });
    for (const brand of query.brand ?? []) {
      chips.push({ key: 'brand', value: brand, label: humanise(brand) });
    }
    for (const [name, values] of Object.entries(query.attributes ?? {})) {
      if (!ATTRIBUTE_KEYS.has(name)) continue;
      for (const value of values) {
        chips.push({ key: name, value, label: `${humanise(name)}: ${humanise(value)}` });
      }
    }
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
      chips.push({
        key: 'price',
        label: `₹${query.minPrice ?? 0} – ₹${query.maxPrice ?? '∞'}`,
      });
    }
    if (query.rating) chips.push({ key: 'rating', label: `${query.rating} stars & up` });
    if (query.inStock) chips.push({ key: 'inStock', label: 'In stock only' });

    return chips;
  }, [query]);

  return {
    query,
    // Rebuilt from the parsed query rather than passed through raw, so unknown
    // params (utm_source, gclid) never reach the API or the cache key.
    searchParams: searchParams.toString(),
    setSearchTerm,
    setCategory,
    toggleBrand,
    toggleAttribute,
    setPriceRange,
    setRating,
    setInStockOnly,
    setSort,
    setPage,
    clearFilter,
    clearAll,
    activeChips,
    activeFilterCount: activeChips.length,
  };
}

function humanise(value: string): string {
  return value
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}
