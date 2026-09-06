import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Loader2, MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { addressSchema, type AddressFormValues, type AddressInput } from '@ecom/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Seo } from '@/components/common/Seo';
import {
  useAddresses,
  useCreateAddress,
  useDeleteAddress,
  useSetDefaultAddress,
  useUpdateAddress,
} from './api/queries';
import type { Address } from '@/types/cart';

export default function AddressesPage() {
  const { data: addresses, isPending, isError, error, refetch } = useAddresses();
  const [editing, setEditing] = useState<Address | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Address | null>(null);

  const deleteAddress = useDeleteAddress();
  const setDefault = useSetDefaultAddress();

  const openCreate = () => {
    setEditing(null);
    setIsFormOpen(true);
  };

  const openEdit = (address: Address) => {
    setEditing(address);
    setIsFormOpen(true);
  };

  return (
    <>
      <Seo title="Addresses" noIndex />

      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Addresses</h2>
          <p className="text-muted-foreground mt-1 text-sm">
            Where your orders should be delivered
          </p>
        </div>
        <Button type="button" onClick={openCreate}>
          <Plus className="size-4" aria-hidden="true" />
          Add address
        </Button>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : isPending ? (
        <div className="grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 2 }, (_, index) => (
            <Skeleton key={index} className="h-44 rounded-xl" />
          ))}
        </div>
      ) : addresses.length === 0 ? (
        <EmptyState
          icon={MapPin}
          title="No saved addresses"
          description="Add an address to speed up checkout."
          action={<Button onClick={openCreate}>Add your first address</Button>}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {addresses.map((address) => (
            <li key={address._id}>
              <Card className="h-full">
                <CardContent className="flex h-full flex-col gap-3 pt-6">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="secondary" className="capitalize">
                        {address.label}
                      </Badge>
                      {address.isDefaultShipping && <Badge>Default delivery</Badge>}
                    </div>
                  </div>

                  <address className="text-sm leading-relaxed not-italic">
                    <span className="font-medium">{address.fullName}</span>
                    <br />
                    {address.line1}
                    {address.line2 && (
                      <>
                        <br />
                        {address.line2}
                      </>
                    )}
                    {address.landmark && (
                      <>
                        <br />
                        <span className="text-muted-foreground">Near {address.landmark}</span>
                      </>
                    )}
                    <br />
                    {address.city}, {address.state} {address.postalCode}
                    <br />
                    {address.country}
                    <br />
                    <span className="text-muted-foreground tabular">{address.phone}</span>
                  </address>

                  <div className="mt-auto flex flex-wrap gap-1.5 pt-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => openEdit(address)}
                    >
                      <Pencil className="size-3.5" aria-hidden="true" />
                      Edit
                    </Button>
                    {!address.isDefaultShipping && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={setDefault.isPending}
                        onClick={() => setDefault.mutate(address._id)}
                      >
                        <Star className="size-3.5" aria-hidden="true" />
                        Set default
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => setPendingDelete(address)}
                    >
                      <Trash2 className="size-3.5" aria-hidden="true" />
                      Remove
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <AddressFormDialog open={isFormOpen} address={editing} onOpenChange={setIsFormOpen} />

      {/* Deletion is confirmed rather than immediate: it is destructive, and an
          accidental tap on a small screen is easy. */}
      <Dialog
        open={Boolean(pendingDelete)}
        onOpenChange={(open) => !open && setPendingDelete(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Remove this address?</DialogTitle>
            <DialogDescription>
              {pendingDelete?.fullName}, {pendingDelete?.line1}, {pendingDelete?.city}. This cannot
              be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPendingDelete(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={deleteAddress.isPending}
              onClick={() => {
                if (pendingDelete) {
                  deleteAddress.mutate(pendingDelete._id, {
                    onSettled: () => setPendingDelete(null),
                  });
                }
              }}
            >
              {deleteAddress.isPending && <Loader2 className="size-4 animate-spin" />}
              Remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function AddressFormDialog({
  open,
  address,
  onOpenChange,
}: {
  open: boolean;
  address: Address | null;
  onOpenChange: (open: boolean) => void;
}) {
  const createAddress = useCreateAddress();
  const updateAddress = useUpdateAddress();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<AddressFormValues, unknown, AddressInput>({
    resolver: zodResolver(addressSchema),
    values: address
      ? {
          label: address.label as AddressFormValues['label'],
          fullName: address.fullName,
          phone: address.phone,
          line1: address.line1,
          line2: address.line2 ?? '',
          landmark: address.landmark ?? '',
          city: address.city,
          state: address.state,
          postalCode: address.postalCode,
          country: address.country,
          isDefaultShipping: address.isDefaultShipping,
          isDefaultBilling: address.isDefaultBilling,
        }
      : {
          label: 'home',
          fullName: '',
          phone: '',
          line1: '',
          line2: '',
          landmark: '',
          city: '',
          state: '',
          postalCode: '',
          country: 'India',
          isDefaultShipping: false,
          isDefaultBilling: false,
        },
  });

  const onSubmit = handleSubmit((values) => {
    const onSuccess = () => {
      onOpenChange(false);
      reset();
    };

    if (address) updateAddress.mutate({ id: address._id, input: values }, { onSuccess });
    else createAddress.mutate(values, { onSuccess });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{address ? 'Edit address' : 'Add a new address'}</DialogTitle>
          <DialogDescription>Used for delivery and for your invoice.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="fullName" label="Full name" error={errors.fullName?.message}>
              <Input id="fullName" autoComplete="name" {...register('fullName')} />
            </Field>

            <Field id="phone" label="Phone" error={errors.phone?.message}>
              <Input
                id="phone"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                {...register('phone')}
              />
            </Field>
          </div>

          <Field id="line1" label="Address line 1" error={errors.line1?.message}>
            <Input id="line1" autoComplete="address-line1" {...register('line1')} />
          </Field>

          <Field id="line2" label="Address line 2 (optional)" error={errors.line2?.message}>
            <Input id="line2" autoComplete="address-line2" {...register('line2')} />
          </Field>

          <Field id="landmark" label="Landmark (optional)" error={errors.landmark?.message}>
            <Input id="landmark" {...register('landmark')} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field id="city" label="City" error={errors.city?.message}>
              <Input id="city" autoComplete="address-level2" {...register('city')} />
            </Field>

            <Field id="state" label="State" error={errors.state?.message}>
              <Input id="state" autoComplete="address-level1" {...register('state')} />
            </Field>

            <Field id="postalCode" label="PIN code" error={errors.postalCode?.message}>
              <Input
                id="postalCode"
                inputMode="numeric"
                autoComplete="postal-code"
                {...register('postalCode')}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="country" label="Country" error={errors.country?.message}>
              <Input id="country" autoComplete="country-name" {...register('country')} />
            </Field>

            <div className="space-y-1.5">
              <Label htmlFor="label">Address type</Label>
              <Select
                value={watch('label')}
                onValueChange={(value) => setValue('label', value as AddressFormValues['label'])}
              >
                <SelectTrigger id="label">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="home">Home</SelectItem>
                  <SelectItem value="work">Work</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {address ? 'Save changes' : 'Add address'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Label + control + error, wired together for screen readers. */
function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {error && (
        <p role="alert" className="text-destructive text-xs">
          {error}
        </p>
      )}
    </div>
  );
}
