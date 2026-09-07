import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ExternalLink, Loader2, Pencil, Plus, Tag, Trash2 } from 'lucide-react';
import { createBrandSchema, CONTENT_STATUSES, type CreateBrandInput } from '@ecom/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
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
import { StatusBadge } from '@/components/common/StatusBadge';
import { AdminTable, type Column } from '../components/AdminTable';
import { ConfirmDialog } from '../components/ConfirmDialog';
import {
  useBrandOptions,
  useCreateBrand,
  useDeleteBrand,
  useUpdateBrand,
} from '../api/catalogQueries';
import type { AdminBrand } from '../api/catalog.api';

export default function AdminBrandsPage() {
  const { data, isPending, isError, error, refetch } = useBrandOptions();
  const [editing, setEditing] = useState<AdminBrand | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [deleting, setDeleting] = useState<AdminBrand | null>(null);
  const deleteBrand = useDeleteBrand();

  const brands = data?.items ?? [];

  const columns: Column<AdminBrand>[] = [
    {
      key: 'name',
      header: 'Brand',
      render: (brand) => (
        <div className="flex items-center gap-3">
          {brand.logo ? (
            <img
              src={brand.logo}
              alt=""
              className="bg-muted size-9 shrink-0 rounded object-contain"
              loading="lazy"
            />
          ) : (
            <div className="bg-muted flex size-9 shrink-0 items-center justify-center rounded">
              <Tag className="text-muted-foreground size-4" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{brand.name}</p>
            <p className="text-muted-foreground font-mono text-xs">{brand.slug}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'products',
      header: 'Products',
      className: 'text-right',
      render: (brand) => <span className="text-sm tabular">{brand.productCount}</span>,
    },
    {
      key: 'website',
      header: 'Website',
      secondary: true,
      render: (brand) =>
        brand.website ? (
          <a
            href={brand.website}
            target="_blank"
            rel="noreferrer"
            className="text-muted-foreground inline-flex items-center gap-1 text-xs hover:underline"
          >
            <ExternalLink className="size-3" aria-hidden="true" />
            Visit
          </a>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (brand) => (
        <div className="flex items-center gap-1.5">
          <StatusBadge tone={brand.status === 'active' ? 'success' : 'neutral'}>
            <span className="capitalize">{brand.status}</span>
          </StatusBadge>
          {brand.isFeatured && <StatusBadge tone="info">Featured</StatusBadge>}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (brand) => (
        <div className="flex items-center justify-end gap-0.5">
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(brand)}>
            <Pencil className="size-4" aria-hidden="true" />
            <span className="sr-only">Edit {brand.name}</span>
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setDeleting(brand)}>
            <Trash2 className="size-4" aria-hidden="true" />
            <span className="sr-only">Delete {brand.name}</span>
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Seo title="Brands — Admin" noIndex />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Brands</h1>
          <p className="text-muted-foreground mt-1 text-sm tabular">
            {isPending ? 'Loading…' : `${brands.length} brand${brands.length === 1 ? '' : 's'}`}
          </p>
        </div>
        <Button type="button" onClick={() => setIsCreating(true)}>
          <Plus className="size-4" aria-hidden="true" />
          New brand
        </Button>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <AdminTable
          columns={columns}
          rows={brands}
          rowKey={(brand) => brand._id}
          isLoading={isPending}
          empty={
            <EmptyState
              icon={Tag}
              title="No brands yet"
              description="Brands give customers another way to filter the catalogue."
              action={<Button onClick={() => setIsCreating(true)}>Create a brand</Button>}
            />
          }
        />
      )}

      <BrandDialog
        key={editing?._id ?? 'new'}
        brand={editing}
        open={editing !== null || isCreating}
        onClose={() => {
          setEditing(null);
          setIsCreating(false);
        }}
      />

      <ConfirmDialog
        open={deleting !== null}
        title={`Delete ${deleting?.name ?? 'this brand'}?`}
        description={
          deleting && deleting.productCount > 0
            ? `${deleting.productCount} product${deleting.productCount === 1 ? '' : 's'} reference this brand and will lose it.`
            : 'This brand is not used by any product.'
        }
        confirmLabel="Delete"
        isPending={deleteBrand.isPending}
        onConfirm={() => {
          if (deleting) deleteBrand.mutate(deleting._id, { onSuccess: () => setDeleting(null) });
        }}
        onCancel={() => setDeleting(null)}
      />
    </>
  );
}

function BrandDialog({
  brand,
  open,
  onClose,
}: {
  brand: AdminBrand | null;
  open: boolean;
  onClose: () => void;
}) {
  const createBrand = useCreateBrand();
  const updateBrand = useUpdateBrand();
  const isEditing = brand !== null;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CreateBrandInput>({
    resolver: zodResolver(createBrandSchema) as never,
    defaultValues: brand
      ? {
          name: brand.name,
          slug: brand.slug,
          description: brand.description ?? '',
          logo: brand.logo ?? '',
          website: brand.website ?? '',
          status: brand.status,
          isFeatured: brand.isFeatured,
        }
      : { name: '', description: '', logo: '', website: '', status: 'active', isFeatured: false },
  });

  const onSubmit = handleSubmit((values) => {
    const done = { onSuccess: () => onClose() };
    if (isEditing) updateBrand.mutate({ id: brand._id, input: values }, done);
    else createBrand.mutate(values, done);
  });

  const isSaving = createBrand.isPending || updateBrand.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEditing ? `Edit ${brand.name}` : 'New brand'}</DialogTitle>
          <DialogDescription>Brands appear as a filter on the product listing.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <div className="space-y-1.5">
            <Label htmlFor="brandName">Name</Label>
            <Input id="brandName" {...register('name')} />
            {errors.name && <p className="text-destructive text-xs">{errors.name.message}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brandDescription">Description</Label>
            <Textarea id="brandDescription" rows={3} {...register('description')} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="brandWebsite">Website</Label>
              <Input id="brandWebsite" placeholder="https://example.com" {...register('website')} />
              {errors.website && (
                <p className="text-destructive text-xs">{errors.website.message}</p>
              )}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="brandStatus">Status</Label>
              <Select
                value={watch('status')}
                onValueChange={(value) =>
                  value && setValue('status', value as CreateBrandInput['status'])
                }
              >
                <SelectTrigger id="brandStatus">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONTENT_STATUSES.map((value) => (
                    <SelectItem key={value} value={value} className="capitalize">
                      {value}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="brandLogo">Logo URL</Label>
            <Input id="brandLogo" {...register('logo')} />
            <p className="text-muted-foreground text-xs">
              Upload an image in the Media library and paste its URL here.
            </p>
          </div>

          <div className="flex items-center justify-between gap-4">
            <div>
              <Label htmlFor="brandFeatured">Featured</Label>
              <p className="text-muted-foreground text-xs">Shown on the homepage brand strip.</p>
            </div>
            <Switch
              id="brandFeatured"
              checked={watch('isFeatured')}
              onCheckedChange={(checked) => setValue('isFeatured', checked)}
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSaving}>
              {isSaving && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {isEditing ? 'Save' : 'Create'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
