import { apiGet, apiGetWithMeta } from '@/lib/apiClient';
import type {
  CategoryNode,
  HomepageSections,
  PaginationMeta,
  ProductDetail,
  ProductListResponse,
  ProductSummary,
  BrandRef,
} from '@/types/catalog';

export interface ProductListResult extends ProductListResponse {
  meta: PaginationMeta;
}

/**
 * Catalog API calls.
 *
 * `searchParams` is passed straight through as the query string, because the URL
 * *is* the filter state — there is no second representation to translate from,
 * which is what keeps a shared link meaning the same thing to both sides.
 */
export async function fetchProducts(searchParams: string): Promise<ProductListResult> {
  const { data, meta } = await apiGetWithMeta<ProductListResponse, PaginationMeta>(
    `/products${searchParams ? `?${searchParams}` : ''}`,
  );
  return { ...data, meta };
}

export async function fetchProduct(slug: string): Promise<ProductDetail> {
  const { product } = await apiGet<{ product: ProductDetail }>(`/products/${slug}`);
  return product;
}

export async function fetchRelatedProducts(slug: string): Promise<ProductSummary[]> {
  const { items } = await apiGet<{ items: ProductSummary[] }>(`/products/${slug}/related`);
  return items;
}

export async function fetchCategoryTree(): Promise<CategoryNode[]> {
  const { items } = await apiGet<{ items: CategoryNode[] }>('/categories');
  return items;
}

export async function fetchBrands(): Promise<BrandRef[]> {
  const { items } = await apiGet<{ items: BrandRef[] }>('/brands');
  return items;
}

export async function fetchHomepage(): Promise<HomepageSections> {
  return apiGet<HomepageSections>('/home');
}

export interface Suggestions {
  products: ProductSummary[];
  terms: string[];
}

export async function fetchSuggestions(term: string, signal?: AbortSignal): Promise<Suggestions> {
  return apiGet<Suggestions>(`/search/suggest?q=${encodeURIComponent(term)}`, { signal });
}
