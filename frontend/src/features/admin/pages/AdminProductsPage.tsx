import { useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { ExternalLink, Package, Pencil, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { EmptyState } from '@/components/common/EmptyState';
import { ErrorState } from '@/components/common/ErrorState';
import { Seo } from '@/components/common/Seo';
import { Pagination } from '@/features/catalog/components/Pagination';
import { formatCurrency } from '@/lib/format';
import { useAdminProducts, useBulkProductAction } from '../api/queries';
import { AdminTable, type Column } from '../components/AdminTable';
import type { AdminProductRow } from '../api/admin.api';
import { toneClass } from '@/components/common/StatusBadge';

const BULK_ACTIONS = [
  { value: 'publish', label: 'Publish' },
  { value: 'unpublish', label: 'Move to draft' },
  { value: 'feature', label: 'Feature' },
  { value: 'unfeature', label: 'Unfeature' },
  { value: 'archive', label: 'Archive' },
  { value: 'restore', label: 'Restore' },
] as const;

/**
 * Product catalogue.
 *
 * Selection lives in component state keyed by id and is cleared after a bulk
 * action succeeds — leaving rows ticked after they have changed status invites
 * an admin to apply a second action to a set that no longer means what they
 * thought it did.
 */
export default function AdminProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [action, setAction] = useState<string>('');

  const q = searchParams.get('q') ?? '';
  const status = searchParams.get('status') ?? 'all';
  const page = Number(searchParams.get('page') ?? 1);

  const { data, isPending, isError, error, refetch, isFetching } = useAdminProducts({
    ...(q ? { q } : {}),
    ...(status !== 'all' ? { status } : {}),
    page,
    limit: 20,
  });

  const bulk = useBulkProductAction();

  const setParam = (key: string, value?: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setSearchParams(next);
  };

  const rows = data?.data.items ?? [];
  const allSelected = rows.length > 0 && rows.every((row) => selected.has(row._id));

  const toggle = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runBulk = () => {
    if (!action || selected.size === 0) return;
    bulk.mutate(
      { ids: [...selected], action },
      {
        onSuccess: () => {
          setSelected(new Set());
          setAction('');
        },
      },
    );
  };

  const columns: Column<AdminProductRow>[] = [
    {
      key: 'select',
      header: '',
      className: 'w-10',
      render: (product) => (
        <Checkbox
          checked={selected.has(product._id)}
          onCheckedChange={() => toggle(product._id)}
          aria-label={`Select ${product.name}`}
        />
      ),
    },
    {
      key: 'product',
      header: 'Product',
      render: (product) => (
        <div className="flex items-center gap-3">
          {product.thumbnail ? (
            <img
              src={product.thumbnail}
              alt=""
              className="bg-muted size-10 shrink-0 rounded object-cover"
              loading="lazy"
            />
          ) : (
            <div className="bg-muted flex size-10 shrink-0 items-center justify-center rounded">
              <Package className="text-muted-foreground size-4" aria-hidden="true" />
            </div>
          )}
          <div className="min-w-0">
            <p className="line-clamp-1 text-sm font-medium">{product.name}</p>
            <p className="text-muted-foreground font-mono text-xs">{product.sku}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'brand',
      header: 'Brand',
      secondary: true,
      render: (product) => (
        <span className="text-muted-foreground text-sm">{product.brand?.name ?? '—'}</span>
      ),
    },
    {
      key: 'price',
      header: 'Price',
      className: 'text-right',
      render: (product) => (
        <span className="text-sm tabular">
          {product.priceRange.min === product.priceRange.max
            ? formatCurrency(product.priceRange.min)
            : `${formatCurrency(product.priceRange.min)}–${formatCurrency(product.priceRange.max)}`}
        </span>
      ),
    },
    {
      key: 'stock',
      header: 'Stock',
      className: 'text-right',
      render: (product) => (
        <span className={product.inStock ? 'text-sm tabular' : 'text-destructive text-sm tabular'}>
          {product.totalStock}
          {product.variantCount > 0 && (
            <span className="text-muted-foreground"> · {product.variantCount}v</span>
          )}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (product) => (
        <div className="flex items-center gap-1.5">
          <Badge
            variant="secondary"
            className={
              product.status === 'active'
                ? `${toneClass('success')} capitalize`
                : product.status === 'draft'
                  ? `${toneClass('warning')} capitalize`
                  : `${toneClass('neutral')} capitalize`
            }
          >
            {product.status}
          </Badge>
          {product.isFeatured && <Badge variant="outline">Featured</Badge>}
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (product) => (
        <div className="flex items-center justify-end gap-0.5">
          <Button asChild variant="ghost" size="sm">
            <Link to={`/admin/products/${product._id}/edit`}>
              <Pencil className="size-4" aria-hidden="true" />
              <span className="sr-only">Edit {product.name}</span>
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            {/* Opens the storefront page so an admin can check the
                customer-facing result rather than trusting the row. */}
            <Link to={`/products/${product.slug}`} target="_blank" rel="noreferrer">
              <ExternalLink className="size-4" aria-hidden="true" />
              <span className="sr-only">View {product.name} on the storefront</span>
            </Link>
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Seo title="Products — Admin" noIndex />

      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Products</h1>
          <p className="text-muted-foreground mt-1 text-sm tabular">
            {isPending
              ? 'Loading…'
              : `${data?.meta.total ?? 0} product${data?.meta.total === 1 ? '' : 's'}`}
          </p>
        </div>
        <Button asChild>
          <Link to="/admin/products/new">
            <Plus className="size-4" aria-hidden="true" />
            New product
          </Link>
        </Button>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            defaultValue={q}
            placeholder="Search by name or SKU…"
            aria-label="Search products"
            className="pl-9"
            onKeyDown={(event) => {
              if (event.key === 'Enter') setParam('q', event.currentTarget.value || undefined);
            }}
          />
        </div>

        <Select value={status} onValueChange={(value) => setParam('status', value)}>
          <SelectTrigger className="w-[150px]" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="draft">Draft</SelectItem>
            <SelectItem value="archived">Archived</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {selected.size > 0 && (
        <div className="bg-muted/60 mb-4 flex flex-wrap items-center gap-3 rounded-lg border p-3">
          <span className="text-sm font-medium tabular">{selected.size} selected</span>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger className="w-[180px]" aria-label="Bulk action">
              <SelectValue placeholder="Choose an action…" />
            </SelectTrigger>
            <SelectContent>
              {BULK_ACTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" size="sm" disabled={!action || bulk.isPending} onClick={runBulk}>
            Apply
          </Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
            Clear
          </Button>
        </div>
      )}

      {rows.length > 0 && (
        <label className="mb-2 flex items-center gap-2 text-sm">
          <Checkbox
            checked={allSelected}
            onCheckedChange={(checked) =>
              setSelected(checked ? new Set(rows.map((row) => row._id)) : new Set())
            }
          />
          Select all on this page
        </label>
      )}

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <>
          <AdminTable
            columns={columns}
            rows={rows}
            rowKey={(product) => product._id}
            isLoading={isPending}
            isRefreshing={isFetching && !isPending}
            empty={
              <EmptyState
                icon={Package}
                title="No products found"
                description="Try a different search or status filter."
              />
            }
          />

          {data && (
            <Pagination
              page={data.meta.page}
              totalPages={data.meta.totalPages}
              onPageChange={(next) => setParam('page', String(next))}
            />
          )}
        </>
      )}
    </>
  );
}
