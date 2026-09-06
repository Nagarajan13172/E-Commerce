/**
 * Catalog response shapes.
 *
 * Hand-written rather than inferred from the Mongoose models: the API returns a
 * deliberately narrower projection than the database stores, and typing the
 * client against the database would promise fields the wire never carries.
 */

export interface BrandRef {
  _id: string;
  name: string;
  slug: string;
  logo?: string;
}

export interface CategoryRef {
  _id: string;
  name: string;
  slug: string;
  path?: string;
}

export interface CategoryNode extends CategoryRef {
  description?: string;
  image?: string;
  level: number;
  productCount: number;
  isFeatured: boolean;
  children: CategoryNode[];
}

export interface ProductImage {
  url: string;
  alt?: string;
  position: number;
}

/** The shape the listing grid receives — projected, not the full document. */
export interface ProductSummary {
  _id: string;
  name: string;
  slug: string;
  sku: string;
  thumbnail?: string;
  images: ProductImage[];
  brand?: BrandRef;
  price: number;
  compareAtPrice?: number;
  priceRange: { min: number; max: number };
  discountPercent: number;
  inStock: boolean;
  totalStock: number;
  variantCount: number;
  rating: { average: number; count: number };
  isFeatured?: boolean;
  isBestseller?: boolean;
  isNewArrival?: boolean;
  tags?: string[];
  createdAt: string;
}

export interface ProductOption {
  name: string;
  values: string[];
  position: number;
}

export interface ProductVariant {
  _id: string;
  sku: string;
  optionValues: { name: string; value: string }[];
  price: number;
  compareAtPrice?: number;
  stock: { available: number; reserved: number; sold: number; lowStockThreshold: number };
  images: string[];
  isActive: boolean;
}

export interface ProductDetail extends Omit<ProductSummary, 'brand'> {
  description: string;
  shortDescription?: string;
  brand?: BrandRef;
  categories: CategoryRef[];
  options: ProductOption[];
  variants: ProductVariant[];
  specifications: { group?: string; name: string; value: string }[];
  weightGrams?: number;
  dimensions?: { length: number; width: number; height: number; unit: string };
  taxRate: number;
  taxInclusive: boolean;
  currency: string;
  reviewCount?: number;
  seo?: { title?: string; description?: string; keywords?: string[] };
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

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface ProductListResponse {
  items: ProductSummary[];
  facets: SearchFacets;
}

export interface HomepageSections {
  featured: ProductSummary[];
  bestsellers: ProductSummary[];
  newArrivals: ProductSummary[];
  deals: ProductSummary[];
  featuredCategories: CategoryNode[];
}
