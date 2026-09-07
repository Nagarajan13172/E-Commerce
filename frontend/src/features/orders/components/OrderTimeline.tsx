import { Check, Circle } from 'lucide-react';
import type { OrderStatus } from '@ecom/shared';
import { formatDateTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { orderStatusLabel } from './OrderStatusBadge';
import type { OrderTimelineEntry } from '../api/orders.api';

/**
 * What has happened to this order, and what is still to come.
 *
 * Shows the expected remaining steps greyed out rather than only the history,
 * because "where is my order" is answered as much by what comes next as by what
 * already happened.
 */
const HAPPY_PATH: OrderStatus[] = [
  'confirmed',
  'processing',
  'packed',
  'shipped',
  'out_for_delivery',
  'delivered',
];

const ENDED: OrderStatus[] = ['cancelled', 'returned', 'refunded', 'payment_failed', 'expired'];

export function OrderTimeline({
  timeline,
  status,
}: {
  timeline: OrderTimelineEntry[];
  status: OrderStatus;
}) {
  const reached = new Map(timeline.map((entry) => [entry.status, entry]));
  const hasEnded = ENDED.includes(status);

  // A cancelled or refunded order should not display the delivery steps it will
  // never reach — that reads as a promise the store is not keeping.
  const steps = hasEnded
    ? timeline.map((entry) => entry.status)
    : [...new Set([...timeline.map((e) => e.status), ...HAPPY_PATH])].filter(
        (s) => s !== 'pending_payment' || reached.has(s),
      );

  return (
    <ol className="relative space-y-0">
      {steps.map((step, index) => {
        const entry = reached.get(step);
        const isDone = Boolean(entry);
        const isCurrent = step === status;
        const isLast = index === steps.length - 1;

        return (
          <li key={step} className="relative flex gap-3 pb-6 last:pb-0">
            {!isLast && (
              <span
                aria-hidden="true"
                className={cn(
                  'absolute top-6 left-[11px] h-full w-px',
                  isDone ? 'bg-primary' : 'bg-border',
                )}
              />
            )}

            <span
              className={cn(
                'relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full',
                isDone ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
              )}
            >
              {isDone ? (
                <Check className="size-3.5" aria-hidden="true" />
              ) : (
                <Circle className="size-2 fill-current" aria-hidden="true" />
              )}
            </span>

            <div className="min-w-0 flex-1 pt-0.5">
              <p
                className={cn(
                  'text-sm',
                  isCurrent ? 'font-semibold' : isDone ? 'font-medium' : 'text-muted-foreground',
                )}
              >
                {orderStatusLabel(step)}
              </p>
              {entry && (
                <p className="text-muted-foreground text-xs">
                  {formatDateTime(entry.at)}
                  {entry.note ? ` — ${entry.note}` : ''}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
