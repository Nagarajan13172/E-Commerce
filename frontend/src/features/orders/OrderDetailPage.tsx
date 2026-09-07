import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, Loader2, Package, Truck, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Seo } from '@/components/common/Seo';
import { ErrorState } from '@/components/common/ErrorState';
import { PageLoader } from '@/components/common/PageLoader';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import { useCancelOrder, useOrder } from './api/queries';
import { OrderStatusBadge } from './components/OrderStatusBadge';
import { OrderTimeline } from './components/OrderTimeline';

/** Statuses a customer may still cancel — must mirror the server's rule. */
const CANCELLABLE = ['pending_payment', 'confirmed', 'processing'];

export default function OrderDetailPage() {
  const { orderNumber = '' } = useParams();
  const { data: order, isPending, isError, error, refetch } = useOrder(orderNumber);
  const cancelOrder = useCancelOrder();
  const [isCancelOpen, setIsCancelOpen] = useState(false);
  const [reason, setReason] = useState('');

  if (isPending) return <PageLoader />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!order) return null;

  const canCancel = CANCELLABLE.includes(order.status);

  return (
    <>
      <Seo title={`Order ${order.orderNumber}`} noIndex />

      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to="/account/orders">
          <ArrowLeft className="size-4" aria-hidden="true" />
          All orders
        </Link>
      </Button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-mono text-xl font-semibold tracking-tight">{order.orderNumber}</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Placed {formatDate(order.placedAt ?? order.createdAt)}
          </p>
        </div>
        <OrderStatusBadge status={order.status} className="text-sm" />
      </div>

      {order.cancellation && (
        <Alert className="mb-6">
          <XCircle className="size-4" aria-hidden="true" />
          <AlertDescription>
            Cancelled on {formatDateTime(order.cancellation.at)} — {order.cancellation.reason}
            {order.refundedTotal > 0 &&
              `. ${formatCurrency(order.refundedTotal, order.pricing.currency)} has been refunded.`}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6">
              <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold">
                <Package className="size-4" aria-hidden="true" />
                Progress
              </h3>
              <OrderTimeline timeline={order.timeline} status={order.status} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <h3 className="mb-4 text-sm font-semibold">Items</h3>
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
                          {item.variantSnapshot.optionValues
                            .map((o) => `${o.name}: ${o.value}`)
                            .join(' · ')}
                        </p>
                      )}
                      <p className="text-muted-foreground font-mono text-xs">
                        {item.variantSnapshot?.sku ?? item.productSnapshot.sku}
                      </p>
                      <p className="text-muted-foreground text-xs tabular">
                        Qty {item.quantity} ×{' '}
                        {formatCurrency(item.unitPrice, order.pricing.currency)}
                      </p>
                    </div>
                    <span className="text-sm font-medium tabular">
                      {formatCurrency(item.lineTotal, order.pricing.currency)}
                    </span>
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6">
              <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Truck className="size-4" aria-hidden="true" />
                Delivery
              </h3>
              <address className="text-sm leading-relaxed not-italic">
                <span className="font-medium">{order.shippingAddress.fullName}</span>
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
                <br />
                <span className="text-muted-foreground tabular">{order.shippingAddress.phone}</span>
              </address>

              {order.shipping.trackingNumber && (
                <p className="text-muted-foreground mt-3 text-xs">
                  Tracking: <span className="font-mono">{order.shipping.trackingNumber}</span>
                  {order.shipping.provider && ` (${order.shipping.provider})`}
                </p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <h3 className="mb-3 text-sm font-semibold">Payment</h3>
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

              <Separator className="my-3" />

              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium">Total</span>
                <span className="font-semibold tabular">
                  {formatCurrency(order.pricing.grandTotal, order.pricing.currency)}
                </span>
              </div>
            </CardContent>
          </Card>

          {canCancel && (
            <Button
              type="button"
              variant="outline"
              className="text-destructive hover:text-destructive w-full"
              onClick={() => setIsCancelOpen(true)}
            >
              Cancel this order
            </Button>
          )}
        </div>
      </div>

      <Dialog open={isCancelOpen} onOpenChange={setIsCancelOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Cancel order {order.orderNumber}?</DialogTitle>
            <DialogDescription>
              The items will be returned to stock. If you have already paid, a refund will be issued
              to your original payment method.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-1.5">
            <Label htmlFor="cancel-reason">Why are you cancelling?</Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Ordered by mistake, found it cheaper elsewhere…"
              rows={3}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsCancelOpen(false)}>
              Keep my order
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={reason.trim().length < 3 || cancelOrder.isPending}
              onClick={() =>
                cancelOrder.mutate(
                  { orderNumber: order.orderNumber, reason: reason.trim() },
                  { onSuccess: () => setIsCancelOpen(false) },
                )
              }
            >
              {cancelOrder.isPending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              Cancel order
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
