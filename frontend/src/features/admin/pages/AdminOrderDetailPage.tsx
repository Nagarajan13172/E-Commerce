import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, IndianRupee, Loader2, StickyNote, Truck } from 'lucide-react';
import type { OrderStatus } from '@ecom/shared';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
import { OrderStatusBadge } from '@/features/orders/components/OrderStatusBadge';
import { OrderTimeline } from '@/features/orders/components/OrderTimeline';
import { useAuth } from '@/features/auth/api/queries';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/format';
import {
  useAddOrderNote,
  useAdminOrder,
  useRefundOrder,
  useUpdateOrderShipping,
  useUpdateOrderStatus,
} from '../api/queries';

/**
 * Order fulfilment.
 *
 * The status control offers only the transitions the server returned in
 * `allowedTransitions` — a dropdown of every status would let staff attempt
 * moves the state machine will refuse, and turn a clear rule into a confusing
 * error.
 */
export default function AdminOrderDetailPage() {
  const { id = '' } = useParams();
  const { hasPermission } = useAuth();
  const { data, isPending, isError, error, refetch } = useAdminOrder(id);

  const updateStatus = useUpdateOrderStatus();
  const updateShipping = useUpdateOrderShipping();
  const refundOrder = useRefundOrder();
  const addNote = useAddOrderNote();

  const [nextStatus, setNextStatus] = useState<OrderStatus | ''>('');
  const [note, setNote] = useState('');
  const [provider, setProvider] = useState('');
  const [tracking, setTracking] = useState('');
  const [isRefundOpen, setIsRefundOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('');

  if (isPending) return <PageLoader />;
  if (isError) return <ErrorState error={error} onRetry={() => void refetch()} />;
  if (!data) return null;

  const { order, payments, allowedTransitions } = data;
  const refundable = order.pricing.grandTotal - (order.refundedTotal ?? 0);
  const canRefund =
    hasPermission('order:refund') && refundable > 0 && order.paymentStatus !== 'created';

  return (
    <>
      <Seo title={`Order ${order.orderNumber} — Admin`} noIndex />

      <Button asChild variant="ghost" size="sm" className="mb-4 -ml-2">
        <Link to="/admin/orders">
          <ArrowLeft className="size-4" aria-hidden="true" />
          All orders
        </Link>
      </Button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl font-semibold tracking-tight">{order.orderNumber}</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            {formatDateTime(order.placedAt ?? order.createdAt)} · {order.email}
          </p>
        </div>
        <OrderStatusBadge status={order.status} className="text-sm" />
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6">
              <h2 className="mb-4 text-sm font-semibold">Items</h2>
              <ul className="divide-y">
                {order.items.map((item) => (
                  <li key={item._id} className="flex gap-3 py-3 first:pt-0 last:pb-0">
                    <img
                      src={item.productSnapshot.thumbnail}
                      alt=""
                      className="bg-muted size-12 shrink-0 rounded object-cover"
                      loading="lazy"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium">{item.productSnapshot.name}</p>
                      <p className="text-muted-foreground font-mono text-xs">
                        {item.variantSnapshot?.sku ?? item.productSnapshot.sku}
                      </p>
                      <p className="text-muted-foreground text-xs tabular">
                        {item.quantity} × {formatCurrency(item.unitPrice, order.pricing.currency)}
                      </p>
                    </div>
                    <span className="text-sm font-medium tabular">
                      {formatCurrency(item.lineTotal, order.pricing.currency)}
                    </span>
                  </li>
                ))}
              </ul>

              <Separator className="my-4" />

              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Subtotal</dt>
                  <dd className="tabular">
                    {formatCurrency(order.pricing.subtotal, order.pricing.currency)}
                  </dd>
                </div>
                {order.pricing.discountTotal > 0 && (
                  <div className="text-success flex justify-between">
                    <dt>Discount {order.pricing.couponCode && `(${order.pricing.couponCode})`}</dt>
                    <dd className="tabular">−{formatCurrency(order.pricing.discountTotal)}</dd>
                  </div>
                )}
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">Delivery</dt>
                  <dd className="tabular">{formatCurrency(order.pricing.shippingTotal)}</dd>
                </div>
                <div className="flex justify-between font-medium">
                  <dt>Total</dt>
                  <dd className="tabular">{formatCurrency(order.pricing.grandTotal)}</dd>
                </div>
                {order.refundedTotal > 0 && (
                  <div className="text-destructive flex justify-between">
                    <dt>Refunded</dt>
                    <dd className="tabular">−{formatCurrency(order.refundedTotal)}</dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <h2 className="mb-4 text-sm font-semibold">Progress</h2>
              <OrderTimeline timeline={order.timeline} status={order.status} />
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <StickyNote className="size-4" aria-hidden="true" />
                Internal notes
              </h2>
              <p className="text-muted-foreground mb-3 text-xs">
                Only staff can see these — they never appear on the customer&rsquo;s order.
              </p>

              {order.internalNotes.length > 0 && (
                <ul className="mb-3 space-y-2">
                  {order.internalNotes.map((entry, index) => (
                    <li key={index} className="bg-muted/50 rounded-md p-2.5 text-sm">
                      <p>{entry.note}</p>
                      <p className="text-muted-foreground mt-1 text-xs">
                        {entry.by?.name ?? 'Staff'} · {formatDateTime(entry.at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}

              <div className="flex gap-2">
                <Input
                  value={note}
                  onChange={(event) => setNote(event.target.value)}
                  placeholder="Add a note…"
                  aria-label="New internal note"
                />
                <Button
                  type="button"
                  variant="secondary"
                  disabled={!note.trim() || addNote.isPending}
                  onClick={() =>
                    addNote.mutate({ id, note: note.trim() }, { onSuccess: () => setNote('') })
                  }
                >
                  Add
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardContent className="pt-6">
              <h2 className="mb-3 text-sm font-semibold">Update status</h2>

              {allowedTransitions.length === 0 ? (
                <Alert>
                  <AlertDescription className="text-sm">
                    This order is in a final state and cannot be changed.
                  </AlertDescription>
                </Alert>
              ) : (
                <div className="space-y-3">
                  <Select value={nextStatus} onValueChange={(v) => setNextStatus(v as OrderStatus)}>
                    <SelectTrigger aria-label="Next status">
                      <SelectValue placeholder="Choose a next step" />
                    </SelectTrigger>
                    <SelectContent>
                      {/* Only legal transitions — the server would refuse anything else. */}
                      {allowedTransitions.map((status) => (
                        <SelectItem key={status} value={status}>
                          {status.replace(/_/g, ' ')}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  <Button
                    type="button"
                    className="w-full"
                    disabled={!nextStatus || updateStatus.isPending}
                    onClick={() =>
                      updateStatus.mutate(
                        { id, status: nextStatus as OrderStatus },
                        { onSuccess: () => setNextStatus('') },
                      )
                    }
                  >
                    {updateStatus.isPending && <Loader2 className="size-4 animate-spin" />}
                    Apply
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                <Truck className="size-4" aria-hidden="true" />
                Shipping
              </h2>

              <address className="text-muted-foreground mb-4 text-sm leading-relaxed not-italic">
                <span className="text-foreground font-medium">
                  {order.shippingAddress.fullName}
                </span>
                <br />
                {order.shippingAddress.line1}
                <br />
                {order.shippingAddress.city}, {order.shippingAddress.state}{' '}
                {order.shippingAddress.postalCode}
                <br />
                <span className="tabular">{order.shippingAddress.phone}</span>
              </address>

              <div className="space-y-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ship-provider" className="text-xs">
                    Courier
                  </Label>
                  <Input
                    id="ship-provider"
                    defaultValue={order.shipping.provider ?? ''}
                    onChange={(event) => setProvider(event.target.value)}
                    placeholder="Bluedart, Delhivery…"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ship-tracking" className="text-xs">
                    Tracking number
                  </Label>
                  <Input
                    id="ship-tracking"
                    defaultValue={order.shipping.trackingNumber ?? ''}
                    onChange={(event) => setTracking(event.target.value)}
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  className="w-full"
                  disabled={updateShipping.isPending}
                  onClick={() =>
                    updateShipping.mutate({
                      id,
                      provider: provider || order.shipping.provider,
                      trackingNumber: tracking || order.shipping.trackingNumber,
                    })
                  }
                >
                  Save shipping details
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <h2 className="mb-3 text-sm font-semibold">Payments</h2>

              {payments.length === 0 ? (
                <p className="text-muted-foreground text-sm">No payment recorded</p>
              ) : (
                <ul className="space-y-2">
                  {payments.map((payment) => (
                    <li key={payment._id} className="text-sm">
                      <div className="flex justify-between">
                        <span className="capitalize">{payment.status.replace(/_/g, ' ')}</span>
                        <span className="tabular">{formatCurrency(payment.amount)}</span>
                      </div>
                      <p className="text-muted-foreground font-mono text-xs break-all">
                        {payment.providerPaymentId ?? payment.providerOrderId}
                      </p>
                      {payment.paidAt && (
                        <p className="text-muted-foreground text-xs">
                          {formatDate(payment.paidAt)}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {canRefund && (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-4 w-full"
                  onClick={() => {
                    setRefundAmount(String(refundable));
                    setIsRefundOpen(true);
                  }}
                >
                  <IndianRupee className="size-4" aria-hidden="true" />
                  Refund up to {formatCurrency(refundable)}
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isRefundOpen} onOpenChange={setIsRefundOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Refund order {order.orderNumber}</DialogTitle>
            <DialogDescription>
              Up to {formatCurrency(refundable)} can be refunded. This is recorded against the
              payment and cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="refund-amount">Amount</Label>
              <Input
                id="refund-amount"
                type="number"
                inputMode="decimal"
                max={refundable}
                min={1}
                value={refundAmount}
                onChange={(event) => setRefundAmount(event.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="refund-reason">Reason</Label>
              <Textarea
                id="refund-reason"
                rows={3}
                value={refundReason}
                onChange={(event) => setRefundReason(event.target.value)}
                placeholder="Damaged on arrival, wrong item sent…"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsRefundOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                refundOrder.isPending ||
                refundReason.trim().length < 3 ||
                Number(refundAmount) <= 0 ||
                Number(refundAmount) > refundable
              }
              onClick={() =>
                refundOrder.mutate(
                  { id, amount: Number(refundAmount), reason: refundReason.trim() },
                  { onSuccess: () => setIsRefundOpen(false) },
                )
              }
            >
              {refundOrder.isPending && <Loader2 className="size-4 animate-spin" />}
              Issue refund
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
