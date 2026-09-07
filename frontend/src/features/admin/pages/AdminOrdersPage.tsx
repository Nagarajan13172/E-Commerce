import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { PackageSearch, Search } from 'lucide-react';
import { ORDER_STATUSES, type OrderStatus } from '@ecom/shared';
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
import { OrderStatusBadge } from '@/features/orders/components/OrderStatusBadge';
import { useDebouncedValue } from '@/hooks/useDebouncedValue';
import { formatCurrency, formatDate } from '@/lib/format';
import { useAdminOrders } from '../api/queries';
import { AdminTable, type Column } from '../components/AdminTable';
import type { Order } from '@/features/orders/api/orders.api';

export default function AdminOrdersPage() {
  const navigate = useNavigate();
  // Filters live in the URL so a support agent can share the exact view they
  // are looking at, and the dashboard can deep-link into "orders to fulfil".
  const [searchParams, setSearchParams] = useSearchParams();
  const [term, setTerm] = useState(searchParams.get('q') ?? '');
  const debouncedTerm = useDebouncedValue(term, 350);

  const status = searchParams.get('status') as OrderStatus | null;
  const page = Number(searchParams.get('page') ?? 1);

  const { data, isPending, isError, error, refetch, isFetching } = useAdminOrders({
    ...(debouncedTerm ? { q: debouncedTerm } : {}),
    ...(status ? { status } : {}),
    page,
  });

  const setParam = (key: string, value?: string) => {
    const next = new URLSearchParams(searchParams);
    if (value) next.set(key, value);
    else next.delete(key);
    if (key !== 'page') next.delete('page');
    setSearchParams(next);
  };

  const columns: Column<Order>[] = [
    {
      key: 'orderNumber',
      header: 'Order',
      render: (order) => (
        <div>
          <span className="font-mono text-xs font-medium">{order.orderNumber}</span>
          <p className="text-muted-foreground truncate text-xs">{order.email}</p>
        </div>
      ),
    },
    {
      key: 'date',
      header: 'Placed',
      secondary: true,
      render: (order) => (
        <span className="text-muted-foreground text-xs">
          {formatDate(order.placedAt ?? order.createdAt)}
        </span>
      ),
    },
    {
      key: 'items',
      header: 'Items',
      secondary: true,
      render: (order) => (
        <span className="text-muted-foreground text-xs tabular">
          {order.items.reduce((sum, item) => sum + item.quantity, 0)}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (order) => <OrderStatusBadge status={order.status} />,
    },
    {
      key: 'total',
      header: 'Total',
      className: 'text-right',
      render: (order) => (
        <span className="font-medium tabular">
          {formatCurrency(order.pricing.grandTotal, order.pricing.currency)}
          {order.refundedTotal > 0 && (
            <span className="text-muted-foreground block text-xs">
              −{formatCurrency(order.refundedTotal)} refunded
            </span>
          )}
        </span>
      ),
    },
  ];

  return (
    <>
      <Seo title="Orders — Admin" noIndex />

      <h1 className="mb-1 text-2xl font-semibold tracking-tight">Orders</h1>
      <p className="text-muted-foreground mb-6 text-sm tabular">
        {isPending
          ? 'Loading…'
          : `${data?.meta.total ?? 0} order${data?.meta.total === 1 ? '' : 's'}`}
      </p>

      <div className="mb-4 flex flex-wrap gap-3">
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
            placeholder="Order number, email or name"
            aria-label="Search orders"
            className="pl-9"
          />
        </div>

        <Select
          value={status ?? 'all'}
          onValueChange={(value) => setParam('status', value === 'all' ? undefined : value)}
        >
          <SelectTrigger className="w-[180px]" aria-label="Filter by status">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            {ORDER_STATUSES.map((value) => (
              <SelectItem key={value} value={value}>
                {value.replace(/_/g, ' ')}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {isError ? (
        <ErrorState error={error} onRetry={() => void refetch()} />
      ) : (
        <>
          <AdminTable
            columns={columns}
            rows={data?.data.items ?? []}
            rowKey={(order) => order._id}
            isLoading={isPending}
            isRefreshing={isFetching && !isPending}
            onRowClick={(order) => navigate(`/admin/orders/${order._id}`)}
            empty={
              <EmptyState
                icon={PackageSearch}
                title="No orders match those filters"
                description="Try a different status or clear the search."
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
