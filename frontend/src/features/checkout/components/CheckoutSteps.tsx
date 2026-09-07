import { Check } from 'lucide-react';
import { CHECKOUT_STEPS, type CheckoutStep } from '@/store/slices/checkoutSlice';
import { cn } from '@/lib/utils';

const STEP_LABELS: Record<CheckoutStep, string> = {
  contact: 'Contact',
  address: 'Delivery address',
  delivery: 'Delivery speed',
  review: 'Review',
};

interface CheckoutStepsProps {
  current: CheckoutStep;
  completed: CheckoutStep[];
  onSelect: (step: CheckoutStep) => void;
}

/**
 * Wizard progress.
 *
 * A completed step is a button so the customer can go back and change an
 * answer; a future step is plain text, because letting someone jump ahead to
 * "Review" before choosing an address just shows them an error.
 */
export function CheckoutSteps({ current, completed, onSelect }: CheckoutStepsProps) {
  const currentIndex = CHECKOUT_STEPS.indexOf(current);

  return (
    <nav aria-label="Checkout progress" className="mb-8">
      <ol className="flex items-center gap-1 sm:gap-2">
        {CHECKOUT_STEPS.map((step, index) => {
          const isComplete = completed.includes(step);
          const isCurrent = step === current;
          const canNavigate = isComplete && !isCurrent;

          return (
            <li key={step} className="flex flex-1 items-center gap-1 sm:gap-2">
              <button
                type="button"
                disabled={!canNavigate}
                onClick={() => onSelect(step)}
                aria-current={isCurrent ? 'step' : undefined}
                className={cn(
                  'flex min-w-0 items-center gap-2 rounded-md px-1.5 py-1 text-left sm:px-2',
                  canNavigate && 'hover:bg-accent cursor-pointer',
                  !canNavigate && 'cursor-default',
                )}
              >
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium tabular',
                    isComplete && 'bg-primary text-primary-foreground',
                    isCurrent && !isComplete && 'border-primary text-primary border-2',
                    !isComplete && !isCurrent && 'bg-muted text-muted-foreground',
                  )}
                >
                  {isComplete ? <Check className="size-3.5" aria-hidden="true" /> : index + 1}
                </span>
                <span
                  className={cn(
                    'hidden truncate text-sm sm:inline',
                    isCurrent ? 'font-medium' : 'text-muted-foreground',
                  )}
                >
                  {STEP_LABELS[step]}
                </span>
              </button>

              {index < CHECKOUT_STEPS.length - 1 && (
                <span
                  aria-hidden="true"
                  className={cn('h-px flex-1', index < currentIndex ? 'bg-primary' : 'bg-border')}
                />
              )}
            </li>
          );
        })}
      </ol>

      {/* Announced to screen readers, which cannot see the visual progress. */}
      <p className="sr-only" aria-live="polite">
        Step {currentIndex + 1} of {CHECKOUT_STEPS.length}: {STEP_LABELS[current]}
      </p>
    </nav>
  );
}
