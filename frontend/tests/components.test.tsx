import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Price } from '@/components/common/Price';
import { Rating } from '@/components/common/Rating';
import { StatusBadge } from '@/components/common/StatusBadge';
import { ProductCard } from '@/components/common/ProductCard';
import type { ProductSummary } from '@/types/catalog';

/**
 * Component tests.
 *
 * These assert what a customer perceives — the text read aloud, the control
 * that responds to a click — rather than which classes were applied. A test
 * that asserts on class names breaks on every restyle and catches nothing,
 * which is worse than no test at all.
 */

describe('Price', () => {
  it('states which price is actually paid when there is a discount', () => {
    render(<Price amount={999} compareAt={1299} />);

    expect(screen.getByText('₹999')).toBeInTheDocument();
    // "₹1,299 ₹999" read aloud is ambiguous about which one is charged, so the
    // struck-through price is hidden and replaced with an explicit phrase.
    expect(screen.getByText('₹1,299')).toHaveAttribute('aria-hidden', 'true');
    expect(screen.getByText(/reduced from ₹1,299/)).toBeInTheDocument();
  });

  it('says nothing about a discount when the compare price is not higher', () => {
    render(<Price amount={999} compareAt={999} />);
    expect(screen.queryByText(/reduced from/)).not.toBeInTheDocument();
  });

  it('shows a range when variants differ in price', () => {
    render(<Price amount={999} range={{ min: 999, max: 1499 }} />);
    expect(screen.getByText('₹999 – ₹1,499')).toBeInTheDocument();
  });

  it('collapses a range whose ends match', () => {
    render(<Price amount={999} range={{ min: 999, max: 999 }} />);
    expect(screen.getByText('₹999')).toBeInTheDocument();
  });
});

describe('Rating', () => {
  it('describes the rating in words for a screen reader', () => {
    render(<Rating value={4.3} count={128} />);
    expect(screen.getByText(/Rated 4.3 out of 5 from 128 reviews/)).toBeInTheDocument();
  });

  it('says there are no reviews rather than showing a zero score', () => {
    render(<Rating value={0} count={0} />);
    expect(screen.getByText('No reviews')).toBeInTheDocument();
  });

  it('hides the decorative stars from assistive technology', () => {
    const { container } = render(<Rating value={3} count={5} />);
    // The stars convey nothing the text does not already say; announcing ten
    // of them before the number is pure noise.
    expect(container.querySelector('[aria-hidden="true"]')).toBeInTheDocument();
  });
});

describe('StatusBadge', () => {
  it('pairs each tone with the foreground meant for its own tint', () => {
    const { rerender } = render(<StatusBadge tone="success">Active</StatusBadge>);
    expect(screen.getByText('Active').className).toContain('text-success-tint-foreground');

    // Regression: these used to be `text-success` on `bg-success/15`, which
    // reads at 3.95:1 — the tint darkens the background and lowers contrast
    // rather than raising it.
    rerender(<StatusBadge tone="danger">Banned</StatusBadge>);
    expect(screen.getByText('Banned').className).toContain('text-destructive-tint-foreground');

    rerender(<StatusBadge tone="warning">Low stock</StatusBadge>);
    expect(screen.getByText('Low stock').className).toContain('text-warning-tint-foreground');
  });
});

const PRODUCT: ProductSummary = {
  _id: 'p1',
  name: 'Linen Overshirt',
  slug: 'linen-overshirt',
  thumbnail: 'https://example.test/shirt.jpg',
  price: 2499,
  compareAtPrice: 3499,
  priceRange: { min: 2499, max: 2499 },
  currency: 'INR',
  inStock: true,
  rating: { average: 4.5, count: 20 },
  brand: { _id: 'b1', name: 'Aurora', slug: 'aurora' },
  discountPercent: 29,
} as ProductSummary;

/**
 * ProductCard prefetches the product detail query on hover, so it needs a
 * client. Retries are off and the cache is fresh per test — a shared client
 * would let one test's cached data satisfy the next one's assertion.
 */
function renderCard(props: Partial<React.ComponentProps<typeof ProductCard>> = {}) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <ProductCard product={PRODUCT} {...props} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('ProductCard', () => {
  it('links to the product and names it', () => {
    renderCard();
    expect(screen.getByRole('link', { name: /Linen Overshirt/ })).toHaveAttribute(
      'href',
      '/products/linen-overshirt',
    );
  });

  it('lets the wishlist button be clicked through the stretched card link', async () => {
    const onToggleWishlist = vi.fn();
    renderCard({ onToggleWishlist });

    // Regression: the card's stretched `::after` link painted over this button
    // on every card in the grid, so the heart could not be clicked at all.
    await userEvent.click(screen.getByRole('button', { name: /wishlist|save|remove/i }));
    expect(onToggleWishlist).toHaveBeenCalledWith('p1', false);
  });

  it('announces the wishlist state rather than relying on the icon fill', () => {
    renderCard({ isSaved: true, onToggleWishlist: vi.fn() });
    expect(screen.getByRole('button', { name: /remove .* wishlist/i })).toBeInTheDocument();
  });

  it('marks an out-of-stock product as such', () => {
    renderCard({ product: { ...PRODUCT, inStock: false } as ProductSummary });
    expect(screen.getByText(/out of stock/i)).toBeInTheDocument();
  });
});
