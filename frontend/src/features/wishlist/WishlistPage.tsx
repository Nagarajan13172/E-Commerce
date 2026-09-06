import { Link } from 'react-router';
import { Heart } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProductCard, ProductCardSkeleton } from '@/components/common/ProductCard';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Seo } from '@/components/common/Seo';
import { useToggleWishlist, useWishlist } from './api/queries';
import { useAddToCart } from '@/features/cart/api/queries';

export default function WishlistPage() {
  const { data: items, isPending, isError, error, refetch } = useWishlist();
  const toggleWishlist = useToggleWishlist();
  const addToCart = useAddToCart();

  return (
    <>
      <Seo title="Wishlist" noIndex />

      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight">Wishlist</h2>
        <p className="text-muted-foreground mt-1 text-sm">
          {isPending
            ? 'Loading your saved items…'
            : `${items?.length ?? 0} item${items?.length === 1 ? '' : 's'} saved`}
        </p>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {Array.from({ length: 6 }, (_, index) => (
            <ProductCardSkeleton key={index} />
          ))}
        </div>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Heart}
          title="Your wishlist is empty"
          description="Tap the heart on any product to save it for later."
          action={
            <Button asChild>
              <Link to="/products">Browse products</Link>
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
          {items.map((item) => (
            <ProductCard
              key={item._id}
              product={item}
              isSaved
              onToggleWishlist={(productId, isSaved) =>
                toggleWishlist.mutate({ productId, isSaved })
              }
              onQuickAdd={(product) => addToCart.mutate({ productId: product._id, quantity: 1 })}
            />
          ))}
        </div>
      )}
    </>
  );
}
