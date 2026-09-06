import { Link } from 'react-router';
import { Heart, ShoppingBag } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Price } from './Price';
import { Rating } from './Rating';
import { ProductImage } from './ProductImage';
import { Skeleton } from '@/components/ui/skeleton';
import type { ProductSummary } from '@/types/catalog';
import { catalogKeys } from '@/features/catalog/api/queries';
import { fetchProduct } from '@/features/catalog/api/catalog.api';

interface ProductCardProps {
  product: ProductSummary;
  isSaved?: boolean;
  onToggleWishlist?: (productId: string, isSaved: boolean) => void;
  onQuickAdd?: (product: ProductSummary) => void;
  priority?: boolean;
  className?: string;
}

export function ProductCard({
  product,
  isSaved = false,
  onToggleWishlist,
  onQuickAdd,
  priority = false,
  className,
}: ProductCardProps) {
  const queryClient = useQueryClient();

  /**
   * Warm the detail query on hover.
   *
   * By the time the click lands the product is usually already cached, so the
   * page renders immediately instead of showing a spinner. Cheap, because it
   * only runs on genuine pointer intent and React Query dedupes.
   */
  const prefetch = () => {
    void queryClient.prefetchQuery({
      queryKey: catalogKeys.productDetail(product.slug),
      queryFn: () => fetchProduct(product.slug),
      staleTime: 5 * 60 * 1000,
    });
  };

  const hasVariants = product.variantCount > 1;
  const priceVaries = product.priceRange.min !== product.priceRange.max;

  return (
    <article
      className={cn(
        'group bg-card relative flex flex-col overflow-hidden rounded-xl border transition-shadow hover:shadow-md',
        className,
      )}
    >
      <div className="relative">
        {/* The whole image is the link target, but the accessible name comes
            from the title link below so screen readers hear one link per card,
            not two pointing at the same place. */}
        <Link
          to={`/products/${product.slug}`}
          onMouseEnter={prefetch}
          onFocus={prefetch}
          tabIndex={-1}
          aria-hidden="true"
          className="block"
        >
          <ProductImage
            src={product.thumbnail ?? product.images?.[0]?.url}
            alt={product.name}
            priority={priority}
            className="transition-transform duration-300 group-hover:scale-[1.02]"
          />
        </Link>

        <div className="absolute top-2 left-2 flex flex-col gap-1.5">
          {product.discountPercent > 0 && (
            <Badge className="bg-price-sale text-white hover:bg-price-sale">
              {product.discountPercent}% off
            </Badge>
          )}
          {product.isNewArrival && !product.discountPercent && (
            <Badge variant="secondary">New</Badge>
          )}
        </div>

        {!product.inStock && (
          <div className="bg-background/80 absolute inset-0 flex items-center justify-center backdrop-blur-[1px]">
            <Badge variant="secondary" className="text-sm">
              Out of stock
            </Badge>
          </div>
        )}

        {onToggleWishlist && (
          <Button
            type="button"
            variant="secondary"
            size="icon"
            onClick={() => onToggleWishlist(product._id, isSaved)}
            aria-pressed={isSaved}
            aria-label={
              isSaved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`
            }
            // z-10 lifts it above the title link's stretched ::after overlay, which
            // otherwise covers the whole card and swallows this click.
            className="absolute top-2 right-2 z-10 size-8 rounded-full opacity-0 shadow-sm transition-opacity group-hover:opacity-100 focus-visible:opacity-100 max-sm:opacity-100"
          >
            <Heart className={cn('size-4', isSaved && 'fill-price-sale text-price-sale')} />
          </Button>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        {product.brand && (
          <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
            {product.brand.name}
          </span>
        )}

        <h3 className="text-sm leading-snug font-medium">
          <Link
            to={`/products/${product.slug}`}
            onMouseEnter={prefetch}
            onFocus={prefetch}
            // Stretches the link's hit area over the whole card, so the entire
            // card is clickable while remaining a single link in the a11y tree.
            className="after:absolute after:inset-0 hover:underline"
          >
            {product.name}
          </Link>
        </h3>

        {product.rating.count > 0 && (
          <Rating value={product.rating.average} count={product.rating.count} />
        )}

        <div className="mt-auto flex items-end justify-between gap-2 pt-1.5">
          <Price
            amount={product.price}
            compareAt={product.compareAtPrice}
            range={priceVaries ? product.priceRange : undefined}
          />

          {onQuickAdd && product.inStock && !hasVariants && (
            <Button
              type="button"
              size="icon"
              variant="secondary"
              // Above the stretched link so the click reaches this button
              // rather than navigating to the product.
              className="relative z-10 size-8 shrink-0"
              onClick={() => onQuickAdd(product)}
              aria-label={`Add ${product.name} to bag`}
            >
              <ShoppingBag className="size-4" />
            </Button>
          )}
        </div>
      </div>
    </article>
  );
}

/** Matches ProductCard's dimensions so the grid does not shift when data lands. */
export function ProductCardSkeleton() {
  return (
    <div className="bg-card flex flex-col overflow-hidden rounded-xl border">
      <Skeleton className="aspect-square rounded-none" />
      <div className="flex flex-col gap-2 p-3">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Skeleton className="mt-1 h-5 w-20" />
      </div>
    </div>
  );
}
