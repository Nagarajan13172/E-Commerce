import type { ProductQuery } from '@ecom/shared';

export interface SearchResultItem {
  _id: string;
  name: string;
  slug: string;
  sku: string;
  thumbnail?: string;
  images: { url: string; alt?: string }[];
  brand?: { _id: string; name: string; slug: string };
  price: number;
  compareAtPrice?: number;
  priceRange: { min: number; max: number };
  discountPercent: number;
  inStock: boolean;
  totalStock: number;
  variantCount: number;
  rating: { average: number; count: number };
  isFeatured: boolean;
  isBestseller: boolean;
  isNewArrival: boolean;
  tags: string[];
  createdAt: string;
}

export interface FacetBucket {
  value: string;
  label: string;
  count: number;
}

export interface SearchFacets {
  brands: FacetBucket[];
  categories: FacetBucket[];
  attributes: Record<string, FacetBucket[]>;
  priceRange: { min: number; max: number };
  ratings: FacetBucket[];
  availability: { inStock: number; outOfStock: number };
}

export interface SearchResult {
  items: SearchResultItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  facets: SearchFacets;
}

/**
 * Product search abstraction.
 *
 * Controllers depend on this interface and never on MongoDB query syntax, so a
 * later move to Atlas Search, Elasticsearch or Typesense is a new adapter rather
 * than a rewrite of the catalog layer. That matters because `$text` is the
 * weakest part of this stack: no typo tolerance, no synonyms, no per-field
 * boosting beyond static weights.
 */
export interface SearchService {
  search(query: ProductQuery): Promise<SearchResult>;
  /** Lightweight typeahead — deliberately not the full search pipeline. */
  suggest(term: string, limit?: number): Promise<{ products: SearchResultItem[]; terms: string[] }>;
}
