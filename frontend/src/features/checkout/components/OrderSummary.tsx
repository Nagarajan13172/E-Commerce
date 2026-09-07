import { Loader2, Truck } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/format';
import type { PriceBreakdown } from '../api/checkout.api';

interface OrderSummaryProps {
  pricing?: PriceBreakdown;
  itemCount?: number;
  isLoading?: boolean;
  /** Dimmed while a newer quote is being fetched. */
  isRefreshing?: boolean;
}

/**
 * The money panel.
 *
 * Every figure comes from the server's quote — none is computed here. Doing the
 * arithmetic in the browser would create a second implementation of pricing that
 * could disagree with the one that actually charges the card.
 */
export function OrderSummary({ pricing, itemCount, isLoading, isRefreshing }: OrderSummaryProps) {
  if (isLoading || !pricing) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <Separator />
        <Skeleton className="h-6 w-1/2" />
      </div>
    );
  }

  const currency = pricing.currency;

  return (
    <div className={isRefreshing ? 'opacity-60 transition-opacity' : 'transition-opacity'}>
      <dl className="space-y-2.5 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">
            Subtotal{itemCount !== undefined && ` (${itemCount} item${itemCount === 1 ? '' : 's'})`}
          </dt>
          <dd className="tabular">{formatCurrency(pricing.subtotal, currency)}</dd>
        </div>

        {pricing.discountTotal > 0 && (
          <div className="text-success flex justify-between">
            <dt>Discount{pricing.coupon ? ` (${pricing.coupon.code})` : ''}</dt>
            <dd className="tabular">−{formatCurrency(pricing.discountTotal, currency)}</dd>
          </div>
        )}

        <div className="flex justify-between">
          <dt className="text-muted-foreground">Delivery</dt>
          <dd className="tabular">
            {pricing.shippingTotal === 0 ? (
              <span className="text-success font-medium">Free</span>
            ) : (
              formatCurrency(pricing.shippingTotal, currency)
            )}
          </dd>
        </div>

        {/* Inclusive tax is shown as a component of the total, not added to it —
            saying "+ ₹180 tax" under an inclusive price would imply the customer
            pays it twice. */}
        {pricing.taxTotal > 0 && (
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Includes GST</dt>
            <dd className="text-muted-foreground tabular">
              {formatCurrency(pricing.taxTotal, currency)}
            </dd>
          </div>
        )}
      </dl>

      {pricing.amountToFreeShipping > 0 && (
        <p className="text-muted-foreground mt-3 flex items-start gap-2 text-xs">
          <Truck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Spend {formatCurrency(pricing.amountToFreeShipping, currency)} more for free delivery
        </p>
      )}

      <Separator className="my-4" />

      <div className="flex items-baseline justify-between">
        <span className="font-medium">Total</span>
        <span className="flex items-center gap-2 text-xl font-semibold tabular">
          {isRefreshing && (
            <Loader2 className="text-muted-foreground size-4 animate-spin" aria-hidden="true" />
          )}
          {formatCurrency(pricing.grandTotal, currency)}
        </span>
      </div>
    </div>
  );
}
