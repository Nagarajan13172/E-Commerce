import { Check, Truck, Zap } from 'lucide-react';
import { DELIVERY_METHODS, DELIVERY_OPTIONS, type DeliveryMethod } from '@ecom/shared';
import { Button } from '@/components/ui/button';
import { formatCurrency, formatDate } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { CheckoutQuote } from '../api/checkout.api';

interface DeliveryStepProps {
  selected: DeliveryMethod;
  quote?: CheckoutQuote;
  onSelect: (method: DeliveryMethod) => void;
  onContinue: () => void;
}

const ICONS: Record<DeliveryMethod, typeof Truck> = { standard: Truck, express: Zap };

/**
 * Delivery speed.
 *
 * The price shown against the selected option comes from the quote — the server
 * decides whether standard is free for this basket, so the UI never guesses.
 * Unselected options show their name and lead time only, rather than a price
 * this component would have to compute itself and could get wrong.
 */
export function DeliveryStep({ selected, quote, onSelect, onContinue }: DeliveryStepProps) {
  return (
    <div>
      <div role="radiogroup" aria-label="Delivery speed" className="space-y-3">
        {DELIVERY_METHODS.map((method) => {
          const option = DELIVERY_OPTIONS[method];
          const Icon = ICONS[method];
          const isSelected = method === selected;

          return (
            <button
              key={method}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(method)}
              className={cn(
                'focus-visible:ring-ring flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-colors focus-visible:ring-2',
                isSelected ? 'border-primary bg-accent/40' : 'hover:border-muted-foreground/40',
              )}
            >
              <Icon className="text-muted-foreground size-5 shrink-0" aria-hidden="true" />

              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{option.label}</span>
                <span className="text-muted-foreground block text-xs">
                  {isSelected && quote
                    ? `Arrives ${formatDate(quote.estimatedDelivery.from)} – ${formatDate(quote.estimatedDelivery.to)}`
                    : `${option.minDays}–${option.maxDays} working days`}
                </span>
              </span>

              {isSelected && quote && (
                <span className="shrink-0 text-sm font-medium tabular">
                  {quote.pricing.shippingTotal === 0 ? (
                    <span className="text-success">Free</span>
                  ) : (
                    formatCurrency(quote.pricing.shippingTotal, quote.pricing.currency)
                  )}
                </span>
              )}

              {isSelected && (
                <span className="bg-primary text-primary-foreground flex size-5 shrink-0 items-center justify-center rounded-full">
                  <Check className="size-3" aria-hidden="true" />
                </span>
              )}
            </button>
          );
        })}
      </div>

      <Button type="button" onClick={onContinue} className="mt-5">
        Continue
      </Button>
    </div>
  );
}
