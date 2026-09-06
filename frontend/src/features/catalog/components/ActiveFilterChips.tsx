import { X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface ActiveFilterChipsProps {
  chips: { key: string; value?: string; label: string }[];
  onRemove: (key: string, value?: string) => void;
  onClearAll: () => void;
}

/**
 * Removable chips for every active filter.
 *
 * Without these, the only way to see what is filtering the results is to open
 * each accordion section and look — and the only way to undo one is to find it
 * again. Chips make the current state visible and individually reversible.
 */
export function ActiveFilterChips({ chips, onRemove, onClearAll }: ActiveFilterChipsProps) {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-muted-foreground text-xs font-medium">Filtered by:</span>

      {chips.map((chip) => (
        <Badge
          key={`${chip.key}:${chip.value ?? ''}`}
          variant="secondary"
          className="gap-1 py-1 pr-1 pl-2.5 font-normal"
        >
          {chip.label}
          <button
            type="button"
            onClick={() => onRemove(chip.key, chip.value)}
            aria-label={`Remove filter ${chip.label}`}
            className="hover:bg-background/80 rounded-full p-0.5 transition-colors"
          >
            <X className="size-3" aria-hidden="true" />
          </button>
        </Badge>
      ))}

      {chips.length > 1 && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClearAll}
          className="h-auto px-2 py-1 text-xs"
        >
          Clear all
        </Button>
      )}
    </div>
  );
}
