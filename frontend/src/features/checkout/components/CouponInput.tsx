import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { BadgePercent, Loader2, Tag, X } from 'lucide-react';
import { applyCouponSchema, type ApplyCouponInput } from '@ecom/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { formatCurrency } from '@/lib/format';
import { useApplyCoupon, useRemoveCoupon } from '../api/queries';
import type { CouponEvaluation } from '../api/checkout.api';

interface CouponInputProps {
  coupon?: CouponEvaluation;
  /** Collapsed to a link until opened, to keep the summary uncluttered. */
  defaultOpen?: boolean;
}

/**
 * Coupon entry.
 *
 * Every rule is enforced server-side — this only submits a code and renders the
 * verdict. It deliberately shows the server's own message, because a specific
 * one ("Spend ₹400 more to use this coupon") tells a customer what to do, while
 * "invalid coupon" tells them to give up.
 */
export function CouponInput({ coupon, defaultOpen = false }: CouponInputProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen || Boolean(coupon));
  const applyCoupon = useApplyCoupon();
  const removeCoupon = useRemoveCoupon();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ApplyCouponInput>({
    resolver: zodResolver(applyCouponSchema),
    defaultValues: { code: '' },
  });

  const onSubmit = handleSubmit((values) => {
    applyCoupon.mutate(values.code, { onSuccess: () => reset() });
  });

  // An applied and still-valid coupon: show what it saved, with a way to undo.
  if (coupon?.valid) {
    return (
      <div className="border-success/30 bg-success/5 flex items-center justify-between gap-3 rounded-lg border p-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <BadgePercent className="text-success size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{coupon.code}</p>
            <p className="text-muted-foreground truncate text-xs">
              {coupon.freeShipping
                ? 'Free delivery applied'
                : `You saved ${formatCurrency(coupon.discount)}`}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={removeCoupon.isPending}
          onClick={() => removeCoupon.mutate()}
          aria-label={`Remove coupon ${coupon.code}`}
        >
          {removeCoupon.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <X className="size-4" />
          )}
        </Button>
      </div>
    );
  }

  return (
    <div>
      {/* A coupon that has become invalid is surfaced, not silently dropped —
          the customer applied it and needs to know why it stopped working. */}
      {coupon && !coupon.valid && (
        <div className="border-destructive/30 bg-destructive/5 mb-3 flex items-start gap-2.5 rounded-lg border p-3">
          <Tag className="text-destructive mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">{coupon.code} no longer applies</p>
            <p className="text-muted-foreground text-xs">{coupon.message}</p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => removeCoupon.mutate()}
            aria-label="Remove the coupon that no longer applies"
          >
            <X className="size-4" />
          </Button>
        </div>
      )}

      {!isOpen ? (
        <Button
          type="button"
          variant="link"
          className="h-auto p-0 text-sm"
          onClick={() => setIsOpen(true)}
        >
          <Tag className="size-3.5" aria-hidden="true" />
          Have a coupon code?
        </Button>
      ) : (
        <form onSubmit={onSubmit} className="space-y-1.5" noValidate>
          <Label htmlFor="coupon-code" className="text-sm">
            Coupon code
          </Label>
          <div className="flex gap-2">
            <Input
              id="coupon-code"
              placeholder="WELCOME10"
              autoComplete="off"
              autoCapitalize="characters"
              aria-invalid={Boolean(errors.code)}
              aria-describedby={errors.code ? 'coupon-error' : undefined}
              className="uppercase"
              {...register('code')}
            />
            <Button type="submit" variant="secondary" disabled={applyCoupon.isPending}>
              {applyCoupon.isPending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              Apply
            </Button>
          </div>
          {errors.code && (
            <p id="coupon-error" role="alert" className="text-destructive text-xs">
              {errors.code.message}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
