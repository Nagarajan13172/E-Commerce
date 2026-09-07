import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { AlertTriangle, Boxes, History, Loader2, Minus, Plus, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import { Pagination } from '@/features/catalog/components/Pagination';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatDateTime } from '@/lib/format';
import { useAdjustStock, useInventory, useInventoryHistory } from '../api/queries';
import { AdminTable, type Column } from '../components/AdminTable';
import type { InventoryRow } from '../api/admin.api';

export default function AdminInventoryPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [term, setTerm] = useState(searchParams.get('q') ?? '');
  const debouncedTerm = useDebouncedValue(term, 350);
  const [adjusting, setAdjusting] = useState<InventoryRow | null>(null);
  const [historyFor, setHistoryFor] = useState<InventoryRow | null>(null);

  const lowStockOnly = searchParams.get('lowStockOnly') === '1';
  const outOfStockOnly = searchParams.get('outOfStockOnly') === '1';
  const page = Number(searchParams.get('page') ?? 1);

  const { data, isPending, isError, error, refetch, isFetching } = useInventory({
    ...(debouncedTerm ? { q: debouncedTerm } : {}),
    ...(lowStockOnly ? { lowStockOnly: true } : {}),
    ...(outOfStockOnly ? { outOfStockOnly: true } : {}),
    page,
  });

  const setParam = (key: string, value?: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setSearchParams(next);
  };

  const columns: Column<InventoryRow>[] = [
    {
      key: 'product',
      header: 'Product',
      render: (row) => (
        <div className="flex items-center gap-2.5">
          <img
            src={row.thumbnail}
            alt=""
            className="bg-muted size-9 shrink-0 rounded object-cover"
            loading="lazy"
          />
          <div className="min-w-0">
            <p className="line-clamp-1 text-sm">{row.name}</p>
            <p className="text-muted-foreground font-mono text-xs">
              {row.sku}
              {row.label && ` · ${row.label}`}
            </p>
          </div>
        </div>
      ),
    },
    {
      key: 'available',
      header: 'Available',
      className: 'text-right',
      render: (row) => (
        <span
          className={
            row.available === 0
              ? 'text-destructive font-medium tabular'
              : row.available <= row.lowStockThreshold
                ? 'text-warning-foreground font-medium tabular'
                : 'tabular'
          }
        >
          {row.available}
        </span>
      ),
    },
    {
      key: 'reserved',
      header: 'Reserved',
      className: 'text-right',
      secondary: true,
      // Reserved is shown because it explains why available dropped without a
      // sale — the single most common "where did my stock go" question.
      render: (row) => <span className="text-muted-foreground tabular">{row.reserved}</span>,
    },
    {
      key: 'sold',
      header: 'Sold',
      className: 'text-right',
      secondary: true,
      render: (row) => <span className="text-muted-foreground tabular">{row.sold}</span>,
    },
    {
      key: 'state',
      header: '',
      render: (row) =>
        row.available === 0 ? (
          <Badge variant="secondary" className="bg-destructive/15 text-destructive">
            Out of stock
          </Badge>
        ) : row.available <= row.lowStockThreshold ? (
          <Badge variant="secondary" className="bg-warning/15 text-warning-foreground">
            Low
          </Badge>
        ) : null,
    },
    {
      key: 'actions',
      header: '',
      className: 'text-right',
      render: (row) => (
        <div className="flex justify-end gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setHistoryFor(row)}
            aria-label={`History for ${row.sku}`}
          >
            <History className="size-4" />
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setAdjusting(row)}>
            Adjust
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Seo title="Inventory — Admin" noIndex />

      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Inventory</h1>
      <p className="text-muted-foreground mb-6 text-sm tabular">
        {isPending
          ? 'Loading…'
          : `${data?.meta.total ?? 0} sellable unit${data?.meta.total === 1 ? '' : 's'}`}
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <div className="relative min-w-56 flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2"
            aria-hidden="true"
          />
          <Input
            value={term}
            onChange={(event) => {
              setTerm(event.target.value);
              setParam('q', event.target.value || undefined);
            }}
            placeholder="Product name or SKU"
            aria-label="Search inventory"
            className="pl-9"
          />
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="low-stock"
            checked={lowStockOnly}
            onCheckedChange={(checked) => setParam('lowStockOnly', checked ? '1' : undefined)}
          />
          <Label htmlFor="low-stock" className="text-sm font-normal">
            Low stock only
          </Label>
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="out-of-stock"
            checked={outOfStockOnly}
            onCheckedChange={(checked) => setParam('outOfStockOnly', checked ? '1' : undefined)}
          />
          <Label htmlFor="out-of-stock" className="text-sm font-normal">
            Out of stock only
          </Label>
        </div>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <>
          <AdminTable
            columns={columns}
            rows={data?.data.items ?? []}
            rowKey={(row) => `${row.productId}-${row.variantId ?? 'base'}`}
            isLoading={isPending}
            isRefreshing={isFetching && !isPending}
            empty={
              <EmptyState
                icon={Boxes}
                title="Nothing matches those filters"
                description="Try clearing the search or the stock filters."
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

      <AdjustStockDialog row={adjusting} onClose={() => setAdjusting(null)} />
      <HistoryDialog row={historyFor} onClose={() => setHistoryFor(null)} />
    </>
  );
}

/**
 * Stock adjustment.
 *
 * Takes a signed delta rather than a new total, deliberately: "+12 received
 * from supplier" is a fact that can be audited, while "set to 47" hides what
 * actually happened and races anyone else adjusting at the same moment.
 */
function AdjustStockDialog({ row, onClose }: { row: InventoryRow | null; onClose: () => void }) {
  const adjustStock = useAdjustStock();
  const [delta, setDelta] = useState(0);
  const [note, setNote] = useState('');

  if (!row) return null;

  const resulting = row.available + delta;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adjust stock</DialogTitle>
          <DialogDescription>
            {row.name}
            {row.label && ` · ${row.label}`} — currently {row.available} available
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setDelta((d) => d - 1)}
            >
              <Minus className="size-4" />
            </Button>
            <Input
              type="number"
              value={delta}
              onChange={(event) => setDelta(Number(event.target.value))}
              className="w-24 text-center tabular"
              aria-label="Change in stock"
            />
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setDelta((d) => d + 1)}
            >
              <Plus className="size-4" />
            </Button>
          </div>

          <p className="text-center text-sm">
            {row.available} → <strong className="tabular">{Math.max(0, resulting)}</strong>
          </p>

          {resulting < 0 && (
            <p className="text-destructive flex items-center justify-center gap-1.5 text-xs">
              <AlertTriangle className="size-3.5" aria-hidden="true" />
              Stock cannot go below zero
            </p>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="adjust-note">Reason (recorded in the audit trail)</Label>
            <Input
              id="adjust-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Stock take, damaged goods, supplier delivery…"
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={delta === 0 || resulting < 0 || adjustStock.isPending}
            onClick={() =>
              adjustStock.mutate(
                {
                  productId: row.productId,
                  variantId: row.variantId ?? undefined,
                  delta,
                  note: note || undefined,
                },
                { onSuccess: onClose },
              )
            }
          >
            {adjustStock.isPending && <Loader2 className="size-4 animate-spin" />}
            Apply adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The audit trail for one sellable unit. */
function HistoryDialog({ row, onClose }: { row: InventoryRow | null; onClose: () => void }) {
  const { data, isPending } = useInventoryHistory(
    row?.productId ?? '',
    row?.variantId ?? undefined,
    Boolean(row),
  );

  if (!row) return null;

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[80dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Stock history</DialogTitle>
          <DialogDescription>
            {row.name}
            {row.label && ` · ${row.label}`} — every movement, and why
          </DialogDescription>
        </DialogHeader>

        {isPending ? (
          <p className="text-muted-foreground py-6 text-center text-sm">Loading…</p>
        ) : (data?.items.length ?? 0) === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            No movements recorded yet
          </p>
        ) : (
          <ul className="divide-y">
            {data?.items.map((entry) => (
              <li key={entry._id} className="py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium capitalize">{entry.type}</span>
                  <span
                    className={
                      entry.quantity >= 0
                        ? 'text-success text-sm tabular'
                        : 'text-destructive text-sm tabular'
                    }
                  >
                    {entry.quantity >= 0 ? '+' : ''}
                    {entry.quantity}
                  </span>
                </div>
                <p className="text-muted-foreground text-xs tabular">
                  available {entry.before.available} → {entry.after.available} · reserved{' '}
                  {entry.before.reserved} → {entry.after.reserved}
                </p>
                <p className="text-muted-foreground text-xs">
                  {formatDateTime(entry.createdAt)}
                  {entry.actor?.name && ` · ${entry.actor.name}`}
                  {entry.note && ` · ${entry.note}`}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
