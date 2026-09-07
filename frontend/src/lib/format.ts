/**
 * Presentation-layer formatting.
 *
 * Money is formatted here and only here — never with string concatenation —
 * so currency symbol, grouping and decimal rules stay consistent and localised.
 */

const currencyFormatters = new Map<string, Intl.NumberFormat>();

/**
 * Decimals are all-or-nothing: two, or none.
 *
 * A single `minimumFractionDigits: 0` / `maximumFractionDigits: 2` formatter
 * renders a whole ₹38,997 correctly but turns an average order value of
 * 19498.5 into "₹19,498.5" — one decimal place, which no currency uses. So the
 * count is chosen per value: whole amounts stay clean (the storefront shows a
 * lot of round prices), and anything with a fraction gets the full two.
 */
function getCurrencyFormatter(currency: string, locale: string, digits: 0 | 2): Intl.NumberFormat {
  const key = `${locale}:${currency}:${digits}`;
  let formatter = currencyFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
    currencyFormatters.set(key, formatter);
  }
  return formatter;
}

export function formatCurrency(amount: number, currency = 'INR', locale = 'en-IN'): string {
  return getCurrencyFormatter(currency, locale, Number.isInteger(amount) ? 0 : 2).format(amount);
}

/** A price range, collapsing to a single value when both ends match. */
export function formatPriceRange(min: number, max: number, currency = 'INR'): string {
  if (min === max) return formatCurrency(min, currency);
  return `${formatCurrency(min, currency)} – ${formatCurrency(max, currency)}`;
}

export function formatDiscount(price: number, compareAtPrice?: number | null): number {
  if (!compareAtPrice || compareAtPrice <= price) return 0;
  return Math.round(((compareAtPrice - price) / compareAtPrice) * 100);
}

export function formatDate(value: string | Date, locale = 'en-IN'): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

export function formatDateTime(value: string | Date, locale = 'en-IN'): string {
  return new Intl.DateTimeFormat(locale, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(value));
}

/** "2 days ago" / "in 3 hours" — used in order timelines and review lists. */
export function formatRelativeTime(value: string | Date, locale = 'en-IN'): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const diffMs = new Date(value).getTime() - Date.now();
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000_000],
    ['month', 2_592_000_000],
    ['day', 86_400_000],
    ['hour', 3_600_000],
    ['minute', 60_000],
  ];

  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms) return rtf.format(Math.round(diffMs / ms), unit);
  }
  return rtf.format(Math.round(diffMs / 1000), 'second');
}

/** Compact counts for review totals and "1.2k sold" badges. */
export function formatCompact(value: number, locale = 'en-IN'): string {
  return new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(
    value,
  );
}
