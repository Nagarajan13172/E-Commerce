import { Link } from 'react-router';
import { Check, MapPin, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { useAddresses } from '@/features/account/api/queries';
import { cn } from '@/lib/utils';

interface AddressStepProps {
  selectedId?: string;
  onSelect: (addressId: string) => void;
  onContinue: () => void;
}

/**
 * Delivery address selection.
 *
 * Radio semantics are provided explicitly (`role="radio"` + `aria-checked`)
 * rather than by native inputs, because each option is a card containing a full
 * postal address — an `<input type="radio">` with a label that large is awkward
 * to hit and reads poorly.
 */
export function AddressStep({ selectedId, onSelect, onContinue }: AddressStepProps) {
  const { data: addresses, isPending } = useAddresses();

  const effectiveId =
    selectedId ??
    addresses?.find((address) => address.isDefaultShipping)?._id ??
    addresses?.[0]?._id;

  if (isPending) {
    return (
      <div className="space-y-3">
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-32 rounded-xl" />
      </div>
    );
  }

  if (!addresses || addresses.length === 0) {
    return (
      <EmptyState
        icon={MapPin}
        title="No saved addresses"
        description="Add a delivery address to continue with your order."
        action={
          <Button asChild>
            <Link to="/account/addresses">
              <Plus className="size-4" aria-hidden="true" />
              Add an address
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div>
      <div role="radiogroup" aria-label="Delivery address" className="grid gap-3 sm:grid-cols-2">
        {addresses.map((address) => {
          const isSelected = address._id === effectiveId;

          return (
            <button
              key={address._id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(address._id)}
              className={cn(
                'focus-visible:ring-ring relative rounded-xl border p-4 text-left transition-colors focus-visible:ring-2',
                isSelected ? 'border-primary bg-accent/40' : 'hover:border-muted-foreground/40',
              )}
            >
              {isSelected && (
                <span className="bg-primary text-primary-foreground absolute top-3 right-3 flex size-5 items-center justify-center rounded-full">
                  <Check className="size-3" aria-hidden="true" />
                </span>
              )}

              <span className="text-muted-foreground text-xs font-medium tracking-wide uppercase">
                {address.label}
              </span>

              <address className="mt-1.5 text-sm leading-relaxed not-italic">
                <span className="font-medium">{address.fullName}</span>
                <br />
                {address.line1}
                {address.line2 && (
                  <>
                    <br />
                    {address.line2}
                  </>
                )}
                <br />
                {address.city}, {address.state} {address.postalCode}
                <br />
                <span className="text-muted-foreground tabular">{address.phone}</span>
              </address>
            </button>
          );
        })}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button type="button" onClick={onContinue} disabled={!effectiveId}>
          Continue
        </Button>
        <Button asChild variant="outline">
          <Link to="/account/addresses">
            <Plus className="size-4" aria-hidden="true" />
            Add a new address
          </Link>
        </Button>
      </div>
    </div>
  );
}
