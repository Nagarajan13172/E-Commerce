import { Link } from 'react-router';
import { ArrowRight, PackageCheck, RefreshCw, ShieldCheck, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Seo } from '@/components/common/Seo';
import { ErrorState } from '@/components/common/ErrorState';
import { ProductRail } from './components/ProductRail';
import { useHomepage } from '@/features/catalog/api/queries';
import { useToggleWishlist, useWishlistIds } from '@/features/wishlist/api/queries';
import { ProductImage } from '@/components/common/ProductImage';

const TRUST_SIGNALS = [
  { icon: Truck, title: 'Free delivery over ₹999', body: 'Dispatched within 24 hours' },
  { icon: RefreshCw, title: '7-day returns', body: 'No questions asked' },
  { icon: ShieldCheck, title: 'Secure checkout', body: 'Verified server-side' },
  { icon: PackageCheck, title: 'Genuine products', body: 'Sourced from brands directly' },
];

/**
 * The homepage.
 *
 * Every section is data-driven from `/home`, which returns all five rails in one
 * response. Five separate requests would mean five sequential round trips before
 * the page could settle, and five chances for a partially-rendered page.
 */
export default function HomePage() {
  const { data, isPending, isError, error, refetch } = useHomepage();
  const { ids: savedIds } = useWishlistIds();
  const toggleWishlist = useToggleWishlist();

  const handleToggleWishlist = (productId: string, isSaved: boolean) =>
    toggleWishlist.mutate({ productId, isSaved });

  if (isError) {
    return (
      <div className="mx-auto max-w-7xl px-4">
        <ErrorState error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <>
      <Seo
        title="Aurora — Electronics, fashion, home and beauty"
        description="Shop electronics, fashion, home and beauty essentials at Aurora. Free delivery over ₹999 and easy 7-day returns."
        jsonLd={{
          '@context': 'https://schema.org',
          '@type': 'Organization',
          name: 'Aurora',
          url: typeof window !== 'undefined' ? window.location.origin : undefined,
        }}
      />

      {/* Hero */}
      <section className="from-primary/10 via-accent/40 bg-gradient-to-br to-transparent">
        <div className="mx-auto grid max-w-7xl items-center gap-8 px-4 py-12 lg:grid-cols-2 lg:py-20">
          <div>
            <p className="text-primary text-sm font-semibold tracking-wide uppercase">
              New season, new essentials
            </p>
            <h1 className="mt-3 text-4xl font-semibold tracking-tight text-balance sm:text-5xl">
              Everything you need, chosen carefully
            </h1>
            <p className="text-muted-foreground mt-4 max-w-md text-base leading-relaxed">
              Electronics, fashion, home and beauty from brands worth buying — with honest
              descriptions and delivery that turns up when it says it will.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Button asChild size="lg">
                <Link to="/products">
                  Shop all products
                  <ArrowRight className="size-4" aria-hidden="true" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link to="/products?sort=discount">View deals</Link>
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            {isPending
              ? Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="aspect-square rounded-xl" />
                ))
              : data?.featured.slice(0, 4).map((product, index) => (
                  <Link
                    key={product._id}
                    to={`/products/${product.slug}`}
                    className="focus-visible:ring-ring overflow-hidden rounded-xl border bg-white transition-transform hover:scale-[1.02] focus-visible:ring-2"
                  >
                    <ProductImage
                      src={product.thumbnail ?? product.images?.[0]?.url}
                      alt={product.name}
                      priority={index < 2}
                      sizes="(max-width: 1024px) 45vw, 22vw"
                    />
                  </Link>
                ))}
          </div>
        </div>
      </section>

      {/* Trust signals */}
      <section aria-label="Why shop with us" className="border-y">
        <ul className="mx-auto grid max-w-7xl grid-cols-2 gap-px px-4 py-6 sm:gap-6 lg:grid-cols-4">
          {TRUST_SIGNALS.map(({ icon: Icon, title, body }) => (
            <li key={title} className="flex items-center gap-3">
              <Icon className="text-primary size-5 shrink-0" aria-hidden="true" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{title}</p>
                <p className="text-muted-foreground truncate text-xs">{body}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      <div className="mx-auto max-w-7xl px-4">
        {/* Featured categories */}
        <section className="py-10" aria-labelledby="shop-by-category">
          <h2 id="shop-by-category" className="text-xl font-semibold tracking-tight sm:text-2xl">
            Shop by category
          </h2>
          <div className="mt-5 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {isPending
              ? Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="h-32 rounded-xl" />
                ))
              : data?.featuredCategories.map((category) => (
                  <Link
                    key={category._id}
                    to={`/products?category=${category.slug}`}
                    className="group bg-card focus-visible:ring-ring relative flex h-32 flex-col justify-end overflow-hidden rounded-xl border p-4 transition-shadow hover:shadow-md focus-visible:ring-2"
                  >
                    <span className="text-base font-medium">{category.name}</span>
                    <span className="text-muted-foreground text-xs tabular">
                      {category.productCount} product{category.productCount === 1 ? '' : 's'}
                    </span>
                    <ArrowRight
                      className="text-muted-foreground group-hover:text-primary absolute top-4 right-4 size-4 transition-colors"
                      aria-hidden="true"
                    />
                  </Link>
                ))}
          </div>
        </section>

        <ProductRail
          title="Trending now"
          description="What people are buying this week"
          products={data?.bestsellers ?? []}
          viewAllHref="/products?sort=best_selling"
          isLoading={isPending}
          savedIds={savedIds}
          onToggleWishlist={handleToggleWishlist}
          priority
        />

        <ProductRail
          title="New arrivals"
          description="Just landed"
          products={data?.newArrivals ?? []}
          viewAllHref="/products?sort=newest"
          isLoading={isPending}
          savedIds={savedIds}
          onToggleWishlist={handleToggleWishlist}
        />

        <ProductRail
          title="Deals worth a look"
          description="20% off or more"
          products={data?.deals ?? []}
          viewAllHref="/products?sort=discount"
          isLoading={isPending}
          savedIds={savedIds}
          onToggleWishlist={handleToggleWishlist}
        />
      </div>
    </>
  );
}
