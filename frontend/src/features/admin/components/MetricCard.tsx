import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import type { MetricWithChange } from '../api/admin.api';

interface MetricCardProps {
  label: string;
  metric?: MetricWithChange;
  format: (value: number) => string;
  icon: LucideIcon;
  isLoading?: boolean;
  /** True when a fall is good news (e.g. refunds). */
  inverse?: boolean;
}

/**
 * A headline number with its period-over-period change.
 *
 * The change is what makes the number mean something — "₹2.4L" says little,
 * "₹2.4L, up 12%" says whether the week went well. A null change (no baseline)
 * is rendered as "no prior data" rather than as +100%, which would be a lie.
 */
export function MetricCard({
  label,
  metric,
  format,
  icon: Icon,
  isLoading,
  inverse,
}: MetricCardProps) {
  if (isLoading || !metric) {
    return (
      <Card>
        <CardContent className="pt-6">
          <Skeleton className="h-4 w-24" />
          <Skeleton className="mt-3 h-8 w-32" />
          <Skeleton className="mt-2 h-3 w-20" />
        </CardContent>
      </Card>
    );
  }

  const change = metric.changePercent;
  const isUp = change !== null && change > 0;
  const isFlat = change === 0;
  const isGood = inverse ? !isUp : isUp;

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center justify-between">
          <p className="text-muted-foreground text-sm">{label}</p>
          <Icon className="text-muted-foreground size-4" aria-hidden="true" />
        </div>

        <p className="mt-2 text-2xl font-semibold tabular">{format(metric.value)}</p>

        <p className="text-muted-foreground mt-1 flex items-center gap-1 text-xs">
          {change === null ? (
            <span>No prior period to compare</span>
          ) : (
            <>
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 font-medium',
                  isFlat ? 'text-muted-foreground' : isGood ? 'text-success' : 'text-destructive',
                )}
              >
                {isFlat ? (
                  <Minus className="size-3" aria-hidden="true" />
                ) : isUp ? (
                  <ArrowUpRight className="size-3" aria-hidden="true" />
                ) : (
                  <ArrowDownRight className="size-3" aria-hidden="true" />
                )}
                {Math.abs(change)}%
              </span>
              <span>vs previous period</span>
            </>
          )}
        </p>
      </CardContent>
    </Card>
  );
}
