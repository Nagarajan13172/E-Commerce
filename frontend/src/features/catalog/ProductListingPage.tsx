import { useMemo } from 'react';
import { Link } from 'react-router';
import { PackageSearch, SlidersHorizontal } from 'lucide-react';
import { PRODUCT_SORTS, type ProductSort } from '@ecom/shared';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Badge } from '@/components/ui/badge';
import { ProductCard, ProductCardSkeleton } from '@/components/common/ProductCard';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Seo } from '@/components/common/Seo';
import { ProductFilters } from './components/ProductFilters';
import { ActiveFilterChips } from './components/ActiveFilterChips';
import { Pagination } from './components/Pagination';
import { useProductFilters } from './hooks/useProductFilters';
import { useProducts, useCategoryTree } from './api/queries';
import { useToggleWishlist, useWishlistIds } from '@/features/wishlist/api/queries';
import { useAddToCart } from '@/features/cart/api/queries';
import type { SearchFacets } from '@/types/catalog';

const SORT_LABELS: Record<ProductSort, string> = {
  relevance: 'Relevance',
  newest: 'Newest first',
  price_asc: 'Price: low to high',
  price_desc: 'Price: high to low',
  rating: 'Highest rated',
  popularity: 'Most viewed',
  best_selling: 'Best selling',
  discount: 'Biggest discount',
};

const EMPTY_FACETS: SearchFacets = {
  brands: [],
  categories: [],
  attributes: {},
  priceRange: { min: 0, max: 0 },
  ratings: [],
  availability: { inStock: 0, outOfStock: 0 },
};

/**
 * Product listing.
 *
 * All filter state lives in the URL (see `useProductFilters`), which makes the
 * view shareable, bookmarkable and correct under back/forward — and gives
 * React Query a natural cache key.
 *
 * Desktop shows a persistent sidebar; mobile moves the same component into a
 * sheet. Both render the identical `ProductFilters`, so the two never drift.
 */
export default function ProductListingPage() {
  const filters = useProductFilters();
  const { data, isPending, isPlaceholderData, isError, error, refetch } = useProducts(
    filters.searchParams,
  );
  const { data: categories } = useCategoryTree();
  const { ids: savedIds } = useWishlistIds();
  const toggleWishlist = useToggleWishlist();
  const addToCart = useAddToCart();

  const facets = data?.facets ?? EMPTY_FACETS;
  const meta = data?.meta;
  const products = data?.items ?? [];

  const activeCategory = useMemo(() => {
    if (!filters.query.category || !categories) return undefined;
    const walk = (nodes: typeof categories): (typeof categories)[number] | undefined => {
      for (const node of nodes) {
        if (node.slug === filters.query.category) return node;
        const found = walk(node.children);
        if (found) return found;
      }
      return undefined;
    };
    return walk(categories);
  }, [filters.query.category, categories]);

  const heading = filters.query.q
    ? `Results for “${filters.query.q}”`
    : (activeCategory?.name ?? 'All products');

  return (
    <>
      <Seo
        title={heading}
        description={
          activeCategory?.description ??
          'Browse the full Aurora catalog with filters for brand, price, rating and availability.'
        }
        // A filtered or paginated view is a near-duplicate of the base listing,
        // so it is kept out of the index rather than competing with it.
        noIndex={filters.activeFilterCount > 0 || (filters.query.page ?? 1) > 1}
      />

      <div className="mx-auto max-w-7xl px-4 py-6">
        <Breadcrumb className="mb-4">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              {activeCategory ? (
                <BreadcrumbLink asChild>
                  <Link to="/products">Products</Link>
                </BreadcrumbLink>
              ) : (
                <BreadcrumbPage>Products</BreadcrumbPage>
              )}
            </BreadcrumbItem>
            {activeCategory && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>{activeCategory.name}</BreadcrumbPage>
                </BreadcrumbItem>
              </>
            )}
          </BreadcrumbList>
        </Breadcrumb>

        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">{heading}</h1>
            <p className="text-muted-foreground mt-1 text-sm tabular" aria-live="polite">
              {isPending
                ? 'Loading products…'
                : `${meta?.total ?? 0} product${meta?.total === 1 ? '' : 's'}`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            {/* Mobile filter entry point; the same component as the sidebar. */}
            <Sheet>
              <SheetTrigger asChild>
                <Button variant="outline" className="lg:hidden">
                  <SlidersHorizontal className="size-4" aria-hidden="true" />
                  Filters
                  {filters.activeFilterCount > 0 && (
                    <Badge variant="secondary" className="ml-1 size-5 justify-center p-0 text-xs">
                      {filters.activeFilterCount}
                    </Badge>
                  )}
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-[320px] overflow-y-auto">
                <SheetHeader>
                  <SheetTitle>Filters</SheetTitle>
                </SheetHeader>
                <div className="px-4 pb-6">
                  <ProductFilters facets={facets} filters={filters} />
                </div>
              </SheetContent>
            </Sheet>

            <Select
              value={filters.query.sort}
              onValueChange={(value) => filters.setSort(value as ProductSort)}
            >
              <SelectTrigger className="w-[180px]" aria-label="Sort products">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PRODUCT_SORTS.map((sort) => (
                  <SelectItem key={sort} value={sort}>
                    {SORT_LABELS[sort]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {filters.activeFilterCount > 0 && (
          <div className="mb-5">
            <ActiveFilterChips
              chips={filters.activeChips}
              onRemove={filters.clearFilter}
              onClearAll={filters.clearAll}
            />
          </div>
        )}

        <div className="flex gap-8">
          <aside className="hidden w-60 shrink-0 lg:block" aria-label="Product filters">
            <div className="sticky top-40 max-h-[calc(100dvh-11rem)] overflow-y-auto pr-2">
              <ProductFilters facets={facets} filters={filters} />
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            {isError ? (
              <ErrorState error={error} onRetry={() => void refetch()} />
            ) : isPending ? (
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
                {Array.from({ length: 12 }, (_, index) => (
                  <ProductCardSkeleton key={index} />
                ))}
              </div>
            ) : products.length === 0 ? (
              <EmptyState
                icon={PackageSearch}
                title="No products match those filters"
                description={
                  filters.activeFilterCount > 0
                    ? 'Try removing a filter or two to widen your search.'
                    : 'Try a different search term.'
                }
                action={
                  filters.activeFilterCount > 0 ? (
                    <Button onClick={filters.clearAll}>Clear all filters</Button>
                  ) : (
                    <Button asChild>
                      <Link to="/products">Browse all products</Link>
                    </Button>
                  )
                }
              />
            ) : (
              <>
                {/* Dimmed while the next page loads, rather than unmounted —
                    keepPreviousData holds the grid in place so the page does not
                    collapse and scroll-jump between pages. */}
                <div
                  className={`grid grid-cols-2 gap-4 transition-opacity sm:grid-cols-3 xl:grid-cols-4 ${
                    isPlaceholderData ? 'opacity-60' : 'opacity-100'
                  }`}
                >
                  {products.map((product, index) => (
                    <ProductCard
                      key={product._id}
                      product={product}
                      priority={index < 4}
                      isSaved={savedIds.has(product._id)}
                      onToggleWishlist={(productId, isSaved) =>
                        toggleWishlist.mutate({ productId, isSaved })
                      }
                      onQuickAdd={(item) => addToCart.mutate({ productId: item._id, quantity: 1 })}
                    />
                  ))}
                </div>

                <Pagination
                  page={meta?.page ?? 1}
                  totalPages={meta?.totalPages ?? 1}
                  onPageChange={(page) => {
                    filters.setPage(page);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  }}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
