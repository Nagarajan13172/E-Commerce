import { describe, expect, it } from 'vitest';
import { formatCurrency, formatDiscount, formatPriceRange } from '@/lib/format';

describe('formatCurrency', () => {
  it('formats INR with the Indian digit grouping convention', () => {
    // 1,25,000 — not 125,000. Getting this wrong looks broken to Indian users.
    expect(formatCurrency(125000)).toBe('₹1,25,000');
  });

  it('shows two decimal places or none — never one', () => {
    expect(formatCurrency(499)).toBe('₹499');
    // Regression: this used to render "₹499.5". The admin dashboard's average
    // order value made it obvious — no currency is written with one decimal.
    expect(formatCurrency(499.5)).toBe('₹499.50');
    expect(formatCurrency(499.55)).toBe('₹499.55');
  });
});

describe('formatPriceRange', () => {
  it('collapses to a single price when both ends match', () => {
    expect(formatPriceRange(999, 999)).toBe('₹999');
  });

  it('shows a range when variants differ in price', () => {
    expect(formatPriceRange(999, 1499)).toBe('₹999 – ₹1,499');
  });
});

describe('formatDiscount', () => {
  it('computes the percentage off the compare-at price', () => {
    expect(formatDiscount(750, 1000)).toBe(25);
  });

  it('returns 0 when there is no genuine discount', () => {
    expect(formatDiscount(1000, 1000)).toBe(0);
    expect(formatDiscount(1000, 900)).toBe(0);
    expect(formatDiscount(1000, null)).toBe(0);
    expect(formatDiscount(1000)).toBe(0);
  });
});
