import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { Loader2, Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { useSuggestions } from '@/features/catalog/api/queries';
import { formatCurrency } from '@/lib/format';
import { cn } from '@/lib/utils';

/**
 * Search with typeahead.
 *
 * Implemented as a combobox rather than a plain input, because a results list
 * that appears under a text field is meaningless to a screen reader without the
 * roles and `aria-activedescendant` wiring that tells it a listbox exists and
 * which option is current.
 *
 * The term is debounced before it reaches the query hook, so the endpoint sees
 * settled words rather than one request per keystroke.
 */
export function SearchBar({
  className,
  onNavigate,
}: {
  className?: string;
  onNavigate?: () => void;
}) {
  const navigate = useNavigate();
  const [term, setTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const debouncedTerm = useDebouncedValue(term, 300);
  const { data, isFetching } = useSuggestions(debouncedTerm);

  const products = data?.products ?? [];
  const terms = data?.terms ?? [];
  const options = [
    ...terms.map((t) => ({ type: 'term' as const, value: t })),
    ...products.map((p) => ({ type: 'product' as const, value: p })),
  ];

  // Close when focus or a click leaves the combobox entirely.
  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!containerRef.current?.contains(event.target as Node)) setIsOpen(false);
    }
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const goToSearch = (query: string) => {
    if (!query.trim()) return;
    setIsOpen(false);
    inputRef.current?.blur();
    onNavigate?.();
    navigate(`/products?q=${encodeURIComponent(query.trim())}`);
  };

  const openProduct = (slug: string) => {
    setIsOpen(false);
    setTerm('');
    onNavigate?.();
    navigate(`/products/${slug}`);
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsOpen(true);
      setHighlighted((index) => Math.min(index + 1, options.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlighted((index) => Math.max(index - 1, -1));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const option = options[highlighted];
      if (option?.type === 'product') openProduct(option.value.slug);
      else if (option?.type === 'term') goToSearch(option.value);
      else goToSearch(term);
    } else if (event.key === 'Escape') {
      setIsOpen(false);
      setHighlighted(-1);
    }
  };

  const showPanel = isOpen && debouncedTerm.trim().length >= 2;

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <form
        role="search"
        onSubmit={(event) => {
          event.preventDefault();
          goToSearch(term);
        }}
      >
        <label htmlFor="site-search" className="sr-only">
          Search products
        </label>
        <div className="relative">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            ref={inputRef}
            id="site-search"
            type="search"
            value={term}
            placeholder="Search for products, brands and more"
            autoComplete="off"
            role="combobox"
            aria-expanded={showPanel}
            aria-controls="search-suggestions"
            aria-autocomplete="list"
            aria-activedescendant={highlighted >= 0 ? `search-option-${highlighted}` : undefined}
            onChange={(event) => {
              setTerm(event.target.value);
              setIsOpen(true);
              setHighlighted(-1);
            }}
            onFocus={() => setIsOpen(true)}
            onKeyDown={handleKeyDown}
            className="h-10 pr-9 pl-9"
          />
          {term && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => {
                setTerm('');
                inputRef.current?.focus();
              }}
              aria-label="Clear search"
              className="absolute top-1/2 right-1 size-7 -translate-y-1/2"
            >
              <X className="size-4" />
            </Button>
          )}
        </div>
      </form>

      {showPanel && (
        <div
          id="search-suggestions"
          role="listbox"
          aria-label="Search suggestions"
          className="bg-popover absolute top-full z-50 mt-1.5 w-full overflow-hidden rounded-lg border shadow-lg"
        >
          {isFetching && options.length === 0 && (
            <div className="text-muted-foreground flex items-center gap-2 p-3 text-sm">
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Searching…
            </div>
          )}

          {!isFetching && options.length === 0 && (
            <p className="text-muted-foreground p-3 text-sm">
              No matches for &ldquo;{debouncedTerm}&rdquo;
            </p>
          )}

          {terms.length > 0 && (
            <ul className="border-b py-1">
              {terms.map((suggestion, index) => (
                <li key={suggestion}>
                  <button
                    type="button"
                    id={`search-option-${index}`}
                    role="option"
                    aria-selected={highlighted === index}
                    onClick={() => goToSearch(suggestion)}
                    onMouseEnter={() => setHighlighted(index)}
                    className={cn(
                      'flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm',
                      highlighted === index ? 'bg-accent' : 'hover:bg-accent',
                    )}
                  >
                    <Search className="text-muted-foreground size-3.5" aria-hidden="true" />
                    {suggestion}
                  </button>
                </li>
              ))}
            </ul>
          )}

          {products.length > 0 && (
            <ul className="py-1">
              {products.map((product, productIndex) => {
                const index = terms.length + productIndex;
                return (
                  <li key={product._id}>
                    <button
                      type="button"
                      id={`search-option-${index}`}
                      role="option"
                      aria-selected={highlighted === index}
                      onClick={() => openProduct(product.slug)}
                      onMouseEnter={() => setHighlighted(index)}
                      className={cn(
                        'flex w-full items-center gap-3 px-3 py-2 text-left',
                        highlighted === index ? 'bg-accent' : 'hover:bg-accent',
                      )}
                    >
                      <img
                        src={product.thumbnail ?? product.images?.[0]?.url}
                        alt=""
                        className="bg-muted size-9 shrink-0 rounded object-cover"
                        loading="lazy"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{product.name}</span>
                        <span className="text-muted-foreground block text-xs tabular">
                          {formatCurrency(product.priceRange.min)}
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
