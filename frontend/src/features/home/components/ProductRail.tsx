import { Link } from 'react-router';
import { ArrowRight } from 'lucide-react';
import { ProductCard, ProductCardSkeleton } from '@/components/common/ProductCard';
import { Button } from '@/components/ui/button';
import type { ProductSummary } from '@/types/catalog';

interface ProductRailProps {
  title: string;
  description?: string;
  products: ProductSummary[];
  viewAllHref?: string;
  isLoading?: boolean;
  savedIds?: Set<string>;
  onToggleWishlist?: (productId: string, isSaved: boolean) => void;
  priority?: boolean;
}

/**
 * A horizontal product rail.
 *
 * Scrolls on small screens and becomes a grid from `md` up, rather than
 * scrolling at every size. A horizontal scroller on a wide desktop hides
 * products behind an interaction nobody performs with a mouse.
 */
export function ProductRail({
  title,
  description,
  products,
  viewAllHref,
  isLoading,
  savedIds,
  onToggleWishlist,
  priority = false,
}: ProductRailProps) {
  // Render nothing rather than an empty section — a heading with no products
  // under it reads as a broken page.
  if (!isLoading && products.length === 0) return null;

  return (
    <section className="py-8" aria-labelledby={`rail-${title.replace(/\s+/g, '-').toLowerCase()}`}>
      <div className="mb-5 flex items-end justify-between gap-4">
        <div>
          <h2
            id={`rail-${title.replace(/\s+/g, '-').toLowerCase()}`}
            className="text-xl font-semibold tracking-tight sm:text-2xl"
          >
            {title}
          </h2>
          {description && <p className="text-muted-foreground mt-1 text-sm">{description}</p>}
        </div>

        {viewAllHref && (
          <Button asChild variant="ghost" size="sm" className="shrink-0">
            <Link to={viewAllHref}>
              View all
              <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          </Button>
        )}
      </div>

      <div className="scrollbar-none -mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 md:mx-0 md:grid md:grid-cols-3 md:overflow-visible md:px-0 lg:grid-cols-4">
        {isLoading
          ? Array.from({ length: 4 }, (_, index) => (
              <div key={index} className="w-[70vw] shrink-0 snap-start sm:w-[45vw] md:w-auto">
                <ProductCardSkeleton />
              </div>
            ))
          : products.slice(0, 8).map((product, index) => (
              <div key={product._id} className="w-[70vw] shrink-0 snap-start sm:w-[45vw] md:w-auto">
                <ProductCard
                  product={product}
                  isSaved={savedIds?.has(product._id)}
                  onToggleWishlist={onToggleWishlist}
                  priority={priority && index < 4}
                />
              </div>
            ))}
      </div>
    </section>
  );
}
