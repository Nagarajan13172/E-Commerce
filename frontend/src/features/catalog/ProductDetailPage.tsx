import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import {
  Check,
  Heart,
  Loader2,
  Minus,
  PackageX,
  Plus,
  RotateCcw,
  ShieldCheck,
  ShoppingBag,
  Truck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { Seo } from '@/components/common/Seo';
import { Price } from '@/components/common/Price';
import { Rating } from '@/components/common/Rating';
import { ErrorState } from '@/components/common/ErrorState';
import { EmptyState } from '@/components/common/EmptyState';
import { ProductCard } from '@/components/common/ProductCard';
import { ProductGallery } from './components/ProductGallery';
import { VariantPicker } from './components/VariantPicker';
import { useProduct, useRelatedProducts } from './api/queries';
import { useVariantSelection } from './hooks/useVariantSelection';
import { useAddToCart } from '@/features/cart/api/queries';
import { useToggleWishlist, useWishlistIds } from '@/features/wishlist/api/queries';
import { useRecentlyViewed } from '@/hooks/useRecentlyViewed';
import { useAppDispatch } from '@/store/hooks';
import { setCartDrawerOpen } from '@/store/slices/uiSlice';
import { cn } from '@/lib/utils';

const DELIVERY_POINTS = [
  { icon: Truck, title: 'Free delivery over ₹999', body: 'Dispatched within 24 hours' },
  { icon: RotateCcw, title: '7-day returns', body: 'Free returns on unused items' },
  { icon: ShieldCheck, title: 'Genuine product', body: 'Sourced directly from the brand' },
];

export default function ProductDetailPage() {
  const { slug = '' } = useParams();
  const dispatch = useAppDispatch();

  const { data: product, isPending, isError, error, refetch } = useProduct(slug);
  const { data: related } = useRelatedProducts(slug);
  const { ids: savedIds } = useWishlistIds();
  const toggleWishlist = useToggleWishlist();
  const addToCart = useAddToCart();
  const { items: recentlyViewed, record } = useRecentlyViewed();

  const selection = useVariantSelection(product);
  const [quantity, setQuantity] = useState(1);

  // Record the view once the product resolves, for the recently-viewed rail.
  useEffect(() => {
    if (!product) return;
    record({
      slug: product.slug,
      name: product.name,
      thumbnail: product.thumbnail ?? product.images?.[0]?.url,
      price: product.priceRange.min,
    });
  }, [product, record]);

  // Clamp the quantity when a variant change reduces what is available, so the
  // stepper cannot be left showing more than can be bought.
  useEffect(() => {
    setQuantity((current) => Math.min(current, Math.max(1, selection.availableStock)));
  }, [selection.availableStock]);

  if (isPending) return <ProductDetailSkeleton />;

  if (isError) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <ErrorState error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  if (!product) return null;

  const isSaved = savedIds.has(product._id);
  const isOutOfStock = selection.availableStock === 0;
  const isLowStock = selection.availableStock > 0 && selection.availableStock <= 5;
  const canBuy = selection.isComplete && !isOutOfStock;

  const handleAddToCart = () => {
    addToCart.mutate(
      {
        productId: product._id,
        variantId: selection.variant?._id,
        quantity,
      },
      { onSuccess: () => dispatch(setCartDrawerOpen(true)) },
    );
  };

  const primaryCategory = product.categories?.[0];

  return (
    <>
      <Seo
        title={product.seo?.title ?? product.name}
        description={
          product.seo?.description ?? product.shortDescription ?? product.description.slice(0, 160)
        }
        type="product"
        image={product.thumbnail ?? product.images?.[0]?.url}
        jsonLd={[
          {
            '@context': 'https://schema.org',
            '@type': 'Product',
            name: product.name,
            sku: selection.sku,
            description: product.shortDescription ?? product.description.slice(0, 300),
            image: product.images?.map((image) => image.url),
            brand: product.brand ? { '@type': 'Brand', name: product.brand.name } : undefined,
            aggregateRating:
              product.rating.count > 0
                ? {
                    '@type': 'AggregateRating',
                    ratingValue: product.rating.average,
                    reviewCount: product.rating.count,
                  }
                : undefined,
            offers: {
              '@type': 'Offer',
              price: selection.price,
              priceCurrency: product.currency ?? 'INR',
              availability: isOutOfStock
                ? 'https://schema.org/OutOfStock'
                : 'https://schema.org/InStock',
            },
          },
          {
            '@context': 'https://schema.org',
            '@type': 'BreadcrumbList',
            itemListElement: [
              { '@type': 'ListItem', position: 1, name: 'Home', item: '/' },
              { '@type': 'ListItem', position: 2, name: 'Products', item: '/products' },
              { '@type': 'ListItem', position: 3, name: product.name },
            ],
          },
        ]}
      />

      <div className="mx-auto max-w-7xl px-4 py-6">
        <Breadcrumb className="mb-5">
          <BreadcrumbList>
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/">Home</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbLink asChild>
                <Link to="/products">Products</Link>
              </BreadcrumbLink>
            </BreadcrumbItem>
            {primaryCategory && (
              <>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink asChild>
                    <Link to={`/products?category=${primaryCategory.slug}`}>
                      {primaryCategory.name}
                    </Link>
                  </BreadcrumbLink>
                </BreadcrumbItem>
              </>
            )}
            <BreadcrumbSeparator />
            <BreadcrumbItem>
              <BreadcrumbPage className="max-w-48 truncate">{product.name}</BreadcrumbPage>
            </BreadcrumbItem>
          </BreadcrumbList>
        </Breadcrumb>

        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <ProductGallery images={product.images ?? []} productName={product.name} />

          <div>
            {product.brand && (
              <Link
                to={`/products?brand=${product.brand.slug}`}
                className="text-primary text-sm font-medium tracking-wide uppercase hover:underline"
              >
                {product.brand.name}
              </Link>
            )}

            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
              {product.name}
            </h1>

            {product.rating.count > 0 && (
              <a href="#reviews" className="mt-2.5 inline-flex hover:underline">
                <Rating value={product.rating.average} count={product.rating.count} size="md" />
              </a>
            )}

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <Price
                amount={selection.price}
                compareAt={selection.compareAtPrice}
                size="lg"
                currency={product.currency}
              />
              {selection.compareAtPrice && selection.compareAtPrice > selection.price && (
                <Badge className="bg-price-sale-solid hover:bg-price-sale-solid text-white">
                  {Math.round(
                    ((selection.compareAtPrice - selection.price) / selection.compareAtPrice) * 100,
                  )}
                  % off
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground mt-1 text-xs">
              {product.taxInclusive ? 'Inclusive of all taxes' : 'Taxes calculated at checkout'}
            </p>

            {product.shortDescription && (
              <p className="mt-5 text-sm leading-relaxed">{product.shortDescription}</p>
            )}

            <div className="mt-6">
              <VariantPicker options={product.options} selection={selection} />
            </div>

            {/* Stock messaging is explicit and specific — "Only 3 left" converts
                far better than a generic badge, and "Out of stock" must never be
                discovered only at checkout. */}
            <div className="mt-5" aria-live="polite">
              {isOutOfStock ? (
                <p className="text-destructive flex items-center gap-1.5 text-sm font-medium">
                  <PackageX className="size-4" aria-hidden="true" />
                  Out of stock
                </p>
              ) : isLowStock ? (
                <p className="text-warning-tint-foreground text-sm font-medium">
                  Only {selection.availableStock} left in stock
                </p>
              ) : (
                <p className="text-success flex items-center gap-1.5 text-sm font-medium">
                  <Check className="size-4" aria-hidden="true" />
                  In stock
                </p>
              )}
              <p className="text-muted-foreground mt-1 font-mono text-xs">SKU {selection.sku}</p>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <div className="flex items-center rounded-md border">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-10 rounded-r-none"
                  disabled={quantity <= 1 || isOutOfStock}
                  onClick={() => setQuantity((value) => Math.max(1, value - 1))}
                  aria-label="Decrease quantity"
                >
                  <Minus className="size-4" />
                </Button>
                <span className="w-12 text-center text-sm font-medium tabular" aria-live="polite">
                  {quantity}
                </span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-10 rounded-l-none"
                  disabled={isOutOfStock || quantity >= Math.min(selection.availableStock, 10)}
                  onClick={() => setQuantity((value) => value + 1)}
                  aria-label="Increase quantity"
                >
                  <Plus className="size-4" />
                </Button>
              </div>

              <Button
                type="button"
                size="lg"
                className="min-w-44 flex-1 sm:flex-none"
                disabled={!canBuy || addToCart.isPending}
                onClick={handleAddToCart}
              >
                {addToCart.isPending ? (
                  <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ShoppingBag className="size-4" aria-hidden="true" />
                )}
                {isOutOfStock
                  ? 'Out of stock'
                  : !selection.isComplete
                    ? 'Select options'
                    : 'Add to bag'}
              </Button>

              <Button
                type="button"
                size="lg"
                variant="outline"
                onClick={() => toggleWishlist.mutate({ productId: product._id, isSaved })}
                aria-pressed={isSaved}
                aria-label={isSaved ? 'Remove from wishlist' : 'Save to wishlist'}
              >
                <Heart className={cn('size-4', isSaved && 'fill-price-sale text-price-sale')} />
                <span className="sr-only sm:not-sr-only">{isSaved ? 'Saved' : 'Save'}</span>
              </Button>
            </div>

            <ul className="mt-7 grid gap-3 border-t pt-6">
              {DELIVERY_POINTS.map(({ icon: Icon, title, body }) => (
                <li key={title} className="flex items-start gap-3">
                  <Icon
                    className="text-muted-foreground mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="text-sm font-medium">{title}</p>
                    <p className="text-muted-foreground text-xs">{body}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* Details */}
        <div className="mt-12">
          <Tabs defaultValue="description">
            <TabsList>
              <TabsTrigger value="description">Description</TabsTrigger>
              {product.specifications.length > 0 && (
                <TabsTrigger value="specifications">Specifications</TabsTrigger>
              )}
              <TabsTrigger value="reviews">Reviews ({product.rating.count})</TabsTrigger>
            </TabsList>

            <TabsContent value="description" className="max-w-3xl pt-6">
              <p className="text-sm leading-relaxed whitespace-pre-line">{product.description}</p>
            </TabsContent>

            {product.specifications.length > 0 && (
              <TabsContent value="specifications" className="max-w-3xl pt-6">
                <dl className="divide-y">
                  {product.specifications.map((spec) => (
                    <div
                      key={`${spec.group}-${spec.name}`}
                      className="grid grid-cols-3 gap-4 py-2.5"
                    >
                      <dt className="text-muted-foreground text-sm">
                        {spec.group ? `${spec.group} · ` : ''}
                        {spec.name}
                      </dt>
                      <dd className="col-span-2 text-sm">{spec.value}</dd>
                    </div>
                  ))}
                </dl>
              </TabsContent>
            )}

            <TabsContent value="reviews" id="reviews" className="max-w-3xl pt-6">
              {product.rating.count === 0 ? (
                <EmptyState
                  icon={Heart}
                  title="No reviews yet"
                  description="Only customers who have bought this product can review it."
                />
              ) : (
                <div className="flex items-center gap-6">
                  <div className="text-center">
                    <p className="text-4xl font-semibold tabular">
                      {product.rating.average.toFixed(1)}
                    </p>
                    <Rating value={product.rating.average} showCount={false} size="md" />
                    <p className="text-muted-foreground mt-1 text-xs">
                      {product.rating.count} review{product.rating.count === 1 ? '' : 's'}
                    </p>
                  </div>
                  <Separator orientation="vertical" className="h-16" />
                  <p className="text-muted-foreground text-sm">
                    Individual reviews are shown once the order system is live.
                  </p>
                </div>
              )}
            </TabsContent>
          </Tabs>
        </div>

        {related && related.length > 0 && (
          <section className="mt-14" aria-labelledby="related-heading">
            <h2 id="related-heading" className="text-xl font-semibold tracking-tight">
              You might also like
            </h2>
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {related.slice(0, 4).map((item) => (
                <ProductCard key={item._id} product={item} isSaved={savedIds.has(item._id)} />
              ))}
            </div>
          </section>
        )}

        {recentlyViewed.length > 1 && (
          <section className="mt-14" aria-labelledby="recently-viewed-heading">
            <h2 id="recently-viewed-heading" className="text-xl font-semibold tracking-tight">
              Recently viewed
            </h2>
            <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6">
              {recentlyViewed
                .filter((entry) => entry.slug !== product.slug)
                .slice(0, 6)
                .map((entry) => (
                  <Link
                    key={entry.slug}
                    to={`/products/${entry.slug}`}
                    className="group bg-card overflow-hidden rounded-lg border"
                  >
                    <img
                      src={entry.thumbnail}
                      alt=""
                      className="bg-muted aspect-square w-full object-cover"
                      loading="lazy"
                    />
                    <p className="line-clamp-2 p-2 text-xs group-hover:underline">{entry.name}</p>
                  </Link>
                ))}
            </div>
          </section>
        )}
      </div>
    </>
  );
}

function ProductDetailSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <Skeleton className="mb-5 h-4 w-64" />
      <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
        <Skeleton className="aspect-square rounded-xl" />
        <div className="space-y-4">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-9 w-3/4" />
          <Skeleton className="h-4 w-40" />
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-11 w-full" />
        </div>
      </div>
    </div>
  );
}
