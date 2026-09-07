import { Link } from 'react-router';
import { AlertTriangle, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Price } from '@/components/common/Price';
import { Seo } from '@/components/common/Seo';
import { useCart, useRemoveCartItem, useUpdateCartItem } from './api/queries';
import { CouponInput } from '@/features/checkout/components/CouponInput';
import { formatCurrency } from '@/lib/format';

/**
 * The full bag page.
 *
 * The summary shows the subtotal and, once a coupon is applied, the discount the
 * server calculated. Shipping and tax are deliberately left to checkout: they
 * depend on the delivery address and speed, and estimating them here would risk
 * showing a total that does not match what is charged.
 */
export default function CartPage() {
  const { data: cart, isPending, isError, error, refetch } = useCart();
  const updateItem = useUpdateCartItem();
  const removeItem = useRemoveCartItem();

  if (isError) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-10">
        <ErrorState error={error} onRetry={() => void refetch()} />
      </div>
    );
  }

  return (
    <>
      <Seo title="Your bag" noIndex />

      <div className="mx-auto max-w-7xl px-4 py-8">
        <h1 className="text-2xl font-semibold tracking-tight">Your bag</h1>

        {isPending ? (
          <div className="mt-6 grid gap-8 lg:grid-cols-[1fr_320px]">
            <div className="space-y-4">
              {Array.from({ length: 3 }, (_, index) => (
                <Skeleton key={index} className="h-32 rounded-xl" />
              ))}
            </div>
            <Skeleton className="h-64 rounded-xl" />
          </div>
        ) : !cart || cart.items.length === 0 ? (
          <EmptyState
            icon={ShoppingBag}
            title="Your bag is empty"
            description="Browse the catalog and add something you like."
            action={
              <Button asChild>
                <Link to="/products">Start shopping</Link>
              </Button>
            }
          />
        ) : (
          <div className="mt-6 grid items-start gap-8 lg:grid-cols-[1fr_320px]">
            <div>
              {cart.hasIssues && (
                <div className="border-warning/30 bg-warning/10 mb-4 flex items-start gap-2.5 rounded-lg border p-3 text-sm">
                  <AlertTriangle
                    className="text-warning-foreground mt-0.5 size-4 shrink-0"
                    aria-hidden="true"
                  />
                  <p>
                    Some items are unavailable or have less stock than you asked for. Adjust them to
                    continue.
                  </p>
                </div>
              )}

              <ul className="divide-y rounded-xl border">
                {cart.items.map((line) => (
                  <li key={line.itemId} className="flex gap-4 p-4">
                    <Link to={`/products/${line.product.slug}`} className="shrink-0">
                      <img
                        src={line.product.thumbnail}
                        alt=""
                        className="bg-muted size-24 rounded-lg object-cover sm:size-28"
                        loading="lazy"
                      />
                    </Link>

                    <div className="flex min-w-0 flex-1 flex-col">
                      {line.product.brandName && (
                        <span className="text-muted-foreground text-xs tracking-wide uppercase">
                          {line.product.brandName}
                        </span>
                      )}
                      <Link
                        to={`/products/${line.product.slug}`}
                        className="text-sm font-medium hover:underline"
                      >
                        {line.product.name}
                      </Link>

                      {line.variant && (
                        <p className="text-muted-foreground mt-0.5 text-xs">
                          {line.variant.optionValues
                            .map((option) => `${option.name}: ${option.value}`)
                            .join(' · ')}
                        </p>
                      )}

                      {line.issue && (
                        <p className="text-destructive mt-1 text-xs font-medium">
                          {line.issue === 'out_of_stock' && 'Out of stock'}
                          {line.issue === 'unavailable' && 'No longer available'}
                          {line.issue === 'insufficient_stock' &&
                            `Only ${line.availableStock} available`}
                        </p>
                      )}

                      {line.priceChanged && (
                        <p className="text-warning-foreground mt-1 text-xs">
                          Price changed from {formatCurrency(line.priceChanged.from)} to{' '}
                          {formatCurrency(line.priceChanged.to)}
                        </p>
                      )}

                      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 pt-3">
                        <div className="flex items-center rounded-md border">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 rounded-r-none"
                            disabled={updateItem.isPending}
                            onClick={() =>
                              updateItem.mutate({
                                itemId: line.itemId,
                                quantity: line.quantity - 1,
                              })
                            }
                            aria-label={`Decrease quantity of ${line.product.name}`}
                          >
                            <Minus className="size-3.5" />
                          </Button>
                          <span className="w-10 text-center text-sm tabular">{line.quantity}</span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="size-8 rounded-l-none"
                            disabled={updateItem.isPending || line.quantity >= line.availableStock}
                            onClick={() =>
                              updateItem.mutate({
                                itemId: line.itemId,
                                quantity: line.quantity + 1,
                              })
                            }
                            aria-label={`Increase quantity of ${line.product.name}`}
                          >
                            <Plus className="size-3.5" />
                          </Button>
                        </div>

                        <div className="flex items-center gap-3">
                          <Price
                            amount={line.lineTotal}
                            compareAt={
                              line.compareAtPrice ? line.compareAtPrice * line.quantity : undefined
                            }
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-muted-foreground hover:text-destructive size-8"
                            disabled={removeItem.isPending}
                            onClick={() => removeItem.mutate(line.itemId)}
                            aria-label={`Remove ${line.product.name}`}
                          >
                            <Trash2 className="size-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <Card className="lg:sticky lg:top-40">
              <CardContent className="pt-6">
                <h2 className="text-base font-semibold">Order summary</h2>

                <div className="mt-4">
                  <CouponInput coupon={cart.coupon} />
                </div>

                <dl className="mt-4 space-y-2.5 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">
                      Subtotal ({cart.itemCount} item{cart.itemCount === 1 ? '' : 's'})
                    </dt>
                    <dd className="tabular">{formatCurrency(cart.subtotal, cart.currency)}</dd>
                  </div>

                  {cart.coupon?.valid && cart.coupon.discount > 0 && (
                    <div className="text-success flex justify-between">
                      <dt>Discount ({cart.coupon.code})</dt>
                      <dd className="tabular">
                        −{formatCurrency(cart.coupon.discount, cart.currency)}
                      </dd>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Delivery</dt>
                    <dd className="text-muted-foreground text-xs">Calculated at checkout</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground">Taxes</dt>
                    <dd className="text-muted-foreground text-xs">Calculated at checkout</dd>
                  </div>
                </dl>

                <Separator className="my-4" />

                <div className="flex items-baseline justify-between">
                  <span className="font-medium">
                    {cart.coupon?.valid ? 'Estimated total' : 'Subtotal'}
                  </span>
                  <span className="text-xl font-semibold tabular">
                    {formatCurrency(
                      Math.max(0, cart.subtotal - (cart.coupon?.valid ? cart.coupon.discount : 0)),
                      cart.currency,
                    )}
                  </span>
                </div>

                <Button asChild size="lg" className="mt-5 w-full" disabled={cart.hasIssues}>
                  <Link to="/checkout">Proceed to checkout</Link>
                </Button>

                <Button asChild variant="ghost" className="mt-2 w-full">
                  <Link to="/products">Continue shopping</Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </>
  );
}
