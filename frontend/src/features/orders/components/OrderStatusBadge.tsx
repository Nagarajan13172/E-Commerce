import { Badge } from '@/components/ui/badge';
import type { OrderStatus } from '@ecom/shared';
import { cn } from '@/lib/utils';

/**
 * Status, in words a customer understands.
 *
 * The internal names are for the state machine; `pending_payment` and
 * `out_for_delivery` are not what anyone says out loud. Colour never carries the
 * meaning alone — the label always does.
 */
const PRESENTATION: Record<OrderStatus, { label: string; className: string }> = {
  pending_payment: {
    label: 'Awaiting payment',
    className: 'bg-warning/15 text-warning-foreground',
  },
  confirmed: { label: 'Confirmed', className: 'bg-success/15 text-success' },
  processing: { label: 'Being prepared', className: 'bg-primary/15 text-primary' },
  packed: { label: 'Packed', className: 'bg-primary/15 text-primary' },
  shipped: { label: 'Shipped', className: 'bg-primary/15 text-primary' },
  out_for_delivery: { label: 'Out for delivery', className: 'bg-primary/15 text-primary' },
  delivered: { label: 'Delivered', className: 'bg-success/15 text-success' },
  cancelled: { label: 'Cancelled', className: 'bg-muted text-muted-foreground' },
  returned: { label: 'Returned', className: 'bg-muted text-muted-foreground' },
  refunded: { label: 'Refunded', className: 'bg-muted text-muted-foreground' },
  payment_failed: { label: 'Payment failed', className: 'bg-destructive/15 text-destructive' },
  expired: { label: 'Expired', className: 'bg-muted text-muted-foreground' },
};

export function OrderStatusBadge({
  status,
  className,
}: {
  status: OrderStatus;
  className?: string;
}) {
  const { label, className: tone } = PRESENTATION[status];
  return (
    <Badge variant="secondary" className={cn('font-medium', tone, className)}>
      {label}
    </Badge>
  );
}

export function orderStatusLabel(status: OrderStatus): string {
  return PRESENTATION[status].label;
}
