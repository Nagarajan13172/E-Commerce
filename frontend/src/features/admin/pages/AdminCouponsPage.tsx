import { useState } from 'react';
import { BadgePercent, Loader2, Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  createCouponSchema,
  type CreateCouponFormValues,
  type CreateCouponInput,
} from '@ecom/shared';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Seo } from '@/components/common/Seo';
import { formatCurrency, formatDate } from '@/lib/format';
import { useAdminCoupons, useCreateCoupon, useDeactivateCoupon } from '../api/queries';
import { AdminTable, type Column } from '../components/AdminTable';
import type { AdminCoupon } from '../api/admin.api';

/**
 * An empty optional number field yields `NaN` under `valueAsNumber`, and Zod
 * rejects that as "expected number, received nan" rather than treating it as
 * absent — which would block submission of a coupon with no usage cap.
 */
const optionalNumber = (value: string) => (value === '' ? undefined : Number(value));

export default function AdminCouponsPage() {
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const { data, isPending, isError, error, refetch } = useAdminCoupons({ page: 1 });
  const deactivate = useDeactivateCoupon();

  const columns: Column<AdminCoupon>[] = [
    {
      key: 'code',
      header: 'Code',
      render: (coupon) => (
        <div>
          <span className="font-mono text-sm font-medium">{coupon.code}</span>
          {coupon.description && (
            <p className="text-muted-foreground line-clamp-1 text-xs">{coupon.description}</p>
          )}
        </div>
      ),
    },
    {
      key: 'discount',
      header: 'Discount',
      render: (coupon) => (
        <span className="text-sm tabular">
          {coupon.type === 'percentage'
            ? `${coupon.value}%${coupon.maxDiscount ? ` (max ${formatCurrency(coupon.maxDiscount)})` : ''}`
            : coupon.type === 'fixed'
              ? formatCurrency(coupon.value)
              : 'Free delivery'}
        </span>
      ),
    },
    {
      key: 'conditions',
      header: 'Conditions',
      secondary: true,
      render: (coupon) => (
        <span className="text-muted-foreground text-xs">
          {coupon.minOrderValue > 0 ? `Min ${formatCurrency(coupon.minOrderValue)}` : 'No minimum'}
          {coupon.firstOrderOnly && ' · First order'}
        </span>
      ),
    },
    {
      key: 'usage',
      header: 'Used',
      className: 'text-right',
      render: (coupon) => (
        <span className="text-sm tabular">
          {coupon.usedCount}
          {coupon.usageLimit ? ` / ${coupon.usageLimit}` : ''}
        </span>
      ),
    },
    {
      key: 'expiry',
      header: 'Expires',
      secondary: true,
      render: (coupon) => (
        <span className="text-muted-foreground text-xs">{formatDate(coupon.expiresAt)}</span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (coupon) => {
        const isExpired = new Date(coupon.expiresAt) < new Date();
        return (
          <Badge
            variant="secondary"
            className={
              !coupon.isActive
                ? 'bg-muted text-muted-foreground'
                : isExpired
                  ? 'bg-warning/15 text-warning-foreground'
                  : 'bg-success/15 text-success'
            }
          >
            {!coupon.isActive ? 'Inactive' : isExpired ? 'Expired' : 'Live'}
          </Badge>
        );
      },
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (coupon) =>
        coupon.isActive ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={deactivate.isPending}
            onClick={() => deactivate.mutate(coupon._id)}
          >
            Deactivate
          </Button>
        ) : null,
    },
  ];

  return (
    <>
      <Seo title="Coupons — Admin" noIndex />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Coupons</h1>
          <p className="text-muted-foreground mt-1 text-sm tabular">
            {isPending
              ? 'Loading…'
              : `${data?.meta.total ?? 0} coupon${data?.meta.total === 1 ? '' : 's'}`}
          </p>
        </div>
        <Button type="button" onClick={() => setIsCreateOpen(true)}>
          <Plus className="size-4" aria-hidden="true" />
          New coupon
        </Button>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <AdminTable
          columns={columns}
          rows={data?.data.items ?? []}
          rowKey={(coupon) => coupon._id}
          isLoading={isPending}
          empty={
            <EmptyState
              icon={BadgePercent}
              title="No coupons yet"
              description="Create one to run a promotion."
              action={<Button onClick={() => setIsCreateOpen(true)}>Create a coupon</Button>}
            />
          }
        />
      )}

      <CreateCouponDialog open={isCreateOpen} onOpenChange={setIsCreateOpen} />
    </>
  );
}

function CreateCouponDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const createCoupon = useCreateCoupon();

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<CreateCouponFormValues, unknown, CreateCouponInput>({
    resolver: zodResolver(createCouponSchema),
    defaultValues: {
      code: '',
      type: 'percentage',
      value: 10,
      minOrderValue: 0,
      perUserLimit: 1,
      firstOrderOnly: false,
      isActive: true,
      startsAt: new Date().toISOString().slice(0, 10),
      expiresAt: new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
    },
  });

  const type = watch('type');

  const onSubmit = handleSubmit((values) => {
    createCoupon.mutate(values, {
      onSuccess: () => {
        onOpenChange(false);
        reset();
      },
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New coupon</DialogTitle>
          <DialogDescription>
            Every rule here is enforced server-side on each price calculation.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="code">Code</Label>
              <Input id="code" placeholder="SUMMER20" className="uppercase" {...register('code')} />
              {errors.code && <p className="text-destructive text-xs">{errors.code.message}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="type">Type</Label>
              <Select
                value={type}
                onValueChange={(value) => setValue('type', value as CreateCouponFormValues['type'])}
              >
                <SelectTrigger id="type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage off</SelectItem>
                  <SelectItem value="fixed">Fixed amount off</SelectItem>
                  <SelectItem value="free_shipping">Free delivery</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {type !== 'free_shipping' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="value">{type === 'percentage' ? 'Percentage' : 'Amount'}</Label>
                <Input
                  id="value"
                  type="number"
                  step="0.01"
                  {...register('value', { valueAsNumber: true })}
                />
                {errors.value && <p className="text-destructive text-xs">{errors.value.message}</p>}
              </div>

              {type === 'percentage' && (
                <div className="space-y-1.5">
                  <Label htmlFor="maxDiscount">Maximum discount</Label>
                  <Input
                    id="maxDiscount"
                    type="number"
                    step="0.01"
                    {...register('maxDiscount', { setValueAs: optionalNumber })}
                  />
                  {/* Required by the schema: without a ceiling, "50% off" has
                      no upper bound on a large basket. */}
                  {errors.maxDiscount && (
                    <p className="text-destructive text-xs">{errors.maxDiscount.message}</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="minOrderValue">Minimum order</Label>
              <Input
                id="minOrderValue"
                type="number"
                step="0.01"
                {...register('minOrderValue', { valueAsNumber: true })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="usageLimit">Total uses (optional)</Label>
              <Input
                id="usageLimit"
                type="number"
                placeholder="Unlimited"
                {...register('usageLimit', { setValueAs: optionalNumber })}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="startsAt">Starts</Label>
              <Input id="startsAt" type="date" {...register('startsAt')} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="expiresAt">Expires</Label>
              <Input id="expiresAt" type="date" {...register('expiresAt')} />
              {errors.expiresAt && (
                <p className="text-destructive text-xs">{errors.expiresAt.message}</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createCoupon.isPending}>
              {createCoupon.isPending && <Loader2 className="size-4 animate-spin" />}
              Create coupon
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
