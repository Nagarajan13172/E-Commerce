import { useEffect, useMemo, useRef, useState } from 'react';
import { Star } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { formatCurrency } from '@/lib/format';
import type { SearchFacets } from '@/types/catalog';
import type { ProductFilters as Filters } from '../hooks/useProductFilters';

interface ProductFiltersProps {
  facets: SearchFacets;
  filters: Filters;
}

/**
 * The filter sidebar.
 *
 * Facet counts come from the server and are recomputed on every response, so
 * they always describe what is *actually* available under the current filters.
 * Rendering a checkbox whose count is zero would invite a click that produces an
 * empty grid, so those are hidden.
 */
export function ProductFilters({ facets, filters }: ProductFiltersProps) {
  const { query } = filters;

  const attributeSections = useMemo(
    () => Object.entries(facets.attributes).filter(([, buckets]) => buckets.length > 0),
    [facets.attributes],
  );

  /**
   * Which sections are open.
   *
   * Controlled rather than `defaultValue`, because the attribute sections
   * (Color, Size, …) are not known on the first render — facets arrive with the
   * response. A `defaultValue` computed then would omit them, and they would
   * render collapsed with no way for the component to correct itself.
   *
   * Seeded once, so a customer who deliberately collapses a section keeps it
   * collapsed when the facets refresh after a filter change.
   */
  const [openSections, setOpenSections] = useState<string[]>([
    'price',
    'availability',
    'brand',
    'rating',
  ]);
  const hasSeededAttributes = useRef(false);

  useEffect(() => {
    if (hasSeededAttributes.current || attributeSections.length === 0) return;
    hasSeededAttributes.current = true;
    setOpenSections((current) => [
      ...new Set([...current, ...attributeSections.map(([name]) => name)]),
    ]);
  }, [attributeSections]);

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between pb-2">
        <h2 className="text-sm font-semibold">Filters</h2>
        {filters.activeFilterCount > 0 && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={filters.clearAll}
            className="h-auto p-1 text-xs"
          >
            Clear all
          </Button>
        )}
      </div>

      <Accordion type="multiple" value={openSections} onValueChange={setOpenSections}>
        <AccordionItem value="price">
          <AccordionTrigger className="text-sm">Price</AccordionTrigger>
          <AccordionContent>
            <PriceFilter
              min={facets.priceRange.min}
              max={facets.priceRange.max}
              selectedMin={query.minPrice}
              selectedMax={query.maxPrice}
              onChange={filters.setPriceRange}
            />
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="availability">
          <AccordionTrigger className="text-sm">Availability</AccordionTrigger>
          <AccordionContent>
            <div className="flex items-center gap-2.5 py-1">
              <Checkbox
                id="filter-in-stock"
                checked={Boolean(query.inStock)}
                onCheckedChange={(checked) => filters.setInStockOnly(checked === true)}
              />
              <Label
                htmlFor="filter-in-stock"
                className="flex-1 cursor-pointer text-sm font-normal"
              >
                In stock only
              </Label>
              <span className="text-muted-foreground text-xs tabular">
                {facets.availability.inStock}
              </span>
            </div>
          </AccordionContent>
        </AccordionItem>

        {facets.brands.length > 0 && (
          <AccordionItem value="brand">
            <AccordionTrigger className="text-sm">Brand</AccordionTrigger>
            <AccordionContent>
              <FacetCheckboxList
                idPrefix="brand"
                buckets={facets.brands}
                selected={query.brand ?? []}
                onToggle={filters.toggleBrand}
              />
            </AccordionContent>
          </AccordionItem>
        )}

        {facets.ratings.length > 0 && (
          <AccordionItem value="rating">
            <AccordionTrigger className="text-sm">Customer rating</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-0.5">
                {facets.ratings.map((bucket) => {
                  const value = Number(bucket.value);
                  const isSelected = query.rating === value;
                  return (
                    <button
                      key={bucket.value}
                      type="button"
                      onClick={() => filters.setRating(isSelected ? undefined : value)}
                      aria-pressed={isSelected}
                      className={`hover:bg-accent flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                        isSelected ? 'bg-accent font-medium' : ''
                      }`}
                    >
                      <span className="flex" aria-hidden="true">
                        {Array.from({ length: 5 }, (_, index) => (
                          <Star
                            key={index}
                            className={
                              index < value
                                ? 'text-rating size-3.5'
                                : 'text-muted-foreground/30 size-3.5'
                            }
                            fill="currentColor"
                          />
                        ))}
                      </span>
                      <span className="flex-1">&amp; up</span>
                      <span className="text-muted-foreground text-xs tabular">{bucket.count}</span>
                    </button>
                  );
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {attributeSections.map(([name, buckets]) => (
          <AccordionItem key={name} value={name}>
            <AccordionTrigger className="text-sm capitalize">{name}</AccordionTrigger>
            <AccordionContent>
              <FacetCheckboxList
                idPrefix={name}
                buckets={buckets}
                selected={query.attributes?.[name] ?? []}
                onToggle={(value) => filters.toggleAttribute(name, value)}
              />
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}

function FacetCheckboxList({
  idPrefix,
  buckets,
  selected,
  onToggle,
}: {
  idPrefix: string;
  buckets: { value: string; label: string; count: number }[];
  selected: string[];
  onToggle: (value: string) => void;
}) {
  const [showAll, setShowAll] = useState(false);
  // A facet with forty values would push everything below it off screen, so
  // long lists collapse to the first eight.
  const visible = showAll ? buckets : buckets.slice(0, 8);

  return (
    <div className="space-y-0.5">
      {visible.map((bucket) => {
        const id = `${idPrefix}-${bucket.value}`;
        return (
          <div
            key={bucket.value}
            className="hover:bg-accent flex items-center gap-2.5 rounded-md px-2 py-1.5"
          >
            <Checkbox
              id={id}
              checked={selected.includes(bucket.value)}
              onCheckedChange={() => onToggle(bucket.value)}
            />
            <Label htmlFor={id} className="flex-1 cursor-pointer text-sm font-normal">
              {bucket.label}
            </Label>
            <span className="text-muted-foreground text-xs tabular">{bucket.count}</span>
          </div>
        );
      })}

      {buckets.length > 8 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowAll((value) => !value)}
          className="h-auto px-2 py-1 text-xs"
        >
          {showAll ? 'Show less' : `Show all ${buckets.length}`}
        </Button>
      )}
    </div>
  );
}

/**
 * Price range slider.
 *
 * Held in local state while dragging and committed on release, so a drag
 * produces one navigation and one request rather than one per pixel.
 */
function PriceFilter({
  min,
  max,
  selectedMin,
  selectedMax,
  onChange,
}: {
  min: number;
  max: number;
  selectedMin?: number;
  selectedMax?: number;
  onChange: (min: number | undefined, max: number | undefined) => void;
}) {
  const [range, setRange] = useState<[number, number]>([selectedMin ?? min, selectedMax ?? max]);

  // Resync when the URL changes underneath (back button, a cleared chip).
  useEffect(() => {
    setRange([selectedMin ?? min, selectedMax ?? max]);
  }, [selectedMin, selectedMax, min, max]);

  if (min >= max) return null;

  return (
    <div className="px-2 pt-2 pb-1">
      <Slider
        value={range}
        min={min}
        max={max}
        step={Math.max(1, Math.round((max - min) / 100))}
        onValueChange={(value) => setRange([value[0]!, value[1]!])}
        onValueCommit={(value) =>
          onChange(value[0] === min ? undefined : value[0], value[1] === max ? undefined : value[1])
        }
        aria-label="Price range"
        className="mb-3"
      />
      <div className="text-muted-foreground flex items-center justify-between text-xs tabular">
        <span>{formatCurrency(range[0])}</span>
        <span>{formatCurrency(range[1])}</span>
      </div>
    </div>
  );
}
