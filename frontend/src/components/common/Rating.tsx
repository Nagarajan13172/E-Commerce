import { Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatCompact } from '@/lib/format';

interface RatingProps {
  value: number;
  count?: number;
  size?: 'sm' | 'md' | 'lg';
  showCount?: boolean;
  className?: string;
}

const STAR_SIZES = { sm: 'size-3.5', md: 'size-4', lg: 'size-5' } as const;

/**
 * Star rating.
 *
 * The stars are `aria-hidden` and the value is exposed once as text, because a
 * screen reader announcing five separate star icons is noise. Partial fill is
 * done with a clipped overlay rather than half-star glyphs, so 4.3 renders as
 * 4.3 rather than being rounded to 4.5.
 */
export function Rating({ value, count, size = 'sm', showCount = true, className }: RatingProps) {
  const percentage = Math.max(0, Math.min(100, (value / 5) * 100));

  return (
    <span className={cn('inline-flex items-center gap-1.5', className)}>
      <span className="relative inline-flex" aria-hidden="true">
        <span className="inline-flex">
          {[0, 1, 2, 3, 4].map((index) => (
            <Star
              key={index}
              className={cn(STAR_SIZES[size], 'text-muted-foreground/30')}
              fill="currentColor"
            />
          ))}
        </span>
        <span
          className="absolute inset-0 inline-flex overflow-hidden"
          style={{ width: `${percentage}%` }}
        >
          {[0, 1, 2, 3, 4].map((index) => (
            <Star
              key={index}
              className={cn(STAR_SIZES[size], 'text-rating shrink-0')}
              fill="currentColor"
            />
          ))}
        </span>
      </span>

      {showCount && count !== undefined && (
        <span className="text-muted-foreground text-xs tabular">
          {count > 0 ? `${value.toFixed(1)} (${formatCompact(count)})` : 'No reviews'}
        </span>
      )}

      <span className="sr-only">
        {count && count > 0
          ? `Rated ${value.toFixed(1)} out of 5 from ${count} reviews`
          : 'Not yet rated'}
      </span>
    </span>
  );
}
