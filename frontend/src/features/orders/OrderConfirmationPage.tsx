import { useEffect } from 'react';
import { Link, useParams } from 'react-router';
import { CheckCircle2, Mail, Package, Truck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Seo } from '@/components/common/Seo';
import { ErrorState } from '@/components/common/ErrorState';
import { PageLoader } from '@/components/common/PageLoader';
import { useAppDispatch } from '@/store/hooks';
import { resetCheckout } from '@/store/slices/checkoutSlice';
import { formatCurrency, formatDate } from '@/lib/format';
import { useOrder } from './api/queries';

/**
 * Confirmation.
 *
 * Answers the three questions a customer has the moment they have paid: did it
 * work, what did I buy, and when does it arrive. The order number is prominent
 * because it is what they will quote if anything goes wrong.
 */
export default function OrderConfirmationPage() {
  const { orderNumber = '' } = useParams();
  const dispatch = useAppDispatch();
  const { data: order, isPending, isError, error, refetch } = useOrder(orderNumber);

  // The wizard is finished; leaving its state around would resume a stale flow.
  useEffect(() => {
    dispatch(resetCheckout());
  }, [dispatch]);

  if (isPending) return <PageLoader />;
  if (isError) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <ErrorState error={error} onRetry={() => void refetch()} />
      </div>
    );
  }
  if (!order) return null;

  return (
    <>
      <Seo title={`Order ${order.orderNumber} confirmed`} noIndex />

      <div className="mx-auto max-w-3xl px-4 py-10">
        <div className="text-center">
          <div className="bg-success/10 text-success mx-auto mb-4 flex size-14 items-center justify-center rounded-full">
            <CheckCircle2 className="size-7" aria-hidden="true" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Thank you — your order is confirmed
          </h1>
          <p className="text-muted-foreground mt-2 text-sm">
            Order <strong className="text-foreground font-mono">{order.orderNumber}</strong>
          </p>
          <p className="text-muted-foreground mt-1 flex items-center justify-center gap-1.5 text-sm">
            <Mail className="size-3.5" aria-hidden="true" />A confirmation has been sent to{' '}
            {order.email}
          </p>
        </div>

        <Card className="mt-8">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Truck className="text-muted-foreground mt-0.5 size-5 shrink-0" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium">
                  {order.shipping.method === 'express' ? 'Express delivery' : 'Standard delivery'}
                </p>
                <address className="text-muted-foreground mt-1 text-sm leading-relaxed not-italic">
                  {order.shippingAddress.fullName}
                  <br />
                  {order.shippingAddress.line1}
                  {order.shippingAddress.line2 && (
                    <>
                      <br />
                      {order.shippingAddress.line2}
                    </>
                  )}
                  <br />
                  {order.shippingAddress.city}, {order.shippingAddress.state}{' '}
                  {order.shippingAddress.postalCode}
                </address>
              </div>
            </div>

            <Separator className="my-5" />

            <ul className="space-y-4">
              {order.items.map((item) => (
                <li key={item._id} className="flex gap-3">
                  <img
                    src={item.productSnapshot.thumbnail}
                    alt=""
                    className="bg-muted size-16 shrink-0 rounded-md object-cover"
                    loading="lazy"
                  />
                  <div className="min-w-0 flex-1">
                    <Link
                      to={`/products/${item.productSnapshot.slug}`}
                      className="text-sm font-medium hover:underline"
                    >
                      {item.productSnapshot.name}
                    </Link>
                    {item.variantSnapshot && (
                      <p className="text-muted-foreground text-xs">
                        {item.variantSnapshot.optionValues.map((o) => o.value).join(' · ')}
                      </p>
                    )}
                    <p className="text-muted-foreground text-xs tabular">Qty {item.quantity}</p>
                  </div>
                  <span className="text-sm font-medium tabular">
                    {formatCurrency(item.lineTotal, order.pricing.currency)}
                  </span>
                </li>
              ))}
            </ul>

            <Separator className="my-5" />

            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Subtotal</dt>
                <dd className="tabular">
                  {formatCurrency(order.pricing.subtotal, order.pricing.currency)}
                </dd>
              </div>
              {order.pricing.discountTotal > 0 && (
                <div className="text-success flex justify-between">
                  <dt>
                    Discount{order.pricing.couponCode ? ` (${order.pricing.couponCode})` : ''}
                  </dt>
                  <dd className="tabular">
                    −{formatCurrency(order.pricing.discountTotal, order.pricing.currency)}
                  </dd>
                </div>
              )}
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Delivery</dt>
                <dd className="tabular">
                  {order.pricing.shippingTotal === 0
                    ? 'Free'
                    : formatCurrency(order.pricing.shippingTotal, order.pricing.currency)}
                </dd>
              </div>
              {order.pricing.taxTotal > 0 && (
                <div className="text-muted-foreground flex justify-between">
                  <dt>Includes GST</dt>
                  <dd className="tabular">
                    {formatCurrency(order.pricing.taxTotal, order.pricing.currency)}
                  </dd>
                </div>
              )}
            </dl>

            <Separator className="my-4" />

            <div className="flex items-baseline justify-between">
              <span className="font-medium">Total paid</span>
              <span className="text-xl font-semibold tabular">
                {formatCurrency(order.pricing.grandTotal, order.pricing.currency)}
              </span>
            </div>

            <p className="text-muted-foreground mt-3 text-xs">
              Placed {formatDate(order.placedAt ?? order.createdAt)}
            </p>
          </CardContent>
        </Card>

        <div className="mt-6 flex flex-wrap justify-center gap-3">
          <Button asChild>
            <Link to={`/account/orders/${order.orderNumber}`}>
              <Package className="size-4" aria-hidden="true" />
              Track this order
            </Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/products">Continue shopping</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
