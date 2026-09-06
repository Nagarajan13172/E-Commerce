import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { STALE_TIME } from '@/lib/queryClient';
import {
  fetchBrands,
  fetchCategoryTree,
  fetchHomepage,
  fetchProduct,
  fetchProducts,
  fetchRelatedProducts,
  fetchSuggestions,
} from './catalog.api';

/**
 * Query key factory.
 *
 * Hierarchical on purpose: invalidating `catalogKeys.products()` drops every
 * cached filter combination at once, which is what a catalog mutation needs.
 * Hand-written key arrays scattered across components make that impossible to
 * do reliably.
 */
export const catalogKeys = {
  all: ['catalog'] as const,
  products: () => [...catalogKeys.all, 'products'] as const,
  productList: (searchParams: string) => [...catalogKeys.products(), 'list', searchParams] as const,
  productDetail: (slug: string) => [...catalogKeys.products(), 'detail', slug] as const,
  related: (slug: string) => [...catalogKeys.products(), 'related', slug] as const,
  categories: () => [...catalogKeys.all, 'categories'] as const,
  brands: () => [...catalogKeys.all, 'brands'] as const,
  home: () => [...catalogKeys.all, 'home'] as const,
  suggestions: (term: string) => [...catalogKeys.all, 'suggest', term] as const,
};

export function useProducts(searchParams: string) {
  return useQuery({
    queryKey: catalogKeys.productList(searchParams),
    queryFn: () => fetchProducts(searchParams),
    staleTime: STALE_TIME.MEDIUM,
    // Keeps the previous page rendered while the next one loads, so paging and
    // filtering do not blank the grid and collapse the page height.
    placeholderData: keepPreviousData,
  });
}

export function useProduct(slug: string) {
  return useQuery({
    queryKey: catalogKeys.productDetail(slug),
    queryFn: () => fetchProduct(slug),
    staleTime: STALE_TIME.MEDIUM,
    enabled: Boolean(slug),
  });
}

export function useRelatedProducts(slug: string) {
  return useQuery({
    queryKey: catalogKeys.related(slug),
    queryFn: () => fetchRelatedProducts(slug),
    staleTime: STALE_TIME.MEDIUM,
    enabled: Boolean(slug),
  });
}

export function useCategoryTree() {
  return useQuery({
    queryKey: catalogKeys.categories(),
    queryFn: fetchCategoryTree,
    // The tree changes only when an admin edits it, so it can be cached hard.
    staleTime: STALE_TIME.LONG,
  });
}

export function useBrands() {
  return useQuery({
    queryKey: catalogKeys.brands(),
    queryFn: fetchBrands,
    staleTime: STALE_TIME.LONG,
  });
}

export function useHomepage() {
  return useQuery({
    queryKey: catalogKeys.home(),
    queryFn: fetchHomepage,
    staleTime: STALE_TIME.MEDIUM,
  });
}

/**
 * Typeahead.
 *
 * The caller debounces the term before it reaches this hook, so React Query
 * caches one entry per settled term rather than one per keystroke. The signal
 * cancels an in-flight request when the term changes again.
 */
export function useSuggestions(term: string) {
  return useQuery({
    queryKey: catalogKeys.suggestions(term),
    queryFn: ({ signal }) => fetchSuggestions(term, signal),
    enabled: term.trim().length >= 2,
    staleTime: STALE_TIME.MEDIUM,
  });
}
