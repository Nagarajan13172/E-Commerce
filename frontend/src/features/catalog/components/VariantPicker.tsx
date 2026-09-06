import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { ProductOption } from '@/types/catalog';
import type { VariantSelection } from '../hooks/useVariantSelection';

interface VariantPickerProps {
  options: ProductOption[];
  selection: VariantSelection;
}

/**
 * Option selection.
 *
 * Only values that exist in NO variant are disabled. A value that simply does
 * not combine with the current selection stays clickable and struck through —
 * clicking it switches to that value and clears whichever other choice was
 * blocking it. Disabling those instead would dead-end a customer who happened to
 * pick their size before their colour.
 *
 * State is never carried by colour alone: unavailable values are struck through,
 * and every button spells out its state in an accessible label.
 */
export function VariantPicker({ options, selection }: VariantPickerProps) {
  if (options.length === 0) return null;

  return (
    <div className="space-y-4">
      {[...options]
        .sort((a, b) => a.position - b.position)
        .map((option) => {
          const values = selection.optionValues[option.name] ?? [];
          const chosen = selection.selected[option.name];

          return (
            <fieldset key={option.name}>
              <legend className="mb-2 flex items-baseline gap-2 text-sm font-medium">
                {option.name}
                {chosen && <span className="text-muted-foreground font-normal">{chosen}</span>}
              </legend>

              <div className="flex flex-wrap gap-2">
                {values.map(({ value, existsAtAll, isAvailable, isOutOfStock }) => {
                  const isSelected = chosen === value;

                  return (
                    <button
                      key={value}
                      type="button"
                      // Disabled ONLY when nothing sold has this value.
                      disabled={!existsAtAll}
                      onClick={() => selection.select(option.name, value)}
                      aria-pressed={isSelected}
                      aria-label={`${option.name} ${value}${
                        !existsAtAll
                          ? ', not available'
                          : !isAvailable
                            ? ', requires changing your other selection'
                            : isOutOfStock
                              ? ', out of stock'
                              : ''
                      }`}
                      className={cn(
                        'focus-visible:ring-ring relative min-w-11 rounded-md border px-3.5 py-2 text-sm transition-colors focus-visible:ring-2 focus-visible:ring-offset-1',
                        isSelected && 'border-primary bg-primary text-primary-foreground',
                        !isSelected && isAvailable && 'hover:border-primary/50 bg-background',
                        !isSelected &&
                          existsAtAll &&
                          !isAvailable &&
                          'text-muted-foreground/60 hover:border-primary/40 line-through',
                        !existsAtAll &&
                          'text-muted-foreground/40 cursor-not-allowed line-through opacity-50',
                        isAvailable && isOutOfStock && !isSelected && 'text-muted-foreground',
                      )}
                    >
                      {value}
                      {isAvailable && isOutOfStock && (
                        <span className="sr-only"> (out of stock)</span>
                      )}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          );
        })}
    </div>
  );
}

export { Label };
