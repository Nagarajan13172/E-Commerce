import { Badge } from '@/components/ui/badge';
import type { OrderStatus } from '@ecom/shared';
import { cn } from '@/lib/utils';
import { toneClass } from '@/components/common/StatusBadge';

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
    className: toneClass('warning'),
  },
  confirmed: { label: 'Confirmed', className: toneClass('success') },
  processing: { label: 'Being prepared', className: toneClass('info') },
  packed: { label: 'Packed', className: toneClass('info') },
  shipped: { label: 'Shipped', className: toneClass('info') },
  out_for_delivery: { label: 'Out for delivery', className: toneClass('info') },
  delivered: { label: 'Delivered', className: toneClass('success') },
  cancelled: { label: 'Cancelled', className: toneClass('neutral') },
  returned: { label: 'Returned', className: toneClass('neutral') },
  refunded: { label: 'Refunded', className: toneClass('neutral') },
  payment_failed: { label: 'Payment failed', className: toneClass('danger') },
  expired: { label: 'Expired', className: toneClass('neutral') },
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
