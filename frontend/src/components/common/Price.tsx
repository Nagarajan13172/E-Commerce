import { cn } from '@/lib/utils';
import { formatCurrency, formatPriceRange } from '@/lib/format';

interface PriceProps {
  amount: number;
  compareAt?: number | null;
  /** Renders "₹999 – ₹1,499" when a product's variants differ in price. */
  range?: { min: number; max: number };
  currency?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZES = {
  sm: { current: 'text-sm font-semibold', was: 'text-xs' },
  md: { current: 'text-base font-semibold', was: 'text-sm' },
  lg: { current: 'text-2xl font-semibold', was: 'text-base' },
} as const;

/**
 * Price display.
 *
 * `tabular` is not decorative: proportional digits make a column of prices in a
 * grid look visibly ragged, and misaligned decimals are harder to compare.
 *
 * The struck-through original is marked up with `<s>` and given an explicit
 * screen-reader label — "₹1,299 ₹999" read aloud with no context is ambiguous
 * about which price the customer actually pays.
 */
export function Price({
  amount,
  compareAt,
  range,
  currency = 'INR',
  size = 'md',
  className,
}: PriceProps) {
  const showRange = range && range.min !== range.max;
  const hasDiscount = compareAt != null && compareAt > amount;
  const styles = SIZES[size];

  return (
    <span className={cn('inline-flex items-baseline gap-2', className)}>
      <span className={cn(styles.current, 'tabular')}>
        {showRange
          ? formatPriceRange(range.min, range.max, currency)
          : formatCurrency(amount, currency)}
      </span>

      {hasDiscount && !showRange && (
        <>
          <s className={cn(styles.was, 'text-muted-foreground tabular')} aria-hidden="true">
            {formatCurrency(compareAt, currency)}
          </s>
          <span className="sr-only">, reduced from {formatCurrency(compareAt, currency)}</span>
        </>
      )}
    </span>
  );
}
